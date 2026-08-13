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
      enum: ['available', 'personal_list', 'in_inventory', 'forced', 'finished'],
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
    dateCompleted: { type: Date, default: null }
  },
  { timestamps: true }
);

export default mongoose.model('Game', gameSchema);
