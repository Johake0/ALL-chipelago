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
  `forced`, `lobby`, `finished`) — NOT separate collections per state. One
  document per game *copy* (a title wanted by 3 players can exist as 3
  separate documents). This avoids needing manual cross-table consistency
  checks; a copy is structurally incapable of being in two states at once.
- **The Lobby** (`status: 'lobby'`) is a shared, site-wide area — not
  scoped to one player — representing "the game(s) currently being played
  together as one Archipelago multiworld session." A player moves a game
  there from their hold (`POST /api/lobby/add`, capped at one lobby entry
  per player) instead of finishing it directly; `POST /api/complete` only
  accepts games already in `'lobby'` status, so finishing is a deliberate
  two-step flow — a stray click on a hold item can't finish the wrong
  game. `POST /api/lobby/return` reverses it back to `in_inventory` (or
  `forced`, if `forcedByUserId` is set) for "wrong game" recoveries.
  **`POST /api/release` deliberately does NOT require lobby status** —
  it only ever operates on `in_inventory`/`forced` hold items, same as
  before the Lobby existed. This is intentional, not an oversight: the
  Lobby represents an active shared multiworld session with other
  players, and Archipelago sessions are interconnected (items/checks
  flow between everyone's connected games) — someone bailing out of a
  game that's currently in the shared Lobby would disrupt that session
  for the whole group. Releasing has to stay a hold-only action so a
  player can back out of a game *before* committing it to a group
  session, not while it's actively part of one.
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
`/api/release`, `/api/reroll`, `/api/lobby/add`, `/api/lobby/return`.
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
- Leaderboard, activity feed, and coin gifting (the next three planned
  features, in that priority order — all straightforward given the
  existing data model: `/api/state` already computes every player's
  stats, not just the requester's, so a leaderboard is close to pure
  frontend work; an activity feed needs some aggregation across
  `Game`/`Trade` timestamps but no new mechanic; gifting is a small new
  `Trade`-like transfer. One thing to get right on the leaderboard: its
  "coins earned" stat must be sourced from actual completions, not
  current balance, or gifting/hoarding would distort it.)

## Planned: Lobby Sessions + Auction (design settled, not built)

Deliberately shelved until after the three features above — this is a
much bigger lift than it first sounds, because it's not really "add an
auction," it's "turn the Lobby into a real Session, then add bidding on
top of that." Design below is settled from discussion, ready to build
against whenever it's next up.

**Why:** the Lobby today is just "whoever currently has a game with
`status: 'lobby'`" — an ad-hoc bucket, not a real group entity. Both this
feature and a richer activity feed (e.g. "C started a session with D")
need the Lobby to become an actual Session with defined membership and a
lifecycle, not just a status value.

**Session lifecycle:**
- Only one Lobby/Session can exist at a time — no concurrent sessions.
  This matches how real Archipelago multiworld generation already works
  (the player set is fixed at generation time), so the tool's model
  doesn't fight the real thing.
- A player joins the pending session by adding a game to the Lobby *and*
  clicking "Ready." Un-readying (toggle back) is allowed before the
  session locks in.
- Requires 2+ ready players to lock in (a session of 1 is meaningless in
  practice, per how the group actually plays).
- When the last unready player in the pending lobby clicks Ready, show a
  confirmation before locking in: "You are the last person to ready up —
  starting the lobby will start the auction process with N players. Do
  you want to proceed?" (Same "don't let one click silently commit
  everyone" instinct as the Lobby's existing Mark Finished confirm.)
- **Must be implemented as a single atomic DB operation** (mark ready +
  check-everyone-ready + start-session, guarded together) — not a
  separate read-then-write — or two near-simultaneous Ready clicks could
  double-trigger the session start / double-spin the auction wheel.
  Precedent for this already exists in this codebase: `/api/trade` wraps
  its two-document swap in `mongoose.startSession()` +
  `withTransaction()` for the same reason.

**Auction (mandatory every time a session locks in — no opt-out):**
- On lock-in, the wheel spins among currently `available` games to pick
  one auction item, worth 2x its normal `coinValue` if won and finished.
  (Open detail: whether that 2x feeds into the existing streak
  multiplier/milestone formula or is a separate flat bonus — not decided
  yet.)
- Session members bid coins on it. Highest bidder wins.
- Losing bids are never deducted in the first place (nothing is charged
  until resolution) — so there's no refund logic to write, only the
  winning bid ever becomes a real `Trade` entry. Consistent with coins
  always being derived, never stored.
- No bids at all → the auctioned game just returns to `available`, no
  cost or effect on anyone.
- Exactly one winner per session; everyone else keeps playing whatever
  game they originally brought into the lobby, untouched.
- The winner's original game returns to their hold (not lost); the won
  game takes its place in their session slot. That slot must be its own
  dedicated status/field — reusing the existing `forced` slot would
  corrupt `inventoryCountForUser`/`LIMITS.INVENTORY_SIZE` logic, since
  those assume `forced` means something specific already.

**Session close:**
- "Done" can only ever mean *finished*, never *released* — releasing
  from an active Lobby session was already made impossible on purpose
  (see the Lobby note above), so this doesn't need new handling.
- All session members must individually confirm they're done before (a)
  anyone's coins from that session's completions become collectable, and
  (b) a new session can start. Matches how the group already plays —
  nobody starts the next randomizer until everyone's finished the
  current one.
