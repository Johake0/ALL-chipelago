# AR-Chipelago

**Alternate Reality**-Archipelago. The purpose of this repo is to host our custom 'EveryWorld' system.

## The EveryWorld System

_A summary of the friend-group Archipelago randomizer economy, as originally designed in Google Sheets which was later migrated into this app._

### Source structure

The spreadsheet had two sheets that drove everything:
-   **`Players`**  — a single row of player names.
-   **`GameList`**  — one row per  **copy**  of a game (Not per title. A game three people want exists as three separate rows), with columns: Game, Completed By, Coin Value, Force Release Cost, Date, Released, Interest, Assigned To, Claim Method, Remove, Forced To, Removed Games List.

A game's state lives entirely in which columns are filled in on its row, so a copy can never accidentally exist in two places at once.

### The core loop

1.  **Spin the wheel**  — pulls a random game from the pool of ALL the games listed in the [Archipelago Games Sheet](https://docs.google.com/spreadsheets/u/0/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/htmlview?gid=58422002&pli=1&pru=AAABoBtT7Uw*KLacxWVkdGMT0bQRYWo6ZA#gid=58422002) that have not yet claimed by anyone (`Assigned To  = empty`).
2.  Winning a spin  **assigns**  that copy to you — it moves into your  **hold**.
3.  You eventually either:
    -   **Finish it**  — it moves to your trophy case, and you earn coins equal to its  **Coin Value**, or
    -   **Release it**  — you bail on it instead of finishing. No coins, and it breaks your streak.

### Coins & streak

-   **Coins**  aren't a stored number anywhere — they're always recalculated from your history: sum of  `Coin Value`  across every game you've actually finished (not released).
-   **Streak**  counts consecutive real game releases/finishes; quitting a game resets it to 0.  **Longest streak**  is the longest current game streak that a user had/still has.


### Free starting picks ("Interest")

-   Each player flags a small number of specific games they wanted (the  **Interest**  column), and claim one for free instead of leaving it to the wheel, capped at  **3 free claims per player**.
-   `Claim Method`  records whether a copy was won by  `wheel`  or claimed via  `interest`, so a player can't keep free-claiming past their cap.

### Trading

Two players can swap a game each currently holds, one-for-one — no coins involved, just an even trade between two holds.

### Forcing

A player can **force** a game from their own hold onto someone else instead of finishing it themselves — the target is now on the hook for it. `Force Release Cost` is the price tag on each copy for doing this.

### Removed / excluded games

-   `Remove`  (per-row checkbox) and a separate  `Removed Games List`  (by name) both pull a copy out of circulation entirely — excluded from the wheel, not counted as available.

### The limits, in one place

| Rule | Value |
|--|--|
| Max games in your hold at once | 10 |
| Free interest-list claims per player | 3 |
| Coins for a real finish | That copy's Coin Value |
| Coins for a release | That copy's Force Release Cost, and it resets your streak |
| Cost to force a game onto someone | That copy's Force Release Cost |

