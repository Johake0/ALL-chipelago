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
- **Project display name changed to "ALL-Chipelago"** (README title, and
  `client/vite.config.js`'s `base: '/ALL-chipelago/'` for GitHub Pages
  routing) — but this was a cosmetic/hosting-path rename only, not a full
  technical one: the local folder, git remote (`origin` still points at
  `.../AR-chipelago.git`, working via GitHub's rename redirect), and both
  `package.json` `name` fields are all still `AR-chipelago`/
  `archipelago-randomizer-api`. Don't assume the name is consistent
  everywhere — check which one a given context actually needs.

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
  **`POST /api/release` now also accepts `'lobby'` status**, alongside
  `in_inventory`/`forced` — changed from an earlier version of this file,
  which argued release should be hold-only because bailing out of a game
  in the shared Lobby would disrupt an active multiworld session with
  other players. **Settled: this stays allowed even after Session/lock-in
  is built (Phase 2 below), not just from a pre-lock-in Lobby entry** — if
  a game turns out to be too hard or otherwise not fun once a session's
  already running, a player should still be able to bail via Release
  (same coin cost + streak reset as always) rather than being stuck. This
  was an open question flagged here previously ("revisit once lock-in
  exists") and is now resolved — Phase 2's session-close logic just needs
  to handle a member releasing instead of finishing their session game
  (e.g. treat it the same as if they'd never confirmed done, or drop them
  from the pending-coins exclusion — decide the exact mechanics when
  building that part, but the *policy* itself is decided). The frontend
  (`Lobby.jsx`) gates this behind a strong confirmation modal (not the
  lighter 2-click pattern `POST /api/complete` uses) — it shows the coin
  cost, the current streak that's about to be lost, and requires an
  explicit "Yes, release it" click — since this is a real, unrecoverable,
  costly action a player might trigger from right
  next to the low-stakes "Return to Hold" button.
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
- **`computeUserStats` returns both `coins` (spendable balance) and
  `totalEarned` (lifetime earnings, only ever grows)** — added when Gifting
  and the Leaderboard needed to distinguish them. `coins` is
  `totalEarned - spent (force/release/reroll/gifts sent) + gifts received`;
  `totalEarned` never reflects spending or gifting in either direction, so
  it can't be inflated by hoarding or laundering coins between friends —
  that's what the Leaderboard's "Coins Earned" column ranks by.
- **Bonus Game** (`src/lib/bonusGame.js`): one held game per player is
  flagged `User.bonusGameId` via a weighted lottery
  (`min(1 + 0.5 × gamesCompletedSinceAdded, 4)` per candidate, where
  `gamesCompletedSinceAdded` counts that player's other `finished` games
  with `dateCompleted` after the candidate's `dateAssigned` — ordering
  against existing data, not a new stored field or wall-clock time).
  Finishing the flagged game pays `× 1.5` on top of the normal streak
  multiplier — recorded permanently on that `Game` doc as
  `bonusOnComplete` at the moment `/api/complete` runs (not re-checked
  later), since the flag itself can move to a different game before
  payout would otherwise be read. Reroll trigger (a) — hold count
  refilling to 9/10 — is wired via `maybeRerollOnHoldRefill`, called from
  `/api/spin` and `/api/claim-interest`. Trigger (b) (an Auction session
  ending with the player having taken the auctioned game) isn't wired yet
  since the Auction doesn't exist — see "Planned" below.
- **Gift Coins** (`POST /api/gift`): a pure coin transfer between two
  players, no game involved — logged as a `Trade` (`type: 'gift'`) the
  same way force/release/reroll costs are, so `computeUserStats` just
  subtracts it from the sender and adds it to the recipient with no
  separate balance to keep in sync.
- **Activity Feed** (`GET /api/activity`) and **Leaderboard**: neither is
  a stored log/table — Activity is assembled on read by merging
  `Game.dateAssigned`/`dateCompleted` and the `Trade` collection (each
  source capped at 50 before merging, then re-sorted and re-capped), and
  the Leaderboard is computed client-side from the same per-player stats
  `GET /api/state` already returns. Same "derive, don't store" principle
  as coins/streak.
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
Player-facing (needs `x-player-secret`): `GET /api/state`, `GET /api/activity`,
`POST /api/spin`, `/api/complete`, `/api/claim-interest`, `/api/trade`,
`/api/force`, `/api/release`, `/api/reroll`, `/api/gift`, `/api/lobby/add`,
`/api/lobby/return`.
Admin-only (needs `x-admin-secret`): `POST /api/reset`, full CRUD on
`/api/users` and `/api/games` (including avatar upload/delete). Note the
admin games editor's `OVERRIDABLE_FIELDS` doesn't include `bonusOnComplete`
or expose `User.bonusGameId` — there's no manual-override path for the
Bonus Game flag yet.
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
- The client's dev-server base path (`client/vite.config.js`) is
  `/ALL-chipelago/`, not `/AR-chipelago/` — a local `npm run dev` serves
  at `http://localhost:5173/ALL-chipelago/`, not the old path. Easy to
  get a stale URL from habit or old notes since the local folder and both
  `package.json`s kept the old name (see the rename note above).

## Not built yet
- Real auth (the admin/player secrets are speed bumps, not auth)
- Cascading cleanup when an admin deletes a user (their games stay owned
  by a now-missing `ownerId` rather than being reassigned or freed)
- The Auction/Session system — see "Planned" below. This is the next
  build per that section's own stated order (Bonus Game, now done, was
  meant to come first specifically to avoid retrofitting the Auction
  around it).
- Manual admin override for `User.bonusGameId` / `Game.bonusOnComplete`
  (see API surface note above).

## Planned: Lobby Sessions & Auction (design settled, not built)

The Bonus Game half of this was originally planned alongside the Auction
(see the git history for that original combined write-up) but is now
**done** — see the "Bonus Game" bullet under "Current architecture
decisions" above for how it actually works. Only the Session/Auction half
below remains unbuilt. It was always going to be the bigger lift (a real
Session entity, atomic ready-up locking, a multi-round bidding state
machine) — the Bonus Game was deliberately built first so its reroll
trigger (b) below could be added to already-working code instead of
having to retrofit the whole mechanic around the Auction from day one.
Trigger (b) is the one loose end this leaves: `maybeRerollOnHoldRefill`
only wires up trigger (a) (hold refilling to 9/10) today; trigger (b)
(session-end-with-auction-win) has nowhere to call from yet since nothing
calls `pickBonusGame` on session close — that wiring is part of this
Auction build, not a followup after it.

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

**Why the auction pays no bonus (this took a while to land on, worth knowing):**
A coin-supply simulation against the real catalog (689 playable games,
avg coinValue ~206, 4 players) showed that by 50% through the catalog a
player who never releases sits on ~32,000 coins with only ~800-2,000-coin
sinks (force/release/reroll) to spend on — by 70%, ~47,000. The original
auction idea (win = 2x-3x coinValue) would have made that worse, and
whoever was already ahead would win every auction, compounding it further
("rich get richer"). Landed on: **auctioned games pay the same base
reward as a normal completion, no bonus.** That single change kills the
rich-get-richer problem outright (no profit motive to chase) and makes an
earlier anti-loop idea (decaying reward for repeatedly winning auctions)
unnecessary — without a bonus, repeat wins already just cost coins for no
extra income, which is self-limiting on its own.
The auction was never going to fix that inflation number regardless —
bids are refunded (see below), so a typical auction round doesn't reliably
remove coins from the economy either way. Its actual job is narrower and
still valuable: a **streak-safe alternative to Release** late-game, when
someone doesn't want to keep grinding through hold items they don't want
but also doesn't want to eat a streak reset to escape them. Separately,
the group settled on treating coins as more of a fun/progress-marker (the
Leaderboard's job) than a tightly-balanced resource — with the accepted
tradeoff that Force/Release costs will likely stop feeling like a real
sacrifice once balances vastly outgrow them. That's a known, deliberate
tradeoff, not an oversight to fix later.

**Auction (mandatory every time a session locks in — no opt-out):**
- On lock-in, the wheel spins among currently `available` games to pick
  one auction item. It pays the same reward as a normal completion if won
  and finished — no bonus multiplier.
- Bidding opens at 10% of the game's `coinValue`. Each round, every
  still-active bidder either meets the current minimum or clicks **Drop
  Out**; the minimum then climbs another 10%-of-value step (10%, 20%,
  ... up to 100%). Once it reaches 100%, it stops moving in fixed steps
  and becomes open bidding — remaining bidders can raise by whatever
  amount they want.
- **If it thins to exactly one bidder at any point** (even mid-ramp,
  below 100%), that person's Drop Out button becomes **Finalize Price at
  [current minimum]**, and they win immediately at that price — no reason
  to force them through more rounds against nobody. This means an
  uncontested auction can be won below full value; that's accepted, not a
  bug (mirrors "you're always taking a loss" being the *typical* case
  when a game's actually contested, not a mechanically enforced rule).
- Bid size is uncapped ("no house" — overspending is the bidder's own
  problem, not something the system needs to guard against).
- **Losing bids are always fully refunded.** Nothing is deducted from
  anyone but the eventual winner — only the winning price ever becomes a
  real `Trade` entry. Consistent with coins always being derived, never
  stored, and it means there's no refund logic to write at all (nothing
  was ever charged to begin with).
- If nobody ever places a bid, allow **5 minutes** from the auction
  opening before resolving it as "no interest" and returning the game to
  `available`. (No per-round timeout beyond that — auctions are assumed
  to happen live with the group actually present, so a single "does
  anyone care at all" window is enough; an individual round stalling
  mid-bidding-war isn't something this needs to solve for.)
- Exactly one winner per session; everyone else keeps playing whatever
  game they originally brought into the lobby, untouched.
- The winner's original game returns to their hold (not lost); the won
  game takes its place in their session slot. That slot must be its own
  dedicated status/field — reusing the existing `forced` slot would
  corrupt `inventoryCountForUser`/`LIMITS.INVENTORY_SIZE` logic, since
  those assume `forced` means something specific already. The winner
  skips their own wheel spin next round — they play the auction win
  instead.
- Taking the auctioned game triggers a Bonus Game reroll once the session
  ends (see above) — winning an auction doesn't touch the player's
  currently-flagged bonus game directly, but the reroll it causes can
  move the flag away from it. That's the actual tension the Auction was
  missing once its own reward bonus got removed: "is this auction game
  worth potentially losing my current bonus shot" is a real decision,
  even though the auction itself no longer pays extra.

**Session close:**
- Earlier drafts of this note assumed "Done" could only mean *finished*,
  never *released*, on the premise that releasing from an active Lobby
  session was impossible. That premise no longer holds — see the Lobby
  bullet under "Current architecture decisions" above: Release from
  `'lobby'` status is now allowed, deliberately, even once Sessions
  exist. So session-close logic **does** need to handle a member
  releasing instead of finishing — treat it the same as if they'd never
  confirmed done, or drop them from the pending-coins exclusion; decide
  the exact mechanics when building this, but don't assume it can't
  happen.
- All session members must individually confirm they're done before (a)
  anyone's coins from that session's completions become collectable, and
  (b) a new session can start. Matches how the group already plays —
  nobody starts the next randomizer until everyone's finished the
  current one.
