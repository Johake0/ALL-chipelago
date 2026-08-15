# Archipelago Randomizer — project context

## What this is
A group project to randomly assign Archipelago randomizer games to a
friend group, with a coin/reroll economy, trading, and forced games.
Originally built on Google Sheets + Apps Script + a static `index.html`
frontend; now a real Node/Express/MongoDB backend plus a React (Vite)
frontend, both live-deployed. The full game rules (streak multiplier,
milestone bonuses, force/release/reroll costs, limits table) are written
up in `README.md` — that's the source of truth for the economy, this file
is about how the code implements it.

## Repo layout
- `src/` — Express API (`server.js`, `db.js`, `models/`, `routes/`, `lib/stats.js`).
- `scripts/importFromSheet.js` — one-time Sheet → Mongo migration (see below).
- `client/` — React + Vite frontend (`src/player/`, `src/admin/`), deployed
  to GitHub Pages by `.github/workflows/deploy-client.yml` on every push to
  `main` that touches `client/**`. Built with `VITE_API_URL` pointed at the
  live Render API (`https://ar-chipelago.onrender.com`).
- Root `package.json` is the API's; `client/package.json` is the frontend's
  — two separate `npm install`s, two separate dependency trees.

## Current architecture decisions
- **Backend/DB stack:** Node.js + Express + Mongoose + MongoDB Atlas (free
  tier), deployed on Render (free tier — spins down on inactivity, first
  request after idle is slow).
- **Frontend stack:** React + Vite, deployed static to GitHub Pages.
  `PlayerApp` (`/`) and `AdminApp` (`/admin/*`) are separate route trees in
  `App.jsx`, each gated by its own passphrase (see auth below).
- **Schema shape:** a single `games` collection with a `status` field
  (`available`, `personal_list` [reserved, unused], `in_inventory`,
  `forced`, `finished`) — NOT separate collections per state. One document
  per game *copy* (a title wanted by 3 players can exist as 3 separate
  documents). This avoids needing manual cross-table consistency checks;
  a copy is structurally incapable of being in two states at once.
- **Coins/streak/longestStreak are never stored** — always computed from
  the game log on read (`computeUserStats` in `src/lib/stats.js`),
  mirroring how the old Sheet's formulas worked. Coin costs from
  force/release/reroll are logged to a `Trade` collection and subtracted
  at read time rather than debited from a stored balance.
- **Streak payout curve** (implemented in `stats.js`, tunable via the
  constants at its top): each real completion pays
  `coinValue × (1 + 0.05 × min(streak, 10))` (caps at 1.5x), plus every
  5th consecutive completion adds a flat milestone bonus of
  `200 + 20 × (milestone# − 1)`. Calibrated against the real catalog's
  average coinValue (~206) so a milestone reads as "one free extra game."
- **Google Sheet status:** kept as a frozen backup, not live-synced. The
  migration (`scripts/importFromSheet.js`) is a one-time import, not a
  recurring sync.
- **Two-tier passphrase auth:** `x-admin-secret` gates `/admin`-ish CRUD
  and `/api/reset`; a separate `x-player-secret` (`PLAYER_SECRET` env var)
  gates the player-facing game-loop routes (state/spin/complete/claim-
  interest/trade/force/release/reroll). Both are speed bumps, not real
  auth — see "Not built yet". Secrets are entered once client-side and
  cached in `localStorage` (`client/src/api.js`).
- **Avatars** are stored inline as `Buffer` on the `User` document (not on
  disk — Render's filesystem is ephemeral across deploys) and served
  unauthenticated from `GET /api/users/:id/avatar` since `<img>` tags
  can't send custom headers. Client cache-busts via a `?v=updatedAt` query
  param.

## API surface (mirrors the old Apps Script action verbs, plus new ones)
Player-facing (needs `x-player-secret`): `GET /api/state`, `POST /api/spin`,
`/api/complete`, `/api/claim-interest`, `/api/trade`, `/api/force`,
`/api/release`, `/api/reroll`.
Admin-only (needs `x-admin-secret`): `POST /api/reset`, full CRUD on
`/api/users` and `/api/games` (including avatar upload/delete).
`GET /api/users/:id/avatar` is the one deliberately public route.

## Known gotchas
- MongoDB Atlas `mongodb+srv://` connection strings can fail with
  `querySrv EBADRESP` on some Linux DNS resolvers (seen on Arch). Fix
  lives in both `src/db.js` and `src/server.js` via
  `dns.setServers(['8.8.8.8','1.1.1.1'])` — needs to be in every entry
  point (not just one), or standalone scripts like the importer will fail
  the same way.
- Streak logic in `stats.js` is still a best-effort reconstruction of the
  old Sheet's SCAN formula (extend on real completion, reset on released)
  — the payout numbers are now calibrated/finalized, but the underlying
  walk-the-log approach itself hasn't been checked line-for-line against
  the original Sheet formula.
- Because coins/streak are recomputed from the full log on every read, any
  future change to the payout curve in `stats.js` applies retroactively to
  existing history too, not just future completions.

## Not built yet
- Real auth (the admin/player secrets are speed bumps, not auth)
- Cascading cleanup when an admin deletes a user (their games stay owned
  by a now-missing `ownerId` rather than being reassigned or freed)
