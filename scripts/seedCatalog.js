/**
 * Generic starting-point seeder for a fresh deployment — no Google Sheet
 * required. Reads a plain JSON catalog file and creates the Users and
 * available Games it describes. This is the path for anyone setting up
 * their own instance from scratch; importFromSheet.js stays as-is for
 * migrating an existing EveryWorld Google Sheet specifically.
 *
 * Usage:
 *   node scripts/seedCatalog.js path/to/catalog.json
 *   node scripts/seedCatalog.js path/to/catalog.json --dry-run   (parse + report, no DB writes)
 *   node scripts/seedCatalog.js path/to/catalog.json --force     (seed even if Users/Games already exist)
 *
 * Catalog JSON shape:
 *   {
 *     "players": ["Alice", "Bob"],
 *     "games": [
 *       { "name": "Some Game", "coinValue": 200 },
 *       { "name": "Another Game", "coinValue": 100, "forceReleaseCost": 300 }
 *     ]
 *   }
 * forceReleaseCost defaults to coinValue * 4 if omitted, matching this
 * project's existing convention (see CLAUDE.md / src/lib/stats.js).
 *
 * Refuses to run against a database that already has Users or Games
 * unless --force is passed, since re-running would create duplicates —
 * same one-shot-seed spirit as importFromSheet.js.
 */
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import User from '../src/models/User.js';
import Game from '../src/models/Game.js';

const filePath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

if (!filePath) {
  console.error('Usage: node scripts/seedCatalog.js path/to/catalog.json [--dry-run] [--force]');
  process.exit(1);
}

function loadCatalog() {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const catalog = JSON.parse(raw);

  if (!Array.isArray(catalog.players) || catalog.players.length === 0) {
    throw new Error('Catalog must have a non-empty "players" array of usernames.');
  }
  if (!Array.isArray(catalog.games) || catalog.games.length === 0) {
    throw new Error('Catalog must have a non-empty "games" array.');
  }
  for (const g of catalog.games) {
    if (!g.name || typeof g.name !== 'string') throw new Error(`Every game needs a "name" string: ${JSON.stringify(g)}`);
    if (typeof g.coinValue !== 'number') throw new Error(`Game "${g.name}" needs a numeric "coinValue".`);
  }

  return catalog;
}

async function run() {
  const catalog = loadCatalog();
  console.log(`Found ${catalog.players.length} players and ${catalog.games.length} games in ${filePath}.`);

  if (dryRun) {
    console.log('[dry run] Would create these players:', catalog.players.join(', '));
    console.log(`[dry run] Would create ${catalog.games.length} game documents.`);
    return;
  }

  await connectDB();

  if (!force) {
    const [existingUsers, existingGames] = await Promise.all([User.countDocuments(), Game.countDocuments()]);
    if (existingUsers > 0 || existingGames > 0) {
      console.error(
        `Database already has ${existingUsers} user(s) and ${existingGames} game(s) — refusing to seed on top of ` +
        `existing data to avoid duplicates. Pass --force to seed anyway.`
      );
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  for (const name of catalog.players) {
    await User.findOneAndUpdate({ username: name }, { username: name }, { upsert: true });
  }
  console.log(`Created/confirmed ${catalog.players.length} players.`);

  const docs = catalog.games.map((g) => ({
    name: g.name,
    coinValue: g.coinValue,
    forceReleaseCost: typeof g.forceReleaseCost === 'number' ? g.forceReleaseCost : g.coinValue * 4,
    status: 'available'
  }));
  await Game.insertMany(docs);
  console.log(`Created ${docs.length} game documents.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
