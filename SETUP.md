# Deploying your own instance

Setup template. Every group will run their own copy on their own free
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

Coins, streak, and totals are never "stored", they're recomputed from the
game log (`src/lib/stats.js`). The economy patches over itself and
any later tuning changes will apply retroactively. See `README.md` for how
the actual game rules (streaks, forcing, releasing, the Lobby/Auction,
Bonus Game) work.

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
- `ADMIN_SECRET`, `PLAYER_SECRET` — two different random strings, e.g. 2 different
  `openssl rand -hex 32` numbers or something that you will remember. These are speed bumps, not real auth,
  but are good enough for a trusted friend group.
- `ALLOWED_ORIGINS` — leave as the localhost default for now as you'll add
  your real GitHub Pages URL once you have it (step 7).

Edit `client/.env`. Leave both values alone for local dev; they're only
relevant for the GitHub Pages build (step 7).

The full list of every env var either side reads, including optional
economy-tuning overrides, is documented inline in `.env.example`.

## 3. MongoDB Atlas (free tier)

0. If you want to host your own backend locally feel free to ignore this step and setup the db manually. You can use docker or download the mongodb community server on their website (or via the repo in linux) to host the database on your machine instead of using their online services.
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
`--force` to override). This is meant as a one-time starting point, not
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
0. If you want to host locally, feel free to skip this step and just expose to the internet as you normally would.
1. Push your fork to GitHub (if you haven't already).
2. Render.com → New > Web Service → connect your repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add every variable from `.env` as an environment variable in Render's
   dashboard (never commit `.env` itself) — at minimum `MONGODB_URI`,
   `ADMIN_SECRET`, `PLAYER_SECRET`, `ALLOWED_ORIGINS`.
5. Once deployed, Render gives you a URL like
   `https://your-app.onrender.com` which is your backend API's live URL.

Free tier spins down after inactivity and takes a few seconds to wake
back up on the first request after idle.

**Bandwidth is capped on the free tier.** This app rate-limits itself
(`RATE_LIMIT_MAX`/`AVATAR_RATE_LIMIT_MAX` in `.env.example`) to guard
against a bot or scraper hitting the API directly and burning through
your monthly cap. CORS (`ALLOWED_ORIGINS`) only stops browser JS from
other sites, not a script hitting the API URL directly. The defaults
should be generous enough for normal friend-group use. Lower them if
you're still seeing unexpected usage.

## 7. Deploy the frontend (GitHub Pages)

0. If you already have your own locally hosted sites that you can prop up, then feel free to ignore this step as well. I do not have my own homelab setup to use, so I've opted for GitHub Pages instead.
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
  not per-user login. I believe this is fine for a small trusted group, not for exposing
  this more broadly. Any user with the pass can access the site and can access any user currently registered to the session and act as that user.
- **Multi-tenancy.** This is one instance per group, by design. See the
  callout at the top of `README.md`.
