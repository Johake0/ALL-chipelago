/**
 * One-time migration: reads an .xlsx export of the Google Sheet and seeds
 * MongoDB with Users and Games, translating the old column-based state
 * (Assigned To / Player Completed / Forced To / Released / Removed /
 * Claim Method) into the new single `status` field.
 *
 * Usage:
 *   node scripts/importFromSheet.js path/to/EveryWorld_Randomizer.xlsx
 *   node scripts/importFromSheet.js path/to/file.xlsx --dry-run   (parse + report, no DB writes)
 *
 * Safe to re-run against an empty database. NOT idempotent against a
 * database that already has data — it will create duplicates. Meant to be
 * run once during the transition, not on a schedule (see SETUP.md for why
 * a live two-way sync isn't recommended here).
 */
import 'dotenv/config';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import User from '../src/models/User.js';
import Game from '../src/models/Game.js';

const filePath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!filePath) {
  console.error('Usage: node scripts/importFromSheet.js path/to/file.xlsx [--dry-run]');
  process.exit(1);
}

// GameList column layout, matching Code.gs's GAMELIST_COL constants.
const COL = {
  GAME: 0, COMPLETED_BY: 1, COIN_VALUE: 2, FORCE_RELEASE_COST: 3,
  DATE: 4, RELEASED: 5, INTEREST: 6, ASSIGNED_TO: 7, CLAIM_METHOD: 8,
  REMOVE: 9, FORCED_TO: 10, REMOVED_GAMES_LIST: 11
};

function readWorkbook() {
  const wb = XLSX.readFile(filePath);
  const playersSheet = wb.Sheets['Players'];
  const gameListSheet = wb.Sheets['GameList'];
  if (!playersSheet || !gameListSheet) {
    throw new Error('Expected "Players" and "GameList" sheets — check the file matches the usual export.');
  }

  const playersRow = XLSX.utils.sheet_to_json(playersSheet, { header: 1 })[0] || [];
  const playerNames = playersRow.filter((v) => v !== undefined && v !== '');

  const gameRows = XLSX.utils.sheet_to_json(gameListSheet, { header: 1 }).slice(1); // skip header row

  const removedGameNames = new Set(
    gameRows.map((r) => r[COL.REMOVED_GAMES_LIST]).filter(Boolean)
  );

  return { playerNames, gameRows, removedGameNames };
}

function excelDateToJSDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // xlsx sometimes gives a serial number if cellDates wasn't set — handle both.
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed;
}

async function run() {
  const { playerNames, gameRows, removedGameNames } = readWorkbook();

  console.log(`Found ${playerNames.length} players and ${gameRows.filter((r) => r[COL.GAME]).length} game rows.`);

  if (!dryRun) await connectDB();

  // --- Users ---
  const userIdByName = {};
  for (const name of playerNames) {
    if (dryRun) {
      userIdByName[name] = `dry-run-${name}`;
      continue;
    }
    let user = await User.findOne({ username: name });
    if (!user) user = await User.create({ username: name });
    userIdByName[name] = user._id;
  }

  // --- Games ---
  let created = 0;
  let skipped = 0;

  for (const row of gameRows) {
    const name = row[COL.GAME];
    if (!name) continue;

    const completedBy = row[COL.COMPLETED_BY];
    const assignedTo = row[COL.ASSIGNED_TO];
    const forcedTo = row[COL.FORCED_TO];
    const interest = row[COL.INTEREST];
    const removedRow = Boolean(row[COL.REMOVE]);
    const removedByList = removedGameNames.has(name);

    let status = 'available';
    let ownerId = null;
    if (completedBy) {
      status = 'finished';
      ownerId = userIdByName[completedBy] ?? null;
    } else if (assignedTo) {
      status = 'in_inventory';
      ownerId = userIdByName[assignedTo] ?? null;
    } else if (forcedTo) {
      status = 'forced';
      ownerId = userIdByName[forcedTo] ?? null;
    }

    if (!ownerId && status !== 'available') {
      console.warn(`  ! "${name}" references a player not found in Players sheet — leaving it available instead.`);
      status = 'available';
    }

    const doc = {
      name,
      coinValue: Number(row[COL.COIN_VALUE]) || 0,
      forceReleaseCost: Number(row[COL.FORCE_RELEASE_COST]) || 0,
      status,
      ownerId,
      claimMethod: row[COL.CLAIM_METHOD] || null,
      released: Boolean(row[COL.RELEASED]),
      removed: removedRow || removedByList,
      interestFor: status === 'available' && interest ? (userIdByName[interest] ?? null) : null,
      dateAssigned: status === 'in_inventory' || status === 'forced' ? excelDateToJSDate(row[COL.DATE]) : null,
      dateCompleted: status === 'finished' ? excelDateToJSDate(row[COL.DATE]) : null
    };

    if (dryRun) {
      created++;
      continue;
    }

    await Game.create(doc);
    created++;
  }

  console.log(`${dryRun ? '[dry run] Would create' : 'Created'} ${created} game documents (${skipped} skipped).`);

  if (!dryRun) await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
