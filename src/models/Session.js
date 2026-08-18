import mongoose from 'mongoose';

// Only one non-'closed' Session may exist at a time (checked at query time
// wherever a new one would be created — same "invariant enforced by a
// findOne guard, not a unique index" approach as the rest of this codebase,
// e.g. the "already has a forced game pending" / "already in lobby" checks
// in gameLoop.js). Created lazily by the first POST /api/lobby/add once no
// current Session exists — see that route.
const auctionSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    status: { type: String, enum: ['open', 'resolved', 'no_interest'], default: 'open' },
    openedAt: { type: Date, default: null },
    currentMinimum: { type: Number, default: 0 },
    // 10..100 while bidding ramps in fixed steps; null once it's reached
    // 100% and become open (raise-by-any-amount) bidding.
    stepPercent: { type: Number, default: 10 },
    // Reset every ramp round. Both are ignored once stepPercent is null —
    // open bidding isn't round-gated, it just runs until one bidder remains.
    metUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    droppedOutUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    winnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winningPrice: { type: Number, default: null }
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'auction', 'active', 'closed'], default: 'pending', index: true },
    // Snapshotted at lock-in — the fixed player set for this session, same
    // way real Archipelago multiworld generation fixes its player set.
    memberUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Only meaningful while status === 'pending'.
    readyUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    auction: { type: auctionSchema, default: null },
    closedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export default mongoose.model('Session', sessionSchema);
