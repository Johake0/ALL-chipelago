import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import XLSX from 'xlsx';
import Game from '../models/Game.js';
import User from '../models/User.js';
import Trade from '../models/Trade.js';
import Session from '../models/Session.js';
import { requireAdmin } from './admin.js';
import { updateSettings } from '../lib/settings.js';
import { broadcastStateChanged } from '../lib/liveUpdates.js';

const router = express.Router();

// Admin-only, so more generous than the 3MB public-facing avatar cap — a
// full multi-sheet Archipelago Games Sheet export is realistically well
// under 1MB, this just gives headroom.
const CATALOG_MAX_BYTES = 10 * 1024 * 1024;
const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CATALOG_MAX_BYTES },
  fileFilter(req, file, cb) {
    const isXlsxType = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isXlsxName = file.originalname?.toLowerCase().endsWith('.xlsx');
    if (!isXlsxType && !isXlsxName) {
      return cb(new Error('Expected an .xlsx file.'));
    }
    cb(null, true);
  }
});

// ---------------------------------------------------------------------
// POST /playthrough/parse — multipart upload, field name "file". Reads
// only the "Playable Worlds" sheet of an Archipelago Games Sheet export
// (not "Core-Verified Worlds", a duplicate subset, and not "Tools, Meta
// Games, & Hint Games", which aren't completable games at all) and
// returns a candidate list — writes nothing to the DB. Cross-references
// each candidate's name against the CURRENT catalog so the wizard's coin
// value inputs can prefill from whatever that game is already worth,
// same one request instead of a second round trip.
// ---------------------------------------------------------------------
router.post('/playthrough/parse', requireAdmin, (req, res, next) => {
  catalogUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided (field name "file").' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets['Playable Worlds'];
    if (!sheet) return res.status(400).json({ error: 'Expected a "Playable Worlds" sheet — check this is an Archipelago Games Sheet export.' });

    // Row 0 is instructional text, row 1 is the real header row
    // (Game, Stability, PR Status, 18+ / Unrated, ...) — data starts at
    // row 2. Column order matches GAME/STABILITY/UNRATED indices below.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(2);
    const GAME = 0, STABILITY = 1, UNRATED = 3;

    const candidates = rows
      .filter((row) => row[GAME])
      .map((row) => ({
        name: String(row[GAME]).trim(),
        stability: row[STABILITY] || null,
        unrated: !!row[UNRATED]
      }));

    const currentGames = await Game.find({}).select('name coinValue').lean();
    const coinValueByName = new Map(currentGames.map((g) => [g.name.toLowerCase(), g.coinValue]));
    for (const c of candidates) {
      const match = coinValueByName.get(c.name.toLowerCase());
      c.currentCoinValue = match ?? null;
    }

    res.json({ candidates });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /playthrough/confirm — the destructive step. Wipes Trade/Session/
// Game entirely, reconciles the User roster against the submitted list
// (kept players keep their avatar, just get username/bonusGameId reset;
// removed players are deleted; new entries are created), writes the two
// feature toggles, and creates the new catalog. All in one transaction —
// same "consequential multi-document write" precedent as /api/trade,
// /api/complete, /api/session/ready.
// body: { games: [{name, coinValue}], roster: [{id, username}],
//         freePicks: [{gameName, rosterIndex}], bonusGameEnabled, auctionEnabled }
// freePicks mirrors the old Excel sheet's "each player picks a few free
// starting games" step — same mechanism as the existing Free Interest
// Picks feature (Game.interestFor + POST /api/claim-interest), just
// pre-assigned here instead of starting empty. rosterIndex (not a user
// id) is how the frontend refers to a not-yet-created player — ids for
// brand new roster entries don't exist until the roster reconciliation
// below runs, so games have to be built AFTER that, not before.
// ---------------------------------------------------------------------
router.post('/playthrough/confirm', requireAdmin, async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const { games, roster, freePicks, bonusGameEnabled, auctionEnabled } = req.body;
    if (!Array.isArray(games) || games.length === 0) {
      return res.status(400).json({ error: 'At least one game is required.' });
    }
    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ error: 'At least one player is required.' });
    }

    await mongoSession.withTransaction(async () => {
      await Trade.deleteMany({}, { session: mongoSession });
      await Session.deleteMany({}, { session: mongoSession });
      await Game.deleteMany({}, { session: mongoSession });

      const currentUsers = await User.find({}).select('_id').session(mongoSession);
      const keptIds = new Set(roster.filter((p) => p.id).map((p) => String(p.id)));
      const removedIds = currentUsers.map((u) => u._id).filter((id) => !keptIds.has(String(id)));
      if (removedIds.length > 0) {
        await User.deleteMany({ _id: { $in: removedIds } }, { session: mongoSession });
      }

      // Parallel to `roster` — resolvedRosterIds[i] is the real _id for
      // roster[i], whether kept (existing) or brand new (just created).
      const resolvedRosterIds = [];
      for (const p of roster) {
        if (p.id) {
          await User.findByIdAndUpdate(p.id, { username: p.username, bonusGameId: null }, { session: mongoSession });
          resolvedRosterIds.push(p.id);
        } else {
          const [created] = await User.create([{ username: p.username }], { session: mongoSession });
          resolvedRosterIds.push(created._id);
        }
      }

      const interestByName = new Map();
      for (const fp of freePicks || []) {
        const userId = resolvedRosterIds[fp.rosterIndex];
        if (userId) interestByName.set(fp.gameName, userId);
      }

      await Game.insertMany(
        games.map((g) => ({
          name: g.name,
          coinValue: Number(g.coinValue) || 0,
          forceReleaseCost: (Number(g.coinValue) || 0) * 4,
          status: 'available',
          interestFor: interestByName.get(g.name) || null
        })),
        { session: mongoSession }
      );

      await updateSettings({ bonusGameEnabled: !!bonusGameEnabled, auctionEnabled: !!auctionEnabled }, mongoSession);
    });

    broadcastStateChanged();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    mongoSession.endSession();
  }
});

export default router;
