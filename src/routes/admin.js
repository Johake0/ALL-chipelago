import express from 'express';
import User from '../models/User.js';
import Game from '../models/Game.js';

const router = express.Router();

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

router.patch('/games/:id', requireAdmin, async (req, res, next) => {
  try {
    const allowedFields = ['name', 'coinValue', 'forceReleaseCost', 'scalingTags', 'removed'];
    const updates = {};
    for (const field of allowedFields) {
      if (field in req.body) updates[field] = req.body[field];
    }
    const game = await Game.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json(game);
  } catch (err) {
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
