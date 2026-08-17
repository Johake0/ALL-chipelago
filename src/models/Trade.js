import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['trade', 'force', 'release', 'reroll', 'gift'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Only meaningful for type: 'trade'/'force'/'gift' (the other party).
    // 'release' and 'reroll' are solo actions, so this just mirrors fromUserId.
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Required for every type except 'gift' — a gift is pure coins, no game
    // involved at all.
    gameIdFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    // Only set for type: 'trade' (the game the other side gave up). A
    // 'force'/'release'/'reroll'/'gift' has no gameIdTo — it's one-directional.
    gameIdTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    // Coins fromUserId paid to make this happen. Meaningful for
    // type: 'force'/'release'/'reroll'/'gift' — computeUserStats subtracts
    // this from fromUserId's balance, and for 'gift' specifically also
    // credits it to toUserId. Also how rerollsUsedForUser counts past
    // rerolls (including the free ones, which are logged with coinCost: 0).
    coinCost: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model('Trade', tradeSchema);
