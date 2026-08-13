import Game from '../models/Game.js';

const INVENTORY_SIZE = 10;
const FREE_INTEREST_PICKS = 3;

/**
 * Computes a user's coins, streak, and longest streak purely from their
 * finished/released games — mirrors the intent of your Sheet's formulas.
 * Streak logic (best-effort reconstruction, adjust if your Sheet's rule
 * differed): walk a user's finished-or-released games in date order;
 * each real completion (released: false) extends the streak, each
 * released game resets it to 0. Longest streak is the max seen along the way.
 */
export async function computeUserStats(userId) {
  const history = await Game.find({
    ownerId: userId,
    status: 'finished'
  })
    .sort({ dateCompleted: 1 })
    .lean();

  let coins = 0;
  let streak = 0;
  let longestStreak = 0;

  for (const game of history) {
    if (game.released) {
      streak = 0;
    } else {
      coins += game.coinValue || 0;
      streak += 1;
      if (streak > longestStreak) longestStreak = streak;
    }
  }

  return { coins, streak, longestStreak };
}

export async function inventoryCountForUser(userId) {
  return Game.countDocuments({
    ownerId: userId,
    status: { $in: ['in_inventory'] }
  });
}

export async function freeClaimsUsedForUser(userId) {
  return Game.countDocuments({
    ownerId: userId,
    claimMethod: 'interest'
  });
}

export const LIMITS = { INVENTORY_SIZE, FREE_INTEREST_PICKS };
