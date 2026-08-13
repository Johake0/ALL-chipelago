# Archipelago Randomizer — project context

## What this is
A group project to randomly assign Archipelago randomizer games to a
friend group, with a coin/reroll economy, trading, and forced games.
Originally built on Google Sheets + Apps Script + a static GitHub Pages
frontend; migrating to a real backend.

## Current architecture decisions
- **Backend/DB stack:** Node.js + Express + MongoDB Atlas (free tier).
- **Schema shape:** a single `games` collection with a `status` field
  (`available`, `personal_list`, `in_inventory`, `forced`, `finished`) —
  NOT separate collections per state. One document per game *copy* (a
  title wanted by 3 players can exist as 3 separate documents). This
  avoids needing manual cross-table consistency checks.
- **Coins/streak/longestStreak are never stored** — always computed from
  the game log on read (see `src/lib/stats.js`), mirroring how the old
  Sheet's formulas worked.
- **Google Sheet status:** kept as a frozen backup, not live-synced. The
  migration (`scripts/importFromSheet.js`) is a one-time import, not a
  recurring sync.

## API surface (mirrors the old Apps Script action verbs)
`GET /api/state`, `POST /api/spin`, `/api/complete`, `/api/claim-interest`,
`/api/trade`, `/api/force`, `/api/reset` (needs `x-admin-secret` header).
Admin CRUD for users/games also under `/api`.

## Known gotchas
- MongoDB Atlas `mongodb+srv://` connection strings can fail with
  `querySrv EBADRESP` on some Linux DNS resolvers (seen on Arch). Fix
  lives in `src/db.js` via `dns.setServers(['8.8.8.8','1.1.1.1'])` —
  needs to be in a file every entry point imports (not just `server.js`),
  or standalone scripts like the importer will fail the same way.
- Streak logic in `stats.js` is a best-effort reconstruction of the old
  Sheet's SCAN formula (extend on real completion, reset on released) —
  not yet verified against the original formula.

## Not built yet
- Real auth (the admin secret is a speed bump, not auth)
- React frontend (currently a plain `index.html` on GitHub Pages)
- Coin cost enforcement on Force / paid direct-choose from the wheel