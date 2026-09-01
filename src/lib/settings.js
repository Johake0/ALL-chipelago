import Settings from '../models/Settings.js';

const DEFAULTS = { bonusGameEnabled: true, auctionEnabled: true };

// Tolerates no document existing yet (falls back to DEFAULTS) rather than
// creating one on every read — a Settings doc only ever gets created via
// updateSettings, e.g. when the New Playthrough wizard's confirm step runs.
export async function getSettings() {
  const doc = await Settings.findOne().lean();
  return doc ? { bonusGameEnabled: doc.bonusGameEnabled, auctionEnabled: doc.auctionEnabled } : DEFAULTS;
}

export async function updateSettings(patch, mongoSession) {
  return Settings.findOneAndUpdate({}, patch, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    session: mongoSession
  });
}
