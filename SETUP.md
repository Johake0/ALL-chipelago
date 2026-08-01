# The Chart — setup guide (v2, matched to your real sheet)

This version plugs into your actual `EveryWorld_Randomizer` Google Sheet and
your existing Apps Script — it doesn't create new tabs or touch your Coins/
Streaks/Shop/Trade formulas. It adds one thing: a hidden **"Assigned To"**
column (`GameList!H`) that tracks who currently has a game *in progress*,
since your sheet only ever recorded completions, not in-progress state.

## What's new vs. what's untouched

- **Untouched:** `Coins`, `Streaks`, `PlayerGraph`, `Players`, `GameInterests`,
  `Shop`, `ShopList`, `Trade`, `TradeList` — all your formulas and your
  existing `onEdit` / Shop-purchase / Trade-confirm / player-admin functions
  work exactly as before, whether you edit the sheet directly or use the
  website.
- **New:** `GameList!H` ("Assigned To") + two web endpoints (`spin`,
  `complete`) that the website calls.
- **Confirmed with you:** coins are only credited on actual completion —
  `spin` never touches `Player Completed`/coins, only `complete` does.

## How the loop works now

- **Spin:** picks a random game from `GameList` where nobody's finished it
  (`Player Completed` blank), nobody's currently playing it (`Assigned To`
  blank), and it's not on your Remove List. Writes the player's name into
  `Assigned To` only — no coins, no date, no effect on `Player Completed`.
  A player can't spin again while they already have something assigned.
- **Mark Finished:** writes the player's name into `Player Completed` and
  stamps `Date`, clears `Assigned To`. This is what triggers your existing
  `Coins`/`Streaks`/`PlayerGraph` formulas to update — same as if you'd
  typed the name into that cell by hand.
- **Everything else** (Release, Force, Reroll, Hint, Trap, Trades) still
  happens the way it does today, directly in the Sheet UI, using your
  existing Shop/Trade tabs and `onEdit` automation. The website doesn't
  touch those yet.

## Note on the "Assigned To" column

The script auto-creates the `H1` header ("Assigned To") the first time it
runs, so you don't need to add it by hand. If you'd rather label or
position it differently, just say so — the column index is a single
constant (`GAMELIST_COL.ASSIGNED_TO`) at the top of the new code.

## Ideas for next passes

- Wire the Shop actions (Release/Reroll/Force/Hint/Trap) into the website
  itself instead of the Sheet checkboxes — biggest lift, since Force/Trap
  need a "target player" concept the site doesn't have yet.
- Surface `Player Interest` in the wheel (bias or restrict toward games a
  specific player already flagged wanting).
- A trade UI that replaces the manual `Trade` tab entry.
- The 3-slot stockpile / reroll-before-committing idea from your original
  pitch — doesn't exist in the sheet yet either.

Say which one and I'll build it next.
