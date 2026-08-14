# AR-Chipelago

**Alternate Reality**-Archipelago. The purpose of this repo is to host our custom 'EveryWorld' system.

## The EveryWorld System

_A summary of the "Every Game Archipelago Randomizer Economy" that was originally designed in Google Sheets which was later migrated into this app._

### Source structure

The spreadsheet had two sheets that drove everything:
-   **`Players`**  — a single row of player names.
-   **`GameList`**  — one row per  copy  of a game (Not per title. A game three people want exists as three separate rows), with columns: Game, Completed By, Coin Value, Force Release Cost, Date, Released, Interest, Assigned To, Claim Method, Remove, Forced To, Removed Games List.

A game's state lives entirely in which columns are filled in on its row, so a copy can never accidentally exist in two places at once.

--------------------
### Core loop

1.  Pull a random game from the spreadsheet via **Wheel**  — pulls a random game from the pool of ALL the games listed in the [Archipelago Games Sheet](https://docs.google.com/spreadsheets/u/0/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/htmlview?gid=58422002&pli=1&pru=AAABoBtT7Uw*KLacxWVkdGMT0bQRYWo6ZA#gid=58422002) that have not yet claimed by anyone (`Assigned To = Empty`).
2.  Landing on a game via spin  **assigns**  that copy to you in your `Hold`
3. The **Hold** is where your claimed games are stored. The total amount of games you can have in your `Hold`  at any given point is **10**.
4. Each player takes a game from their `Hold` to play in an Archipelago Randomizer session.
5. You eventually either:
    -   **Finish it**  — it moves to your trophy case, and you earn coins equal to the game's `Coin Value` in addition to multiplicative bonuses provided by your current `Game Streak`.
    -   **Release it**  — you bail on it instead of finishing. No coins, and it breaks your streak.
---------------------------
### Coins & Streaks

-   **Coins**  Currency used that is provided via a game's  `Coin Value` and `Streak` across games you've completed (not released).
- **Coin Value** is the amount of coins a game is "worth". Each game has a certain amount of coins assigned to it that are rewarded upon game completion
-   **Streak**  counts consecutive real game completions/finishes. Quitting a game resets `Streak` to 0.  A player's **Best Streak**  is the longest current game streak that a user had/still has.
	- `Streak Multiplier`: each real completion pays coinValue × (1 + 0.05 × min(streak, 10)), capping at 1.5x.
    - `Streak Escalating milestone`: every 5th consecutive completion adds a flat bonus of 200 + 20 × (milestone# − 1) — 5th=200, 10th=220, 15th=240, etc.


### Free starting picks (Interest Title Games)

-   Each player flags a small number of specific games they wanted (the  **Interest**  column), and claim one for free instead of leaving it to the wheel. We capped interest picks at  **3 free claims per player**.
-   `Claim Method`  records whether a copy was won by  `Wheel`  or claimed via  `Interest`, so a player can't keep free-claiming past their cap.

### Trading

Two players can swap a game each currently holds, one-for-one. No coins involved, just an even trade between two holds.

### Forcing

A player can **force** a game from their own hold onto someone else instead of finishing it themselves. The force cost is denoted by the `Force Release Cost` on each game. The `Force Cost` is 4x the game completion reward. 


### Removed / excluded games

-   `Removed Games` and their subsequent  `Removed Games List` remove copies from the circulation entirely. They are excluded from the wheel and free pick options.

### Limits

| Rule | Value |
|--|--|
| Max games in your hold at once | 10 |
| Free interest-list claims per player | 3 |
| Free Rerolls | 5 |
| Coins for a real finish | That copy's Coin Value |
| Coins for a release | That copy's Force/Release Cost (4x Finish Cost), and it resets your streak |
| Cost to force a game onto someone | That copy's Force/Release Cost (4x Finish Cost) |

