import mongoose from 'mongoose';

// Deliberately NOT storing coins/streak here. Those are always derived by
// aggregating the games collection (sum of coinValue for this user's
// finished games; streak by walking finished/released games in date order).
// Same principle your Sheet formulas already used — it self-heals instead
// of letting a stored number drift out of sync with the actual game log.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    // Profile picture, stored inline (not on disk) so it survives Render's
    // ephemeral filesystem across deploys/restarts without needing a repo
    // asset or a separate storage service. `data` is select: false so it
    // never gets pulled into normal User queries (e.g. /api/state's player
    // list) — only the dedicated avatar-serving route asks for it explicitly.
    avatar: {
      data: { type: Buffer, select: false, default: null },
      contentType: { type: String, default: null }
    },
    // The single held game currently flagged as bonus-value for this player,
    // if any — a *pointer*, re-picked by the weighted lottery in
    // src/lib/bonusGame.js. Not a derived economic value like coins, so
    // storing it doesn't break the "coins/streak always derived" rule above.
    // May point to a game that's since left this user's held statuses
    // (finished/traded/forced away) — every read site treats that as
    // "unflagged" rather than clearing it eagerly; see currentBonusGame().
    bonusGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
