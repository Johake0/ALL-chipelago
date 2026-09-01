import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import http from 'node:http';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { connectDB } from './db.js';
import { envNumber } from './lib/env.js';
import { attachLiveUpdates } from './lib/liveUpdates.js';
import gameLoopRoutes from './routes/gameLoop.js';
import adminRoutes from './routes/admin.js';
import sessionRoutes from './routes/session.js';

const app = express();

// Render (and most hosts) put the app behind a reverse proxy — without
// this, every request looks like it comes from the proxy's own IP, which
// breaks per-IP rate limiting below (and express-rate-limit warns/throws
// under the strict default validation without it).
app.set('trust proxy', 1);

// Every request, including ones the rate limiter below goes on to reject —
// prints method/path/status/response-time/IP/User-Agent to stdout, which
// Render's Logs tab picks up automatically with no extra setup. Without
// this the app previously logged nothing per-request at all, so "what's
// actually hitting the API" was unanswerable after the fact.
app.use(morgan('combined'));

app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true // fall back to allow-all if unset, for local dev
  })
);

// General abuse guard on every route, including the unauthenticated
// /api/users/:id/avatar and /health — CORS alone only blocks browser JS
// from other origins, not a script/bot hitting the API directly. Routes
// that need a tighter limit (avatar) add their own on top of this.
app.use(
  rateLimit({
    windowMs: envNumber('RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000),
    limit: envNumber('RATE_LIMIT_MAX', 300),
    standardHeaders: true,
    legacyHeaders: false
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

// A plain http.Server so the WebSocket "state changed" doorbell (see
// src/lib/liveUpdates.js) can share the same port via the ws upgrade
// handshake — app.listen() alone doesn't hand back a server WebSocketServer
// can attach to.
const httpServer = http.createServer(app);
attachLiveUpdates(httpServer);

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
