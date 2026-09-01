import express from 'express';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import Session from '../models/Session.js';
import Trade from '../models/Trade.js';
import { requirePlayerSecret } from './gameLoop.js';
import { resolveAuctionNoInterest } from '../lib/sessionAuction.js';
import { envNumber } from '../lib/env.js';
import { broadcastStateChanged } from '../lib/liveUpdates.js';
import { getSettings } from '../lib/settings.js';

const router = express.Router();

const RAMP_STEP = 10;
const RAMP_CAP = 100;
// Minimum ready Lobby members required to lock a session in — a session of
// 1 is meaningless in practice (see CLAUDE.md's session lifecycle notes).
const MIN_SESSION_SIZE = envNumber('MIN_SESSION_SIZE', 2);

function idsEqual(a, b) {
  return String(a) === String(b);
}

// ---------------------------------------------------------------------
// POST /api/session/ready  { userId, ready }
// Toggles readiness for the pending session's current Lobby members.
// When the last unready member readies up (2+ total), locks the session in
// atomically: snapshots membership, tags every member's current Lobby game
// with sessionId, and spins the wheel among 'available' games to open the
// mandatory Auction. The "you're last, starting the auction — proceed?"
// confirmation is handled client-side from already-visible state before
// this is called; this endpoint just needs to be safe against two
// near-simultaneous last-readier clicks, which the single transaction
// below (mark ready + check-everyone-ready + lock-in, all guarded
// together) prevents — same rationale /api/trade's transaction documents.
// ---------------------------------------------------------------------
router.post('/session/ready', requirePlayerSecret, async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const { userId, ready } = req.body;
    let result;

    await mongoSession.withTransaction(async () => {
      if (ready) {
        const hasLobbyGame = await Game.findOne({ ownerId: userId, status: 'lobby' }).session(mongoSession);
        if (!hasLobbyGame) throw new Error('You need a game in the Lobby before you can ready up.');
      }

      const dbSession = await Session.findOne({ status: 'pending' }).session(mongoSession);
      if (!dbSession) throw new Error('No pending session to ready up for.');

      const alreadyReady = dbSession.readyUserIds.some((id) => idsEqual(id, userId));
      if (ready && !alreadyReady) dbSession.readyUserIds.push(userId);
      if (!ready && alreadyReady) dbSession.readyUserIds = dbSession.readyUserIds.filter((id) => !idsEqual(id, userId));

      const lobbyMembers = await Game.find({ status: 'lobby' }).session(mongoSession);
      const memberIds = lobbyMembers.map((g) => g.ownerId);
      const readySet = new Set(dbSession.readyUserIds.map(String));
      const allReady = memberIds.length >= MIN_SESSION_SIZE && memberIds.every((id) => readySet.has(String(id)));

      if (allReady) {
        dbSession.memberUserIds = memberIds;
        await Game.updateMany(
          { _id: { $in: lobbyMembers.map((g) => g._id) } },
          { $set: { sessionId: dbSession._id } },
          { session: mongoSession }
        );

        const { auctionEnabled } = await getSettings();
        const candidates = auctionEnabled
          ? await Game.find({ status: 'available', removed: false }).session(mongoSession)
          : [];
        if (candidates.length > 0) {
          const auctionGame = candidates[Math.floor(Math.random() * candidates.length)];
          auctionGame.status = 'auctioning';
          await auctionGame.save({ session: mongoSession });

          dbSession.status = 'auction';
          dbSession.auction = {
            gameId: auctionGame._id,
            status: 'open',
            openedAt: new Date(),
            currentMinimum: Math.round((auctionGame.coinValue || 0) * 0.1),
            stepPercent: RAMP_STEP,
            metUserIds: [],
            droppedOutUserIds: [],
            winnerUserId: null,
            winningPrice: null
          };
        } else {
          // Nothing left to auction — proceed straight to an active
          // session with everyone playing what they already brought in.
          dbSession.status = 'active';
        }
      }

      await dbSession.save({ session: mongoSession });
      result = { ok: true, locked: allReady };
    });

    broadcastStateChanged();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    mongoSession.endSession();
  }
});

