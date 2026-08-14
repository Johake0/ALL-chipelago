import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['trade', 'force', 'release', 'reroll'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Only meaningful for type: 'trade'/'force' (the other party). 'release'
    // and 'reroll' are solo actions, so this just mirrors fromUserId.
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameIdFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    // Only set for type: 'trade' (the game the other side gave up). A
    // 'force'/'release'/'reroll' has no gameIdTo — it's one-directional.
    gameIdTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    // Coins fromUserId paid to make this happen. Meaningful for
    // type: 'force'/'release'/'reroll' — computeUserStats subtracts this
    // from their balance. Also how rerollsUsedForUser counts past rerolls
    // (including the free ones, which are logged with coinCost: 0).
    coinCost: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model('Trade', tradeSchema);
