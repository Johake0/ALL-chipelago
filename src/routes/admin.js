import express from 'express';
import multer from 'multer';
import User from '../models/User.js';
import Game from '../models/Game.js';

const router = express.Router();

const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3MB — plenty for a profile photo, keeps User docs small
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported image type — use PNG, JPEG, WEBP, or GIF.'));
    }
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  next();
}

// ----- Users: create / modify (rename) / delete -----

router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'username is required.' });
    const user = await User.create({ username: username.trim() });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That username already exists.' });
    next(err);
  }
});

router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const { username } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { username }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /users/:id/avatar — multipart upload (field name "avatar"), replaces
// whatever avatar the user already had. Image bytes are stored inline on
// the User document rather than on disk — see the User model for why.
router.post('/users/:id/avatar', requireAdmin, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided (field name "avatar").' });
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { avatar: { data: req.file.buffer, contentType: req.file.mimetype } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id/avatar', requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { avatar: { data: null, contentType: null } }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /users — full list, for populating owner/forcedBy/interestFor pickers
// in the admin tool and for the Users tab itself.
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find().lean();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    // Deliberately NOT cascading to that user's games — they stay owned by
    // a now-missing user rather than silently vanishing. Reassign or clear
    // ownerId by hand (or via a future dedicated endpoint) if you want them
    // returned to the pool instead.
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ----- Games: add / edit / remove from the list -----

// GET /games — full unfiltered dump of every game (unlike the public
// /api/state, this includes removed/forced/finished games too), with
// owner/forcedBy/interestFor populated to usernames. This is the audit/
// override view: the data the manual-correction tool is built on.
router.get('/games', requireAdmin, async (req, res, next) => {
  try {
    const games = await Game.find()
      .populate('ownerId', 'username')
      .populate('forcedByUserId', 'username')
      .populate('interestFor', 'username')
      .lean();
    res.json(games);
  } catch (err) {
    next(err);
  }
});

router.post('/games', requireAdmin, async (req, res, next) => {
  try {
    const { name, coinValue, forceReleaseCost, scalingTags, interestFor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
    const game = await Game.create({
      name: name.trim(),
      coinValue: coinValue || 0,
      forceReleaseCost: forceReleaseCost || 0,
      scalingTags: scalingTags || [],
      interestFor: interestFor || null
    });
    res.status(201).json(game);
  } catch (err) {
    next(err);
  }
});

// Full override surface — this is what the manual-correction tool needs to
// fix records that didn't transfer correctly from the Sheet: not just the
// static fields (name/coinValue/etc.) but who owns a copy and what state
// it's in.
const OVERRIDABLE_FIELDS = [
  'name', 'coinValue', 'forceReleaseCost', 'scalingTags', 'removed',
  'status', 'ownerId', 'forcedByUserId', 'interestFor', 'claimMethod',
  'released', 'dateAssigned', 'dateCompleted', 'sessionId', 'sessionPending',
  'auctionWon', 'bonusOnComplete', 'assignedToId'
];

router.patch('/games/:id', requireAdmin, async (req, res, next) => {
  try {
    const updates = {};
    for (const field of OVERRIDABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    const game = await Game.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json(game);
  } catch (err) {
    if (err.name === 'CastError' || err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.delete('/games/:id', requireAdmin, async (req, res, next) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
