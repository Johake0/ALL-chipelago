import Game from '../models/Game.js';
import Trade from '../models/Trade.js';

const INVENTORY_SIZE = 10;
const FREE_INTEREST_PICKS = 3;
const FREE_REROLLS = 5;
const REROLL_BASE_COST = 500;
const REROLL_STEP = 150;

// Streak payout curve. Each real completion pays coinValue times a
// multiplier that grows with the current streak (capped so a very long
// streak can't inflate payouts without bound), and every MILESTONE_INTERVALth
// consecutive completion pays a flat bonus on top that itself escalates —
// the multiplier alone goes quiet past the cap, so this keeps a long streak
// still meaningfully better than a short one. Calibrated against the real
// catalog: avg coinValue ~206, avg forceReleaseCost ~824 (always exactly 4x
// coinValue) — MILESTONE_BASE lands right around one average completion's
// worth, so a milestone reads as "one free extra game" rather than an
// arbitrary number.
const STREAK_MULTIPLIER_RATE = 0.05;
const STREAK_MULTIPLIER_CAP = 10;
const MILESTONE_INTERVAL = 5;
const MILESTONE_BASE = 200;
const MILESTONE_STEP = 20;

/**
 * Computes a user's coins, streak, and longest streak purely from their
 * finished/released games — mirrors the intent of your Sheet's formulas.
 * Streak logic (best-effort reconstruction, adjust if your Sheet's rule
 * differed): walk a user's finished-or-released games in date order;
 * each real completion (released: false) extends the streak, each
 * released game resets it to 0. Longest streak is the max seen along the way.
 * Since this is recomputed from the full log every time (never stored), the
 * payout curve below applies retroactively to existing history too — a
 * player's coin total will jump the first time this runs against their
 * existing completions, not just on future ones.
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
      streak += 1;
      if (streak > longestStreak) longestStreak = streak;

      const multiplier = 1 + STREAK_MULTIPLIER_RATE * Math.min(streak, STREAK_MULTIPLIER_CAP);
      coins += Math.round((game.coinValue || 0) * multiplier);

      if (streak % MILESTONE_INTERVAL === 0) {
        const milestoneNumber = streak / MILESTONE_INTERVAL;
        coins += MILESTONE_BASE + MILESTONE_STEP * (milestoneNumber - 1);
      }
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
