# Deploying your own instance

This is a template — every group runs their own copy, on their own free
accounts (MongoDB Atlas, Render, GitHub Pages). Nothing here is shared
with anyone else's deployment.

```
├── src/            Express API
│   ├── models/       User, Game, Trade, Session
│   ├── routes/       gameLoop.js, admin.js, session.js
│   ├── lib/          stats.js (coins/streak, computed on read — never
│   │                  stored), bonusGame.js, sessionAuction.js
│   └── server.js
├── scripts/
│   ├── seedCatalog.js      generic JSON catalog seeder (start here)
│   ├── catalog.sample.json example catalog to copy/edit
│   └── importFromSheet.js  only relevant if migrating a specific old
│                            EveryWorld Google Sheet export
├── client/          React + Vite frontend (player + admin apps)
└── .env.example      copy to .env, see step 2
```

Coins, streak, and totals are never stored — they're recomputed from the
game log every time (`src/lib/stats.js`), so the economy self-heals and
any later tuning change applies retroactively. See `README.md` for how
the actual game rules (streaks, forcing, releasing, the Lobby/Auction,
Bonus Game) work — that's unaffected by anything below.

## 1. Fork & clone

Fork this repo on GitHub, then clone your fork locally.

## 2. Install & configure

```bash
npm install                 # root — the API
cd client && npm install    # the frontend
cd ..
cp .env.example .env
cp client/.env.example client/.env
```

Edit `.env` (root):
- `MONGODB_URI` — from step 3 below.
- `ADMIN_SECRET`, `PLAYER_SECRET` — two different random strings, e.g.
  `openssl rand -hex 32` run twice. These are speed bumps, not real auth
  — good enough for a trusted friend group, not for a public sign-up flow.
- `ALLOWED_ORIGINS` — leave as the localhost default for now; you'll add
  your real GitHub Pages URL once you have it (step 7).

Edit `client/.env` — leave both values alone for local dev; they're only
relevant for the GitHub Pages build (step 7).

The full list of every env var either side reads, including optional
economy-tuning overrides, is documented inline in `.env.example`.

## 3. MongoDB Atlas (free tier)

1. Create a free account at mongodb.com/cloud/atlas, create a free (M0) cluster.
2. **Database Access** → add a database user (username/password).
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere) to start.
4. **Connect > Drivers** → copy the connection string
   (`mongodb+srv://<user>:<password>@<cluster>.mongodb.net/...`) into
   `MONGODB_URI` in `.env`.

## 4. Seed your catalog

Copy `scripts/catalog.sample.json`, replace the sample players/games with
your own group and game list, then:

```bash
node scripts/seedCatalog.js path/to/your-catalog.json --dry-run   # sanity-check first
node scripts/seedCatalog.js path/to/your-catalog.json             # then for real
```

This refuses to run against a database that already has data (pass
`--force` to override) — it's meant as a one-time starting point, not
something to re-run on a schedule.

Migrating an existing EveryWorld Google Sheet instead? Use
`node scripts/importFromSheet.js path/to/export.xlsx` — see the comment
at the top of that file for its exact expected format.

## 5. Local dev check

```bash
npm run dev              # root — starts the API on :4000
cd client && npm run dev # starts the frontend on :3000
```

Visit `http://localhost:4000/health` — should return `{"ok":true}`.
Visit the frontend URL Vite prints and confirm you can log in with your
`PLAYER_SECRET`/`ADMIN_SECRET`.

## 6. Deploy the API (Render, free tier)

1. Push your fork to GitHub (if you haven't already).
2. Render.com → New > Web Service → connect your repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add every variable from `.env` as an environment variable in Render's
   dashboard (never commit `.env` itself) — at minimum `MONGODB_URI`,
   `ADMIN_SECRET`, `PLAYER_SECRET`, `ALLOWED_ORIGINS`.
5. Once deployed, Render gives you a URL like
   `https://your-app.onrender.com` — that's your API's live URL.

Free tier spins down after inactivity and takes a few seconds to wake
back up on the first request after idle — fine for a friend-group tool,
just don't mistake it for broken.

**Bandwidth is capped on the free tier.** This app rate-limits itself
(`RATE_LIMIT_MAX`/`AVATAR_RATE_LIMIT_MAX` in `.env.example`) to guard
against a bot or scraper hitting the API directly and burning through
your monthly cap — CORS (`ALLOWED_ORIGINS`) only stops browser JS from
other sites, not a script hitting the API URL directly. The defaults
should be generous enough for normal friend-group use; lower them if
you're still seeing unexpected usage.

## 7. Deploy the frontend (GitHub Pages)

1. In your fork's GitHub Settings → Secrets and variables → Actions →
   **Variables** tab, add:
   - `VITE_API_URL` — your Render URL from step 6.
   - `VITE_BASE_PATH` — `/your-repo-name/` (with leading and trailing
     slashes) if deploying as a GitHub Pages *project* page under your
     fork's default URL; leave unset (defaults to `/`) if you're using a
     custom domain or a user/org page.
2. In Settings → Pages, set **Source** to "GitHub Actions".
3. Push to `main` (or run the "Deploy client to GitHub Pages" workflow
   manually) — `.github/workflows/deploy-client.yml` builds and deploys
   automatically on any push touching `client/**`.
4. Go back to your Render service's environment variables and update
   `ALLOWED_ORIGINS` to include your real GitHub Pages URL, then redeploy
   the API so CORS actually allows it.

## What's deliberately not built

- **Real auth.** `ADMIN_SECRET`/`PLAYER_SECRET` are shared passphrases,
  not per-user login — fine for a small trusted group, not for exposing
  this more broadly.
- **Multi-tenancy.** This is one instance per group, by design — see the
  callout at the top of `README.md`.
