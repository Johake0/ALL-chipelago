import express from 'express';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import User from '../models/User.js';
import Trade from '../models/Trade.js';
import { computeUserStats, inventoryCountForUser, freeClaimsUsedForUser, rerollsUsedForUser, rerollCost, LIMITS } from '../lib/stats.js';

const router = express.Router();

// Gates state/spin/complete/claim-interest/trade/force behind a shared
// player passphrase — same speed-bump philosophy as ADMIN_SECRET, just for
// "which friends can touch the game state at all" rather than "who can
// override records." /reset has its own separate admin check instead.
// Applied per-route (not via router.use()) because gameLoop.js and admin.js
// are both mounted at '/api' in server.js — a blanket router-level
// middleware here would intercept admin.js's requests too before they ever
// got a chance to match there.
function requirePlayerSecret(req, res, next) {
  if (!process.env.PLAYER_SECRET || req.headers['x-player-secret'] !== process.env.PLAYER_SECRET) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  next();
}

// ---------------------------------------------------------------------
// GET /api/users/:id/avatar — deliberately public, no secret check.
// <img> tags can't attach custom headers, and these are just friend-group
// profile photos, not sensitive game state.
// ---------------------------------------------------------------------
router.get('/users/:id/avatar', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+avatar.data');
    if (!user?.avatar?.data) return res.status(404).end();
    res.set('Content-Type', user.avatar.contentType);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(user.avatar.data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// GET /api/state — everything the frontend needs in one call, same shape
// as the old Apps Script getState() response.
// ---------------------------------------------------------------------
router.get('/state', requirePlayerSecret, async (req, res, next) => {
  try {
    const [users, availableGames] = await Promise.all([
      User.find().lean(),
      Game.find({ status: 'available', removed: false }).lean()
    ]);

    const players = await Promise.all(
      users.map(async (user) => {
        const [inventory, forceSlotDoc, completedGames, stats, inventoryCount, freeClaimsUsed, rerollsUsed] = await Promise.all([
          Game.find({ ownerId: user._id, status: 'in_inventory' }).lean(),
          Game.findOne({ ownerId: user._id, status: 'forced' }).lean(),
          Game.find({ ownerId: user._id, status: 'finished' }).lean(),
          computeUserStats(user._id),
          inventoryCountForUser(user._id),
          freeClaimsUsedForUser(user._id),
          rerollsUsedForUser(user._id)
        ]);

        return {
          id: user._id,
          name: user.username,
          hasAvatar: !!user.avatar?.contentType,
          avatarUpdatedAt: user.updatedAt,
          inventory: inventory.map((g) => ({ id: g._id, game: g.name, forceReleaseCost: g.forceReleaseCost })),
          inventoryCount,
          inventoryFull: inventoryCount >= LIMITS.INVENTORY_SIZE,
          forceSlot: forceSlotDoc ? { id: forceSlotDoc._id, game: forceSlotDoc.name, forceReleaseCost: forceSlotDoc.forceReleaseCost } : null,
          completedGames: completedGames.map((g) => ({
            id: g._id,
            game: g.name,
            coinValue: g.coinValue,
            status: g.released ? 'released' : 'completed'
          })),
          interestPicksAvailable: [], // filled in below, per-user
          freeClaimsRemaining: Math.max(0, LIMITS.FREE_INTEREST_PICKS - freeClaimsUsed),
          rerollsUsed,
          nextRerollCost: rerollCost(rerollsUsed + 1),
          ...stats // coins, streak, longestStreak
        };
      })
    );

    // Free interest picks: games still 'available' whose interestFor matches a user.
    const interestCandidates = await Game.find({
      status: 'available',
      removed: false,
      interestFor: { $ne: null }
    }).lean();

    for (const player of players) {
      player.interestPicksAvailable = interestCandidates
        .filter((g) => String(g.interestFor) === String(player.id))
        .map((g) => ({ id: g._id, game: g.name }));
    }

    // Shared lobby — every player's currently-in-progress-together game,
    // visible site-wide (not scoped to the requesting player) since it's a
    // shared "who's playing what right now" area for a 2-4 player session.
    const lobbyGames = await Game.find({ status: 'lobby' }).populate('ownerId', 'username').lean();
    const lobby = lobbyGames.map((g) => ({
      id: g._id,
      game: g.name,
      ownerId: g.ownerId?._id,
      ownerName: g.ownerId?.username,
      coinValue: g.coinValue,
      forceReleaseCost: g.forceReleaseCost
    }));

    res.json({
      games: availableGames.map((g) => ({ id: g._id, name: g.name })),
      players,
      lobby,
      inventorySize: LIMITS.INVENTORY_SIZE,
      freeRerolls: LIMITS.FREE_REROLLS,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/spin  { userId }
// ---------------------------------------------------------------------
router.post('/spin', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Unknown user.' });

    const count = await inventoryCountForUser(userId);
    if (count >= LIMITS.INVENTORY_SIZE) {
      return res.status(400).json({ error: `${user.username}'s hold is already full (${LIMITS.INVENTORY_SIZE}/${LIMITS.INVENTORY_SIZE}).` });
    }

    const candidates = await Game.find({ status: 'available', removed: false });
    if (candidates.length === 0) {
      return res.status(400).json({ error: 'No games left in the pool!' });
    }

    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    winner.status = 'in_inventory';
    winner.ownerId = user._id;
    winner.claimMethod = 'wheel';
    winner.dateAssigned = new Date();
    await winner.save();

    res.json({ winner: winner.name, winnerId: winner._id });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/claim-interest  { userId, gameId }
// ---------------------------------------------------------------------
router.post('/claim-interest', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Unknown user.' });

    const count = await inventoryCountForUser(userId);
    if (count >= LIMITS.INVENTORY_SIZE) {
      return res.status(400).json({ error: `${user.username}'s hold is already full.` });
    }

    const used = await freeClaimsUsedForUser(userId);
    if (used >= LIMITS.FREE_INTEREST_PICKS) {
      return res.status(400).json({ error: `${user.username} has already used all ${LIMITS.FREE_INTEREST_PICKS} free starting picks.` });
    }

    const game = await Game.findOne({ _id: gameId, status: 'available', removed: false, interestFor: user._id });
    if (!game) return res.status(404).json({ error: 'That game is not an available interest pick for this player.' });

    game.status = 'in_inventory';
    game.ownerId = user._id;
    game.claimMethod = 'interest';
    game.dateAssigned = new Date();
    await game.save();

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/complete  { userId, gameId }
// Only accepts games already in the shared lobby — a player has to move a
// game there first (POST /api/lobby/add) before it can be marked finished.
// This is a deliberate two-step flow (not just a UI nicety) so a stray
// click on a hold item can never finish the wrong game outright.
// ---------------------------------------------------------------------
router.post('/complete', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const game = await Game.findOne({
      _id: gameId,
      ownerId: userId,
      status: 'lobby'
    });
    if (!game) return res.status(404).json({ error: 'That game is not in the lobby for this player. Add it to the lobby first.' });

    game.status = 'finished';
    game.dateCompleted = new Date();
    await game.save();

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/lobby/add  { userId, gameId }
// Moves a held (or forced) game into the shared lobby, where it can later
// be marked finished or returned to the hold. Capped at one lobby entry
// per player at a time — the lobby represents "the one game you're
// actively playing with the group right now."
// ---------------------------------------------------------------------
router.post('/lobby/add', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;

    const alreadyInLobby = await Game.findOne({ ownerId: userId, status: 'lobby' });
    if (alreadyInLobby) {
      return res.status(400).json({ error: `You already have "${alreadyInLobby.name}" in the lobby — finish or return it first.` });
    }

    const game = await Game.findOne({
      _id: gameId,
      ownerId: userId,
      status: { $in: ['in_inventory', 'forced'] }
    });
    if (!game) return res.status(404).json({ error: 'That game is not in your hold.' });

    game.status = 'lobby';
    await game.save();

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/lobby/return  { userId, gameId }
// Pulls a game back out of the lobby into the hold, for "wrong game,
// didn't mean to add that" recoveries. Restores 'forced' rather than
// 'in_inventory' if forcedByUserId is set, since that field is never
// cleared once a game has been forced onto someone.
// ---------------------------------------------------------------------
router.post('/lobby/return', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const game = await Game.findOne({ _id: gameId, ownerId: userId, status: 'lobby' });
    if (!game) return res.status(404).json({ error: 'That game is not in the lobby for this player.' });

    game.status = game.forcedByUserId ? 'forced' : 'in_inventory';
    await game.save();

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/trade  { userId, gameId, targetUserId, targetGameId }
// Straight 1-for-1 ownership swap between two currently-in-hold games.
// ---------------------------------------------------------------------
router.post('/trade', requirePlayerSecret, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { userId, gameId, targetUserId, targetGameId } = req.body;
    if (userId === targetUserId) return res.status(400).json({ error: "Can't trade with yourself." });

    let result;
    await session.withTransaction(async () => {
      const gameA = await Game.findOne({ _id: gameId, ownerId: userId, status: 'in_inventory' }).session(session);
      const gameB = await Game.findOne({ _id: targetGameId, ownerId: targetUserId, status: 'in_inventory' }).session(session);
      if (!gameA || !gameB) throw new Error('One of those games is not available to trade.');

      gameA.ownerId = targetUserId;
      gameA.claimMethod = 'wheel';
      gameB.ownerId = userId;
      gameB.claimMethod = 'wheel';
      await gameA.save({ session });
      await gameB.save({ session });

      await Trade.create([{ type: 'trade', fromUserId: userId, toUserId: targetUserId, gameIdFrom: gameA._id, gameIdTo: gameB._id }], { session });
      result = { ok: true };
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

// ---------------------------------------------------------------------
// POST /api/force  { userId, gameId, targetUserId }
// Forcing costs the forcer game.forceReleaseCost coins, deducted via a
// Trade log entry (see computeUserStats) rather than a stored balance.
// ---------------------------------------------------------------------
router.post('/force', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId, targetUserId } = req.body;
    if (userId === targetUserId) return res.status(400).json({ error: "Can't force yourself." });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Unknown target player.' });

    const existingForce = await Game.findOne({ ownerId: targetUserId, status: 'forced' });
    if (existingForce) {
      return res.status(400).json({ error: `${targetUser.username} already has a forced game pending — they need to finish it first.` });
    }

    const game = await Game.findOne({ _id: gameId, ownerId: userId, status: 'in_inventory' });
    if (!game) return res.status(404).json({ error: 'That game is not in your hold.' });

    const { coins } = await computeUserStats(userId);
    if (coins < game.forceReleaseCost) {
      return res.status(400).json({ error: `Forcing "${game.name}" costs ${game.forceReleaseCost} coins — you only have ${coins}.` });
    }

    game.status = 'forced';
    game.ownerId = targetUserId;
    game.forcedByUserId = userId;
    await game.save();

    await Trade.create({ type: 'force', fromUserId: userId, toUserId: targetUserId, gameIdFrom: game._id, coinCost: game.forceReleaseCost });

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/release  { userId, gameId }
// Bails on a held (or forced-on-you) game the same way /complete does, but
// marked released: no coins earned, streak resets, and it costs the same
// coins as forcing that copy would — deducted the same way force is.
// ---------------------------------------------------------------------
router.post('/release', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const game = await Game.findOne({
      _id: gameId,
      ownerId: userId,
      status: { $in: ['in_inventory', 'forced'] }
    });
    if (!game) return res.status(404).json({ error: 'That game is not in progress for this player.' });

    const { coins } = await computeUserStats(userId);
    if (coins < game.forceReleaseCost) {
      return res.status(400).json({ error: `Releasing "${game.name}" costs ${game.forceReleaseCost} coins — you only have ${coins}.` });
    }

    game.status = 'finished';
    game.released = true;
    game.dateCompleted = new Date();
    await game.save();

    await Trade.create({ type: 'release', fromUserId: userId, toUserId: userId, gameIdFrom: game._id, coinCost: game.forceReleaseCost });

    res.json({ ok: true, game: game.name });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/reroll  { userId, gameId }
// Puts a held game back into the wheel pool as a plain available copy
// (clears interestFor too, so it doesn't resurface as anyone's free pick).
// First LIMITS.FREE_REROLLS are free per player, then scaling coin cost —
// see rerollCost() in stats.js. Every reroll (even free ones) is logged so
// the count persists across requests.
// ---------------------------------------------------------------------
router.post('/reroll', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const game = await Game.findOne({ _id: gameId, ownerId: userId, status: 'in_inventory' });
    if (!game) return res.status(404).json({ error: 'That game is not in your hold.' });

    const used = await rerollsUsedForUser(userId);
    const cost = rerollCost(used + 1);

    const { coins } = await computeUserStats(userId);
    if (coins < cost) {
      return res.status(400).json({ error: `Rerolling "${game.name}" costs ${cost} coins — you only have ${coins}.` });
    }

    game.status = 'available';
    game.ownerId = null;
    game.claimMethod = null;
    game.forcedByUserId = null;
    game.interestFor = null;
    game.dateAssigned = null;
    await game.save();

    await Trade.create({ type: 'reroll', fromUserId: userId, toUserId: userId, gameIdFrom: game._id, coinCost: cost });

    res.json({ ok: true, game: game.name, cost });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// POST /api/reset — wipes ALL progress. Requires the admin secret header.
// ---------------------------------------------------------------------
router.post('/reset', async (req, res, next) => {
  try {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Not authorized.' });
    }
    await Game.updateMany(
      {},
      {
        $set: { status: 'available', ownerId: null, forcedByUserId: null, claimMethod: null, released: false, dateAssigned: null, dateCompleted: null }
      }
    );
    await Trade.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
