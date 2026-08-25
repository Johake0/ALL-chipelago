import mongoose from 'mongoose';

// One document = one COPY of a game (matches your gameID/duplicate-copy
// idea — a title wanted by 3 players can exist as 3 separate documents,
// each independently claimable, same as the old GameList row-per-interest
// design). Status is the single source of truth for where a copy "lives" —
// there is no separate curAvailGames/finGames/Inventory/ForcedList store to
// keep in sync, so the "make sure X isn't in two lists at once" problem
// from the original notes doesn't need its own check code; it's
// structurally impossible to be in two states at once.
const gameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    coinValue: { type: Number, default: 0 },
    forceReleaseCost: { type: Number, default: 0 },
    scalingTags: { type: [String], default: [] }, // e.g. ["long", "co-op-friendly"]

    status: {
      type: String,
      // 'personal_list' is reserved but currently unused: interest picks
      // are tracked via interestFor while status stays 'available', then
      // jump straight to 'in_inventory' on claim — same as the original
      // Sheet design. Kept in the enum in case you want an explicit
      // "reserved, not yet claimed" state later.
      // 'lobby' is the shared "currently being played" holding area: a
      // player moves a game here from in_inventory/forced instead of
      // completing it directly, and /api/complete only accepts games in
      // this status — see gameLoop.js's /api/lobby/* routes.
      // 'auctioning' is a Session's wheel-picked auction item while
      // bidding is open — kept out of 'available' so it can't also be
      // spun/claimed by someone else mid-auction, with no extra filtering
      // needed anywhere that already queries by status. See session.js.
      enum: ['available', 'personal_list', 'in_inventory', 'forced', 'lobby', 'auctioning', 'finished'],
      default: 'available',
      index: true
    },

    // Who currently holds this copy (in_inventory / forced / finished).
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set only while status === 'forced' — who forced it onto ownerId.
    forcedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set while status === 'personal_list' — whose free starting-pick pool this copy belongs to.
    interestFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    claimMethod: { type: String, enum: ['wheel', 'interest', null], default: null },
    released: { type: Boolean, default: false }, // true = bailed on, not a real completion
    removed: { type: Boolean, default: false },  // manual exclude from the wheel, same as the old checkbox/list

    dateAssigned: { type: Date, default: null },
    dateCompleted: { type: Date, default: null },

    // Who actually won this copy via /api/spin or /api/claim-interest, set
    // once at that moment and never touched again — an immutable pairing
    // with dateAssigned. ownerId is NOT safe to use for this: it mutates on
    // /api/trade and /api/force, so a game's "spin"/"interest" activity-feed
    // entry would silently relabel itself with whoever holds the game now
    // instead of who actually won it, while still showing the original
    // (correct) dateAssigned timestamp next to the wrong name. Same fix
    // shape as bonusOnComplete above: snapshot the fact when it becomes
    // true instead of re-deriving history from a field that changes later
    // for unrelated reasons.
    assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // True iff this copy was the owner's flagged bonus game (User.bonusGameId)
    // at the exact moment /api/complete ran — set permanently then, since the
    // flag itself is mutable and can move to a different game before payout
    // would otherwise be computed. computeUserStats needs this immutable
    // per-game record, not a live re-check of the (now possibly different)
    // current flag.
    bonusOnComplete: { type: Boolean, default: false },

    // Set on a Session member's game (original pick or an auction win) the
    // moment it occupies that session's Lobby slot — lets session.js and
    // gameLoop.js find "is anyone in this session still playing" without a
    // separate membership-to-game join table.
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    // True alongside status: 'finished' iff sessionId was set at the moment
    // of completion — computeUserStats excludes such games from
    // coins/totalEarned until this flips back to false, which happens for
    // every game in a session all at once when its last member
    // finishes/releases (see gameLoop.js). Coins are still never *stored*;
    // this only gates which finished games computeUserStats' read-time scan
    // currently counts.
    sessionPending: { type: Boolean, default: false },
    // True iff this game reached the owner's Lobby slot by winning a
    // session's Auction rather than the normal spin/interest/hold flow.
    // Drives the Bonus Game reroll trigger (b) at session close and a
    // distinct 🔨 tag in the Lobby UI.
    auctionWon: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('Game', gameSchema);
