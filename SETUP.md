# Archipelago Randomizer API — setup guide

This replaces the Google Apps Script backend with a real Node/Express API
backed by MongoDB Atlas (free tier). The Sheet stays as a frozen backup —
this migrates the data once, it doesn't keep the two in sync live (see
"Why not keep the Sheet live-synced?" at the bottom).

## What's here

```
archipelago-api/
  src/
    models/       User, Game, Trade — see schema notes below
    routes/
      gameLoop.js   spin / complete / claim-interest / trade / force / reset / state
      admin.js      create/edit/delete users and games
    lib/stats.js    coins/streak/longestStreak, computed on read — never stored
    db.js
    server.js
  scripts/
    importFromSheet.js   one-time migration from your .xlsx export
  .env.example
```

## Schema, in short

One `Game` document per **copy** of a game — same idea as your Sheet's
one-row-per-interested-player design. Instead of separate tables for
`curAvailGames` / `finGames` / `Inventory` / `ForcedList`, each game has a
single `status` field: `available → in_inventory → finished`, with a
`forced` branch when someone gets forced onto a game. A game can only be
in one status at a time by construction, so there's no "make sure it's not
in two lists at once" check to write or maintain.

Coins/streak/longest streak are **not stored** on the user — they're
computed from the game log every time you ask (`src/lib/stats.js`), the
same self-healing principle your Sheet's formulas used. If that ever feels
slow at real scale, it's a straightforward later optimization (cache +
invalidate on write); not worth the complexity now.

## 1. MongoDB Atlas (free tier)

1. Create a free account at mongodb.com/cloud/atlas, create a free (M0)
   cluster.
2. **Database Access** → add a database user (username/password).
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere) to start —
   tighten later once you know your hosting provider's IP range, or use
   their private networking if available.
4. **Connect > Drivers** → copy the connection string, looks like:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/...`

## 2. Local setup

```bash
cd archipelago-api
npm install
cp .env.example .env
# edit .env: paste your MONGODB_URI, set ADMIN_SECRET to something random
npm run dev
```

Visit `http://localhost:4000/health` — should return `{"ok":true}`.

## 3. Migrate your data

Export your live Sheet as `.xlsx` (File > Download > Microsoft Excel),
then:

```bash
node scripts/importFromSheet.js path/to/EveryWorld_Randomizer.xlsx --dry-run
```

Check the counts it reports look right, then run it for real (drop
`--dry-run`). This only writes — it doesn't touch your Sheet. Re-running it
against a database that already has data will create duplicates, so treat
this as a one-time step, not something to run repeatedly.

## 4. Deploy for free

Any of Render, Railway, or Fly.io work well for a small Node API's free
tier. Render's the simplest to point-and-click:

1. Push this folder to a GitHub repo.
2. Render.com → New > Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add your `.env` values as environment variables in Render's dashboard
   (never commit `.env` itself).
5. Once deployed, Render gives you a URL like
   `https://archipelago-api.onrender.com` — that's what your frontend calls.

Free tiers on all three of these spin down after inactivity and take a few
seconds to wake back up on the next request — fine for a friend-group tool,
worth knowing so a "first spin of the day" being slow doesn't look broken.

## API surface

Same action verbs as the old Apps Script version, so migrating the
existing `index.html` (or a future React frontend) is a small diff:

| Old (Apps Script) | New |
|---|---|
| `GET ?action=state` | `GET /api/state` |
| `POST {action:'spin'}` | `POST /api/spin` `{userId}` |
| `POST {action:'complete'}` | `POST /api/complete` `{userId, gameId}` |
| `POST {action:'claimInterest'}` | `POST /api/claim-interest` `{userId, gameId}` |
| `POST {action:'trade'}` | `POST /api/trade` `{userId, gameId, targetUserId, targetGameId}` |
| `POST {action:'force'}` | `POST /api/force` `{userId, gameId, targetUserId}` |
| `POST {action:'reset'}` | `POST /api/reset` (needs `x-admin-secret` header) |

Plus new admin routes not in the old system (all need `x-admin-secret`):
`POST/PATCH/DELETE /api/users` and `/api/games`, for the "manually
create/modify/delete a user" and "manually edit the games list" needs from
your notes.

## What's deliberately not built yet

- **Auth.** The `x-admin-secret` header is a speed bump, not real
  authentication — fine for a small trusted group, not something to expose
  more broadly without adding real login.
- **React frontend.** This is API-only. The existing `index.html` can be
  pointed at this instead of the Apps Script URL with fairly small changes
  (same action verbs, different request shape) if you want something
  working before the React rewrite; say so and I can do that adaptation.
- **Coin-costed Force/direct-choose**, same gap as before — still needs a
  cost defined.

## Why not keep the Sheet live-synced?

A true two-way sync between the Sheet and MongoDB means every write on
either side has to reach the other side reliably, in order, without
double-applying — that's real distributed-systems complexity for a hobby
project. The one-time migration gets you a clean starting point in Mongo;
after that, treat the Sheet as a historical record you can look back at,
not a second live copy of the state. If you later want a periodic (not
live) export from Mongo back into a read-only sheet for easy browsing, that's
a much simpler one-way job I can build — just say so.
