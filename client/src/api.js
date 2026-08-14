const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ADMIN_SECRET_KEY = 'archipelago_admin_secret';
const PLAYER_SECRET_KEY = 'archipelago_player_secret';

export function getAdminSecret() {
  return localStorage.getItem(ADMIN_SECRET_KEY) || '';
}

export function setAdminSecret(secret) {
  localStorage.setItem(ADMIN_SECRET_KEY, secret);
}

export function clearAdminSecret() {
  localStorage.removeItem(ADMIN_SECRET_KEY);
}

export function getPlayerSecret() {
  return localStorage.getItem(PLAYER_SECRET_KEY) || '';
}

export function setPlayerSecret(secret) {
  localStorage.setItem(PLAYER_SECRET_KEY, secret);
}

export function clearPlayerSecret() {
  localStorage.removeItem(PLAYER_SECRET_KEY);
}

async function request(path, options, extraHeaders) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...options.headers,
    },
  });

  let body = null;
  const text = await res.text();
  if (text) body = JSON.parse(text);

  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

// Every admin-tool request goes through here — attaches the secret header
// and throws on non-2xx so callers can just await and catch.
export function adminFetch(path, options = {}) {
  return request(path, options, { 'x-admin-secret': getAdminSecret() });
}

// Player-facing endpoints (state/spin/complete/claim-interest/trade/force)
// are gated behind the shared player passphrase, not the admin one.
export function publicFetch(path, options = {}) {
  return request(path, options, { 'x-player-secret': getPlayerSecret() });
}

// Avatar images are served unauthenticated (see the backend route) since
// <img> tags can't attach the secret header — this just builds the URL.
export function avatarUrl(userId) {
  return `${API_URL}/api/users/${userId}/avatar`;
}

// FormData uploads can't go through request() — it always forces a JSON
// Content-Type, which breaks multipart's auto-generated boundary. Browsers
// set the correct Content-Type themselves as long as we never set one here.
export async function adminUploadAvatar(userId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_URL}/api/users/${userId}/avatar`, {
    method: 'POST',
    headers: { 'x-admin-secret': getAdminSecret() },
    body: formData
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}
