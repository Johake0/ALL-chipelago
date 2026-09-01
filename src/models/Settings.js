import mongoose from 'mongoose';

// App-wide config, not per-user/per-game — a singleton enforced the same
// way Session enforces "only one non-closed at a time": no unique index,
// just a findOne-based read/write helper (src/lib/settings.js) that never
// creates a second document. Currently just the two New Playthrough
// wizard toggles; add more fields here if other whole-playthrough options
// come up later.
const settingsSchema = new mongoose.Schema(
  {
    bonusGameEnabled: { type: Boolean, default: true },
    auctionEnabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('Settings', settingsSchema);
