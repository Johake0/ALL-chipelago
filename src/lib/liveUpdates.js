import { WebSocketServer, WebSocket } from 'ws';

// "Doorbell" pattern, not a data channel: every mutating route calls
// broadcastStateChanged() after it writes, which just tells connected
// clients "something changed, go re-fetch" — it never carries the actual
// state payload. GET /api/state stays the single source of truth and every
// existing computation in gameLoop.js/stats.js is untouched; this only
// replaces the client's 15s timer as the trigger to call it. If a client's
// socket is down for any reason, its own polling fallback still works
// exactly as before — this is additive, not a replacement.
const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30000;

let wss = null;

export function attachLiveUpdates(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.authenticated = false;

    // Auth happens over the first message, not a query-string secret —
    // a query string would land in the request URL that morgan now logs
    // (see src/server.js), which would leak PLAYER_SECRET into Render's
    // logs. A browser WebSocket can't send custom headers either, so a
    // first-message handshake is the option that keeps the secret out of
    // anything logged.
    const authTimeout = setTimeout(() => {
      if (!socket.authenticated) socket.close(4001, 'Auth timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('message', (raw) => {
      if (socket.authenticated) return; // only the first message is ever used for auth
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        socket.close(4002, 'Bad auth message');
        return;
      }
      if (msg?.type === 'auth' && process.env.PLAYER_SECRET && msg.secret === process.env.PLAYER_SECRET) {
        socket.authenticated = true;
        clearTimeout(authTimeout);
        socket.send(JSON.stringify({ type: 'auth-ok' }));
      } else {
        socket.close(4003, 'Invalid secret');
      }
    });

    socket.on('pong', () => {
      socket.isAlive = true;
    });
  });

  // Drops dead connections (network dropped without a clean close) so they
  // don't sit in wss.clients forever — standard ws heartbeat pattern.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  wss.on('close', () => clearInterval(heartbeat));
}

export function broadcastStateChanged() {
  if (!wss) return;
  const message = JSON.stringify({ type: 'state-changed' });
  for (const socket of wss.clients) {
    if (socket.authenticated && socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}
