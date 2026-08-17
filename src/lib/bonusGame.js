import Game from '../models/Game.js';
import User from '../models/User.js';

export const BONUS_MULTIPLIER = 1.5;
const WEIGHT_RATE = 0.5;
const WEIGHT_CAP = 4;
// Same statuses inventoryCountForUser's 'lobby' inclusion covers, plus
// 'forced' — a bonus flag should follow a game through its whole held
// lifecycle, including while it's sitting in the shared Lobby.
export const HELD_STATUSES = ['in_inventory', 'forced', 'lobby'];
// Trigger (a)'s threshold — see maybeRerollOnHoldRefill.
const REFILL_THRESHOLD = 9;

// Runs the weighted lottery among userId's currently held games and stores
// the winner on User.bonusGameId. Weight per game grows with how many of the
// player's OTHER games they've finished since this one was assigned — a
// pure ordering comparison against existing timestamps, not elapsed real
// time (a multi-day group break shouldn't inflate every held game's
// "staleness" equally). Capped at WEIGHT_CAP so a long-neglected game is
// nudged toward, never guaranteed.
export async function pickBonusGame(userId) {
  const [candidates, finished] = await Promise.all([
    Game.find({ ownerId: userId, status: { $in: HELD_STATUSES } }).lean(),
    Game.find({ ownerId: userId, status: 'finished' }).select('dateCompleted').lean()
  ]);

  if (candidates.length === 0) {
    await User.findByIdAndUpdate(userId, { bonusGameId: null });
    return null;
  }

  const weighted = candidates.map((g) => {
    const gamesCompletedSinceAdded = g.dateAssigned
      ? finished.filter((f) => f.dateCompleted && f.dateCompleted > g.dateAssigned).length
      : 0;
    const weight = Math.min(1 + WEIGHT_RATE * gamesCompletedSinceAdded, WEIGHT_CAP);
    return { id: g._id, weight };
  });

  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  let winner = weighted[weighted.length - 1].id;
  for (const w of weighted) {
    if (roll < w.weight) {
      winner = w.id;
      break;
    }
    roll -= w.weight;
  }

  await User.findByIdAndUpdate(userId, { bonusGameId: winner });
  return winner;
}

// Trigger (a): call after a spin/claim-interest addition succeeds, passing
// the held count immediately before and after that one addition.
// Trigger (b) — a Lobby session ending where the player took the auctioned
// game instead of their original pick — isn't gated on hold count at all,
// so it isn't routed through this function; it calls pickBonusGame directly
// once the Auction/Session system exists (see POST /api/session/done).
export async function maybeRerollOnHoldRefill(userId, countBefore, countAfter) {
  if (countBefore < REFILL_THRESHOLD && countAfter >= REFILL_THRESHOLD) {
    await pickBonusGame(userId);
  }
}

// Live-validity check: is User.bonusGameId currently pointing at a game this
// user actually still holds? Returns the Game doc or null. Used for both
// display (GET /api/state) and the POST /api/complete payout check.
export async function currentBonusGame(userId) {
  const user = await User.findById(userId).select('bonusGameId').lean();
  if (!user?.bonusGameId) return null;
  return Game.findOne({ _id: user.bonusGameId, ownerId: userId, status: { $in: HELD_STATUSES } }).lean();
}
