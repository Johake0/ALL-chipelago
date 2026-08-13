import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['trade', 'force'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameIdFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    // Only set for type: 'trade' (the game the other side gave up). A
    // 'force' has no gameIdTo — it's one-directional.
    gameIdTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null }
  },
  { timestamps: true }
);

export default mongoose.model('Trade', tradeSchema);
