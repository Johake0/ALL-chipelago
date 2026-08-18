import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import gameLoopRoutes from './routes/gameLoop.js';
import adminRoutes from './routes/admin.js';
import sessionRoutes from './routes/session.js';

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true // fall back to allow-all if unset, for local dev
  })
);

app.use('/api', gameLoopRoutes);
app.use('/api', adminRoutes);
app.use('/api', sessionRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Central error handler — every route's next(err) lands here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