// ---------------------------------------------------------------------
// POST /api/session/bid  { userId, action, amount? }
// action: 'meet' | 'dropout' during the fixed-step ramp (stepPercent set),
// 'raise' (with amount) | 'dropout' once open bidding (stepPercent null).
// Dropping out is permanent for the rest of this auction. 'meet' only
// applies to the current round — it resets each time the minimum climbs,
// since meeting round N's minimum doesn't imply meeting round N+1's higher
// one. See src/lib/sessionAuction.js for the shared no-bidders resolution.
// ---------------------------------------------------------------------
router.post('/session/bid', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, action, amount } = req.body;

    const dbSession = await Session.findOne({ status: 'auction' });
    if (!dbSession?.auction || dbSession.auction.status !== 'open') {
      return res.status(400).json({ error: 'No open auction right now.' });
    }
    const { auction } = dbSession;

    if (!dbSession.memberUserIds.some((id) => idsEqual(id, userId))) {
      return res.status(403).json({ error: 'Only session members can bid in this auction.' });
    }
    if (auction.droppedOutUserIds.some((id) => idsEqual(id, userId))) {
      return res.status(400).json({ error: "You've already dropped out of this auction." });
    }

    const activeBefore = dbSession.memberUserIds.filter(
      (id) => !auction.droppedOutUserIds.some((d) => idsEqual(d, id))
    );
    if (activeBefore.length <= 1) {
      return res.status(400).json({ error: 'Only one bidder remains — use finalize instead of bidding.' });
    }

    const rampPhase = auction.stepPercent != null;

    if (rampPhase) {
      if (action === 'dropout') {
        auction.droppedOutUserIds.push(userId);
      } else if (action === 'meet') {
        if (!auction.metUserIds.some((id) => idsEqual(id, userId))) auction.metUserIds.push(userId);
      } else {
        return res.status(400).json({ error: "This auction is still in fixed rounds — use 'meet' or 'dropout'." });
      }
    } else {
      if (action === 'dropout') {
        auction.droppedOutUserIds.push(userId);
      } else if (action === 'raise') {
        const parsedAmount = Number(amount);
        if (!Number.isInteger(parsedAmount) || parsedAmount <= auction.currentMinimum) {
          return res.status(400).json({ error: `Raise must be a whole number greater than the current ${auction.currentMinimum}.` });
        }
        auction.currentMinimum = parsedAmount;
      } else {
        return res.status(400).json({ error: "This auction is in open bidding — use 'raise' or 'dropout'." });
      }
    }

    const activeAfter = dbSession.memberUserIds.filter(
      (id) => !auction.droppedOutUserIds.some((d) => idsEqual(d, id))
    );

    if (activeAfter.length === 0) {
      await resolveAuctionNoInterest(dbSession);
      broadcastStateChanged();
      return res.json({ ok: true, resolved: 'no_interest' });
    }

    if (rampPhase && activeAfter.length >= 2) {
      const roundComplete = activeAfter.every((id) => auction.metUserIds.some((m) => idsEqual(m, id)));
      if (roundComplete) {
        const nextStep = auction.stepPercent + RAMP_STEP;
        if (nextStep > RAMP_CAP) {
          auction.stepPercent = null; // open bidding from here
        } else {
          auction.stepPercent = nextStep;
          const auctionGame = await Game.findById(auction.gameId);
          auction.currentMinimum = Math.round((auctionGame?.coinValue || 0) * (nextStep / 100));
        }
        auction.metUserIds = [];
      }
    }
    // activeAfter.length === 1 needs no state change here — that sole
    // bidder's client shows "Finalize Price" from this same state and
    // calls POST /api/session/finalize-bid.

    await dbSession.save();
    broadcastStateChanged();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/session/finalize-bid  { userId }
// Only valid when userId is the sole remaining active bidder (mid-ramp or
// in open bidding — "at any point," per the settled design). Resolves the
// auction in their favor at the current minimum: no affordability check
// here, deliberately — see the settled design's "no house" note; unlike
// every other spend route in this codebase, overspending on a win is the
// bidder's own problem, not something this needs to guard against.
// ---------------------------------------------------------------------
router.post('/session/finalize-bid', requirePlayerSecret, async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const { userId } = req.body;
    let result;

    await mongoSession.withTransaction(async () => {
      const dbSession = await Session.findOne({ status: 'auction' }).session(mongoSession);
      if (!dbSession?.auction || dbSession.auction.status !== 'open') {
        throw new Error('No open auction right now.');
      }
      const { auction } = dbSession;

      const active = dbSession.memberUserIds.filter((id) => !auction.droppedOutUserIds.some((d) => idsEqual(d, id)));
      if (active.length !== 1 || !idsEqual(active[0], userId)) {
        throw new Error('You are not the sole remaining bidder.');
      }

      const auctionGame = await Game.findById(auction.gameId).session(mongoSession);
      if (!auctionGame) throw new Error('Auction game not found.');

      // The winner's original session game returns to their hold — it's
      // not lost, the won game just takes its place in their session slot.
      const winnerLobbyGame = await Game.findOne({ ownerId: userId, status: 'lobby', sessionId: dbSession._id }).session(mongoSession);
      if (winnerLobbyGame) {
        winnerLobbyGame.status = winnerLobbyGame.forcedByUserId ? 'forced' : 'in_inventory';
        winnerLobbyGame.sessionId = null;
        await winnerLobbyGame.save({ session: mongoSession });
      }

      auctionGame.status = 'lobby';
      auctionGame.ownerId = userId;
      auctionGame.auctionWon = true;
      auctionGame.sessionId = dbSession._id;
      auctionGame.dateAssigned = new Date();
      await auctionGame.save({ session: mongoSession });

      await Trade.create(
        [{ type: 'auction', fromUserId: userId, toUserId: userId, gameIdFrom: auctionGame._id, coinCost: auction.currentMinimum }],
        { session: mongoSession }
      );

      auction.status = 'resolved';
      auction.winnerUserId = userId;
      auction.winningPrice = auction.currentMinimum;
      dbSession.status = 'active';
      await dbSession.save({ session: mongoSession });

      result = { ok: true, game: auctionGame.name, price: auction.currentMinimum };
    });

    broadcastStateChanged();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    mongoSession.endSession();
  }
});

export default router;
