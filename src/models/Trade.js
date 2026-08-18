import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['trade', 'force', 'release', 'reroll', 'gift', 'auction'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Only meaningful for type: 'trade'/'force'/'gift' (the other party).
    // 'release'/'reroll'/'auction' are solo actions, so this just mirrors
    // fromUserId.
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Required for every type except 'gift' — a gift is pure coins, no game
    // involved at all. For 'auction' this is the won game.
    gameIdFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    // Only set for type: 'trade' (the game the other side gave up). Every
    // other type has no gameIdTo — it's one-directional.
    gameIdTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    // Coins fromUserId paid to make this happen. Meaningful for
    // type: 'force'/'release'/'reroll'/'gift'/'auction' — computeUserStats
    // subtracts this from fromUserId's balance, and for 'gift' specifically
    // also credits it to toUserId. Also how rerollsUsedForUser counts past
    // rerolls (including the free ones, which are logged with coinCost: 0).
    // For 'auction', only ever the single winning bid — losing bids never
    // create a Trade at all, since nothing was ever actually charged.
    coinCost: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model('Trade', tradeSchema);
