import mongoose from 'mongoose';

// Deliberately NOT storing coins/streak here. Those are always derived by
// aggregating the games collection (sum of coinValue for this user's
// finished games; streak by walking finished/released games in date order).
// Same principle your Sheet formulas already used — it self-heals instead
// of letting a stored number drift out of sync with the actual game log.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
