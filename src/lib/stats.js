import Game from '../models/Game.js';
import Trade from '../models/Trade.js';

const INVENTORY_SIZE = 10;
const FREE_INTEREST_PICKS = 3;
const FREE_REROLLS = 5;
const REROLL_BASE_COST = 500;
const REROLL_STEP = 150;

/**
 * Computes a user's coins, streak, and longest streak purely from their
 * finished/released games — mirrors the intent of your Sheet's formulas.
 * Streak logic (best-effort reconstruction, adjust if your Sheet's rule
 * differed): walk a user's finished-or-released games in date order;
 * each real completion (released: false) extends the streak, each
 * released game resets it to 0. Longest streak is the max seen along the way.
 */
export async function computeUserStats(userId) {
  const [history, coinCosts] = await Promise.all([
    Game.find({ ownerId: userId, status: 'finished' }).sort({ dateCompleted: 1 }).lean(),
    Trade.find({ type: { $in: ['force', 'release', 'reroll'] }, fromUserId: userId }).lean()
  ]);

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

  coins -= coinCosts.reduce((sum, t) => sum + (t.coinCost || 0), 0);

  return { coins, streak, longestStreak };
}

export async function rerollsUsedForUser(userId) {
  return Trade.countDocuments({ fromUserId: userId, type: 'reroll' });
}

// rerollNumber is 1-indexed (the 1st reroll ever = 1). The first
// FREE_REROLLS are free; after that it's a base cost plus REROLL_STEP for
// each reroll past the free ones (6th = 500+150, 7th = 500+300, ...).
export function rerollCost(rerollNumber) {
  if (rerollNumber <= FREE_REROLLS) return 0;
  return REROLL_BASE_COST + REROLL_STEP * (rerollNumber - FREE_REROLLS);
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

export const LIMITS = { INVENTORY_SIZE, FREE_INTEREST_PICKS, FREE_REROLLS, REROLL_BASE_COST, REROLL_STEP };
