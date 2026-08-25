import express from 'express';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import User from '../models/User.js';
import Trade from '../models/Trade.js';
import Session from '../models/Session.js';
import { computeUserStats, inventoryCountForUser, freeClaimsUsedForUser, rerollsUsedForUser, rerollCost, timesForcedForUser, gamePayoutBreakdown, LIMITS } from '../lib/stats.js';
import { maybeRerollOnHoldRefill, currentBonusGame } from '../lib/bonusGame.js';
import { resolveStaleAuction, closeSessionIfDone } from '../lib/sessionAuction.js';

const router = express.Router();

// Gates state/spin/complete/claim-interest/trade/force behind a shared
// player passphrase — same speed-bump philosophy as ADMIN_SECRET, just for
// "which friends can touch the game state at all" rather than "who can
// override records." /reset has its own separate admin check instead.
// Applied per-route (not via router.use()) because gameLoop.js and admin.js
// are both mounted at '/api' in server.js — a blanket router-level
// middleware here would intercept admin.js's requests too before they ever
// got a chance to match there.
export function requirePlayerSecret(req, res, next) {
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
    await resolveStaleAuction();

    const [users, availableGames] = await Promise.all([
      User.find().lean(),
      Game.find({ status: 'available', removed: false }).lean()
    ]);

    const players = await Promise.all(
      users.map(async (user) => {
        const [inventory, forceSlotDoc, completedGames, stats, inventoryCount, freeClaimsUsed, rerollsUsed, timesForced, bonusGame] = await Promise.all([
          Game.find({ ownerId: user._id, status: 'in_inventory' }).lean(),
          Game.findOne({ ownerId: user._id, status: 'forced' }).lean(),
          Game.find({ ownerId: user._id, status: 'finished' }).lean(),
          computeUserStats(user._id),
          inventoryCountForUser(user._id),
          freeClaimsUsedForUser(user._id),
          rerollsUsedForUser(user._id),
          timesForcedForUser(user._id),
          currentBonusGame(user._id)
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
          timesForced,
          bonusGameId: bonusGame?._id ?? null,
          ...stats // coins, streak, longestStreak, totalEarned
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
    // Also includes Session members who've already finished/released their
    // own game but whose Session hasn't closed yet (still sessionPending) —
    // kept visible with playState so the group can see who's still holding
    // things up, instead of a member's row just vanishing the moment they
    // act. Ungrouped (non-Session) finishes/releases still leave 'lobby'
    // immediately as before, since sessionPending never gets set for them.
    const lobbyGames = await Game.find({
      $or: [{ status: 'lobby' }, { status: 'finished', sessionPending: true }]
    }).populate('ownerId', 'username').lean();
    const lobby = lobbyGames.map((g) => ({
      id: g._id,
      game: g.name,
      ownerId: g.ownerId?._id,
      ownerName: g.ownerId?.username,
      coinValue: g.coinValue,
      forceReleaseCost: g.forceReleaseCost,
      auctionWon: g.auctionWon,
      playState: g.status === 'lobby' ? 'playing' : (g.released ? 'released' : 'finished')
    }));

    // Session/Auction — null when no session is pending/active. The client
    // needs enough here to render ready-up state and a live auction
    // without polling any new endpoint beyond this one (see
    // useGameState.js's faster polling while auction.status === 'open').
    const dbSession = await Session.findOne({ status: { $ne: 'closed' } }).lean();
    let session = null;
    if (dbSession) {
      let auctionInfo = null;
      if (dbSession.auction?.gameId) {
        const auctionGame = await Game.findById(dbSession.auction.gameId).lean();
        if (auctionGame) auctionInfo = { id: auctionGame._id, name: auctionGame.name, coinValue: auctionGame.coinValue };
      }
      session = {
        id: dbSession._id,
        status: dbSession.status,
        memberUserIds: dbSession.memberUserIds,
        readyUserIds: dbSession.readyUserIds,
        auction: dbSession.auction
          ? {
              game: auctionInfo,
              status: dbSession.auction.status,
              openedAt: dbSession.auction.openedAt,
              currentMinimum: dbSession.auction.currentMinimum,
              stepPercent: dbSession.auction.stepPercent,
              metUserIds: dbSession.auction.metUserIds,
              droppedOutUserIds: dbSession.auction.droppedOutUserIds,
              winnerUserId: dbSession.auction.winnerUserId,
              winningPrice: dbSession.auction.winningPrice
            }
          : null
      };
    }

    res.json({
      games: availableGames.map((g) => ({ id: g._id, name: g.name })),
      players,
      lobby,
      session,
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
    winner.assignedToId = user._id;
    winner.claimMethod = 'wheel';
    winner.dateAssigned = new Date();
    await winner.save();

    await maybeRerollOnHoldRefill(userId, count, count + 1);

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
    game.assignedToId = user._id;
    game.claimMethod = 'interest';
    game.dateAssigned = new Date();
    await game.save();

    await maybeRerollOnHoldRefill(userId, count, count + 1);

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
// If this game belongs to an active Session, its payout is held back
// (sessionPending) until every member of that session has wrapped up
// theirs — see closeSessionIfDone in src/lib/sessionAuction.js and the
// exclusion in computeUserStats.
// ---------------------------------------------------------------------
router.post('/complete', requirePlayerSecret, async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const { userId, gameId } = req.body;
    let result;

    await mongoSession.withTransaction(async () => {
      const game = await Game.findOne({ _id: gameId, ownerId: userId, status: 'lobby' }).session(mongoSession);
      if (!game) throw new Error('That game is not in the lobby for this player. Add it to the lobby first.');

      const bonus = await currentBonusGame(userId);
      game.bonusOnComplete = !!(bonus && String(bonus._id) === String(game._id));

      game.status = 'finished';
      game.dateCompleted = new Date();
      if (game.sessionId) game.sessionPending = true;
      await game.save({ session: mongoSession });

      if (game.sessionId) await closeSessionIfDone(game.sessionId, mongoSession);

      result = { ok: true, game: game.name };
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    mongoSession.endSession();
  }
});

// ---------------------------------------------------------------------
// POST /api/lobby/add  { userId, gameId }
// Moves a held (or forced) game into the shared lobby, where it can later
// be marked finished or returned to the hold. Capped at one lobby entry
// per player at a time — the lobby represents "the one game you're
// actively playing with the group right now."
// Also the point a pending Session starts existing at all: if none is
// currently open, one is created here (status: 'pending') the moment the
// first player adds a game. If a session further along than 'pending'
// already exists (locked in via /api/session/ready), new members can't
// join it — matches real Archipelago multiworld generation fixing its
// player set at generation time.
// ---------------------------------------------------------------------
router.post('/lobby/add', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;

    const alreadyInLobby = await Game.findOne({ ownerId: userId, status: 'lobby' });
    if (alreadyInLobby) {
      return res.status(400).json({ error: `You already have "${alreadyInLobby.name}" in the lobby — finish or return it first.` });
    }

    let currentSession = await Session.findOne({ status: { $ne: 'closed' } });
    if (currentSession && currentSession.status !== 'pending') {
      return res.status(400).json({ error: 'A session is already in progress — wait for it to close before joining the Lobby.' });
    }
    if (!currentSession) {
      currentSession = await Session.create({ status: 'pending' });
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
// cleared once a game has been forced onto someone. Only reachable before
// a session locks in (once locked, this game's status is held at 'lobby'
// by the session itself until finished/released) — also clears any stale
// ready-up vote so the pending session's "who's ready" list doesn't show a
// checkmark for someone who backed out without explicitly un-readying.
// ---------------------------------------------------------------------
router.post('/lobby/return', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, gameId } = req.body;
    const game = await Game.findOne({ _id: gameId, ownerId: userId, status: 'lobby' });
    if (!game) return res.status(404).json({ error: 'That game is not in the lobby for this player.' });

    game.status = game.forcedByUserId ? 'forced' : 'in_inventory';
    await game.save();

    await Session.updateOne({ status: 'pending', readyUserIds: userId }, { $pull: { readyUserIds: userId } });

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
// POST /api/gift  { userId, targetUserId, amount }
// Straight coin transfer, no game involved. Logged as a Trade like every
// other coin movement — computeUserStats subtracts it from the sender and
// adds it to the recipient, so there's no separate balance to keep in sync.
// ---------------------------------------------------------------------
router.post('/gift', requirePlayerSecret, async (req, res, next) => {
  try {
    const { userId, targetUserId, amount } = req.body;
    if (userId === targetUserId) return res.status(400).json({ error: "Can't gift yourself." });

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Gift amount must be a positive whole number.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Unknown target player.' });

    const { coins } = await computeUserStats(userId);
    if (coins < parsedAmount) {
      return res.status(400).json({ error: `You only have ${coins} coins.` });
    }

    await Trade.create({ type: 'gift', fromUserId: userId, toUserId: targetUserId, coinCost: parsedAmount });

    res.json({ ok: true });
  } catch (err) {
    next(err);
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
// Bails on a held (forced-on-you, or currently-in-the-Lobby) game the same
// way /complete does, but marked released: no coins earned, streak resets,
// and it costs the same coins as forcing that copy would — deducted the
// same way force is. Releasing from 'lobby' status is allowed, deliberately
// — see CLAUDE.md's Lobby note — even for a game that's part of an active
// Session. A released game earns nothing, so sessionPending has no effect
// on its coins/streak (computeUserStats checks `released` first and never
// even looks at sessionPending for it) — but it's still set here anyway,
// for the same "stasis" reasons a finished session game needs it:
// inventoryCountForUser keeps counting it toward the hold cap, and the
// Lobby stays showing it (with a ❌) instead of it vanishing, both until
// closeSessionIfDone's "is anyone still playing" check clears the whole
// Session at once.
// ---------------------------------------------------------------------
router.post('/release', requirePlayerSecret, async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const { userId, gameId } = req.body;
    let result;

    await mongoSession.withTransaction(async () => {
      const game = await Game.findOne({
        _id: gameId,
        ownerId: userId,
        status: { $in: ['in_inventory', 'forced', 'lobby'] }
      }).session(mongoSession);
      if (!game) throw new Error('That game is not in progress for this player.');

      const { coins } = await computeUserStats(userId);
      if (coins < game.forceReleaseCost) {
        throw new Error(`Releasing "${game.name}" costs ${game.forceReleaseCost} coins — you only have ${coins}.`);
      }

      const sessionId = game.sessionId;
      game.status = 'finished';
      game.released = true;
      game.dateCompleted = new Date();
      if (sessionId) game.sessionPending = true;
      await game.save({ session: mongoSession });

      await Trade.create(
        [{ type: 'release', fromUserId: userId, toUserId: userId, gameIdFrom: game._id, coinCost: game.forceReleaseCost }],
        { session: mongoSession }
      );

      if (sessionId) await closeSessionIfDone(sessionId, mongoSession);

      result = { ok: true, game: game.name };
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    mongoSession.endSession();
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
// GET /api/activity — recent events, newest first. Not a stored log — it's
// assembled on read from data that already exists: Game.dateAssigned for
// spin/interest claims, Game.dateCompleted (released: false) for finishes,
// and the Trade collection for trade/force/release/reroll (which already
// logs each of those with a timestamp). Each source query is capped at
// LIMIT before merging, which is enough — the eventual top LIMIT globally
// can never need more than LIMIT from any single source.
// ---------------------------------------------------------------------
router.get('/activity', requirePlayerSecret, async (req, res, next) => {
  try {
    const LIMIT = 50;

    const [assignedGames, finishedGames, trades] = await Promise.all([
      Game.find({ dateAssigned: { $ne: null } }).sort({ dateAssigned: -1 }).limit(LIMIT).populate('assignedToId', 'username').lean(),
      // sessionPending: false — a finish inside a still-open Session has its
      // coins held back (see computeUserStats), so the feed holds the event
      // back too rather than showing "+coins" before they're actually
      // available. It appears the moment closeSessionIfDone clears the
      // flag, still carrying its real dateCompleted, so it lands in correct
      // chronological order once revealed rather than jumping the queue.
      Game.find({ status: 'finished', released: false, sessionPending: false }).sort({ dateCompleted: -1 }).limit(LIMIT).populate('ownerId', 'username').lean(),
      Trade.find({ type: { $in: ['trade', 'force', 'release', 'reroll', 'auction'] } })
        .sort({ createdAt: -1 })
        .limit(LIMIT)
        .populate('fromUserId', 'username')
        .populate('toUserId', 'username')
        .populate('gameIdFrom', 'name')
        .populate('gameIdTo', 'name')
        .lean()
    ]);

    // Coin breakdown for finish events is derived per-owner (the walk is a
    // per-user streak reconstruction, same as computeUserStats), so batch
    // it to one walk per distinct owner rather than one per finished game.
    const ownerIds = [...new Set(finishedGames.filter((g) => g.ownerId).map((g) => String(g.ownerId._id)))];
    const breakdownsByOwner = new Map(
      await Promise.all(ownerIds.map(async (id) => [id, await gamePayoutBreakdown(id)]))
    );

    const events = [];

    for (const g of assignedGames) {
      // assignedToId is who actually won it (immutable) — NOT g.ownerId,
      // which mutates on trade/force and would silently relabel this event
      // with the game's current holder. Also skips games spun/claimed
      // before this field existed (assignedToId wasn't backfilled), rather
      // than show a wrong actor for them.
      if (!g.assignedToId) continue;
      events.push({
        type: g.claimMethod === 'interest' ? 'interest' : 'spin',
        at: g.dateAssigned,
        actor: g.assignedToId.username,
        game: g.name
      });
    }

    for (const g of finishedGames) {
      if (!g.ownerId) continue;
      const breakdown = breakdownsByOwner.get(String(g.ownerId._id))?.get(String(g._id));
      events.push({
        type: 'finish',
        at: g.dateCompleted,
        actor: g.ownerId.username,
        game: g.name,
        coinValue: g.coinValue,
        breakdown: breakdown || null
      });
    }

    for (const t of trades) {
      // A referenced user/game can go missing if it was later deleted (no
      // cascading cleanup on delete — see CLAUDE.md's "Not built yet").
      // populate() resolves those to null, so skip rather than show a
      // broken "undefined did X" line in the feed.
      if (!t.fromUserId || !t.gameIdFrom) continue;
      if (t.type === 'trade' && (!t.toUserId || !t.gameIdTo)) continue;
      if (t.type === 'force' && !t.toUserId) continue;

      if (t.type === 'trade') {
        events.push({
          type: 'trade',
          at: t.createdAt,
          actor: t.fromUserId?.username,
          target: t.toUserId?.username,
          game: t.gameIdFrom?.name,
          targetGame: t.gameIdTo?.name
        });
      } else {
        // force/release/reroll/auction all share the same one-directional shape
        events.push({
          type: t.type,
          at: t.createdAt,
          actor: t.fromUserId?.username,
          target: t.type === 'force' ? t.toUserId?.username : undefined,
          game: t.gameIdFrom?.name,
          coinCost: t.coinCost
        });
      }
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ events: events.slice(0, LIMIT) });
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
        $set: {
          status: 'available', ownerId: null, forcedByUserId: null, claimMethod: null, released: false,
          dateAssigned: null, dateCompleted: null, bonusOnComplete: false, assignedToId: null,
          sessionId: null, sessionPending: false, auctionWon: false
        }
      }
    );
    await User.updateMany({}, { $set: { bonusGameId: null } });
    await Trade.deleteMany({});
    await Session.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
