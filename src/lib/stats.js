import Game from '../models/Game.js';
import Trade from '../models/Trade.js';
import { BONUS_MULTIPLIER } from './bonusGame.js';

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
// Shared walk over a user's finished-game history — both computeUserStats
// (totals only) and gamePayoutBreakdown (the activity feed's per-game
// coin math) need the exact same streak/bonus/milestone logic applied in
// the same order, so this is the one place that logic lives.
async function walkHistory(userId) {
  const history = await Game.find({ ownerId: userId, status: 'finished' }).sort({ dateCompleted: 1 }).lean();

  let totalEarned = 0;
  let streak = 0;
  let longestStreak = 0;
  const perGame = new Map();

  for (const game of history) {
    if (game.released) {
      streak = 0;
    } else if (game.sessionPending) {
      // Finished as part of a Session that hasn't fully closed yet (not
      // every member has finished/released their own game) — its payout
      // and streak contribution are held back entirely until then. Nothing
      // is stored here either way: once closeSessionIfDone clears
      // sessionPending (src/lib/sessionAuction.js), this same game is
      // picked up on the very next read, in its correct chronological spot,
      // same as any other change to this loop applying retroactively.
      // (sessionPending also gets set on a *released* Session game now, for
      // inventoryCountForUser's hold-capacity check and the Lobby's stasis
      // display — but that never reaches this branch, since `released` is
      // checked first above, so it has no effect on coins/streak either way.)
    } else {
      streak += 1;
      if (streak > longestStreak) longestStreak = streak;

      const base = game.coinValue || 0;
      const multiplier = 1 + STREAK_MULTIPLIER_RATE * Math.min(streak, STREAK_MULTIPLIER_CAP);
      const bonusApplied = !!game.bonusOnComplete;
      const bonusFactor = bonusApplied ? BONUS_MULTIPLIER : 1;
      // streakBonus is a display-only decomposition of the multiplier into
      // an additive "extra coins from streak" line (e.g. 200 base @ 1.25x
      // -> +50 streak bonus) — the real payout below is still computed the
      // original way (one Math.round over the combined multiplier), so this
      // can differ from the real payout by up to a coin on odd coinValues.
      const streakBonus = Math.round(base * multiplier) - base;
      const payout = Math.round(base * multiplier * bonusFactor);

      let milestoneBonus = 0;
      if (streak % MILESTONE_INTERVAL === 0) {
        const milestoneNumber = streak / MILESTONE_INTERVAL;
        milestoneBonus = MILESTONE_BASE + MILESTONE_STEP * (milestoneNumber - 1);
      }

      const total = payout + milestoneBonus;
      totalEarned += total;
      perGame.set(String(game._id), { streak, base, streakBonus, bonusApplied, milestoneBonus, total });
    }
  }

  return { totalEarned, streak, longestStreak, perGame };
}

export async function computeUserStats(userId) {
  const [walked, coinCosts, giftsReceived] = await Promise.all([
    walkHistory(userId),
    // Gifts sent are subtracted the same way force/release/reroll/auction
    // costs are — fromUserId paid coinCost to make this happen either way.
    Trade.find({ type: { $in: ['force', 'release', 'reroll', 'gift', 'auction'] }, fromUserId: userId }).lean(),
    Trade.find({ type: 'gift', toUserId: userId }).lean()
  ]);

  const { totalEarned, streak, longestStreak } = walked;

  // totalEarned is a pure lifetime-earnings figure (leaderboard "coins
  // earned" bragging stat) — it only ever grows, unaffected by spending or
  // gifts in either direction, so it can't be inflated by hoarding/gifting
  // games between friends. coins is the actual spendable balance: costs
  // (including gifts sent) get subtracted, gifts received get added — none
  // of that touches totalEarned.
  const spent = coinCosts.reduce((sum, t) => sum + (t.coinCost || 0), 0);
  const received = giftsReceived.reduce((sum, t) => sum + (t.coinCost || 0), 0);
  const coins = totalEarned - spent + received;

  return { coins, streak, longestStreak, totalEarned };
}

// Per-game coin breakdown (streak bonus, milestone, bonus-game multiplier)
// for the activity feed's "why did this payout come to X coins" display.
// Keyed by game id string; only contains real (non-released, non-pending)
// completions, since those are the only ones that ever paid out.
export async function gamePayoutBreakdown(userId) {
  const { perGame } = await walkHistory(userId);
  return perGame;
}

export async function rerollsUsedForUser(userId) {
  return Trade.countDocuments({ fromUserId: userId, type: 'reroll' });
}

// How many times this player has forced a game onto someone else — a
// leaderboard stat, not used for any limit/cost logic.
export async function timesForcedForUser(userId) {
  return Trade.countDocuments({ fromUserId: userId, type: 'force' });
}

// rerollNumber is 1-indexed (the 1st reroll ever = 1). The first
// FREE_REROLLS are free; after that it's a base cost plus REROLL_STEP for
// each reroll past the free ones (6th = 500+150, 7th = 500+300, ...).
export function rerollCost(rerollNumber) {
  if (rerollNumber <= FREE_REROLLS) return 0;
  return REROLL_BASE_COST + REROLL_STEP * (rerollNumber - FREE_REROLLS);
}

export async function inventoryCountForUser(userId) {
  // Includes 'lobby' so moving a game to the lobby doesn't free up a hold
  // slot to spin an extra game with — it's still a copy the player is
  // committed to, just displayed in a different area while it's actively
  // being played. ('forced' is deliberately excluded, same as before: a
  // forced game is imposed outside the normal hold-cap flow.)
  // Also counts finished/released games still sessionPending — i.e.
  // finishing or releasing your own Session game doesn't free a hold slot
  // (or let you spin again) until the whole Session actually closes, same
  // "stasis" the Lobby display holds everyone in — see the Lobby & Sessions
  // note in CLAUDE.md.
  return Game.countDocuments({
    ownerId: userId,
    $or: [
      { status: { $in: ['in_inventory', 'lobby'] } },
      { status: 'finished', sessionPending: true }
    ]
  });
}

export async function freeClaimsUsedForUser(userId) {
  return Game.countDocuments({
    ownerId: userId,
    claimMethod: 'interest'
  });
}

export const LIMITS = { INVENTORY_SIZE, FREE_INTEREST_PICKS, FREE_REROLLS, REROLL_BASE_COST, REROLL_STEP };
