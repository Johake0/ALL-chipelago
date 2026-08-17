# ALL-Chipelago

  

**All Games**-Archipelago. The purpose of this repo is to host our custom 'EveryWorld' system.

  

## The EveryWorld System

  

_A summary of the "Every Game Archipelago Randomizer Economy" that was originally designed in Google Sheets which was later migrated into this app._

  

### Source structure

  

The spreadsheet had two sheets that drove everything:

-  **`Players`** — a single row of player names.

-  **`GameList`** — one row per copy of a game (Not per title. A game three people want exists as three separate rows), with columns: Game, Completed By, Coin Value, Force Release Cost, Date, Released, Interest, Assigned To, Claim Method, Remove, Forced To, Removed Games List.

  

A game's state lives entirely in which columns are filled in on its row, so a copy can never accidentally exist in two places at once.

  

--------------------

### Core loop

  

1. Pull a random game from the spreadsheet via **Wheel** . This will pull a random game from the pool of ALL the games listed in the [Archipelago Games Sheet](https://docs.google.com/spreadsheets/u/0/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/htmlview?gid=58422002&pli=1&pru=AAABoBtT7Uw*KLacxWVkdGMT0bQRYWo6ZA#gid=58422002) that have not yet claimed by anyone.

2. Landing on a game via spin **assigns** that copy to you in your `Hold`.

3. The **Hold** is where your claimed games are stored. The total amount of games you can have in your `Hold` at any given point is **10**.

4. When you're ready to actually sit down and play one, add it to the shared **Lobby**. You can only have one game in the Lobby at a time. You can also pull it back out of the Lobby if you added the wrong one.

5. From the Lobby, you eventually **Finish it**. This will move the game to your trophy case, and you earn coins equal to the game's `Coin Value`, multiplied by your current `Streak` bonus, plus 1.5x more on top of that if it happened to be your flagged **Bonus Game** (see below).

6.  **Releasing** a game (bailing on it instead of finishing). You can do this for a game in `The Lobby` or from a game in your `Hold`  No coins for a release, and it resets your streak.

  

---------------------------

### Coins & Streaks

  

-  **Coins** Currency used that is provided via a game's `Coin Value` and `Streak` across games you've completed (not released).

-  **Coin Value** is the amount of coins a game is "worth". Each game has a certain amount of coins assigned to it that are rewarded upon game completion

-  **Streak** counts consecutive real game completions/finishes. Quitting a game resets `Streak` to 0. A player's **Best Streak** is the longest current game streak that a user had/still has.

-  `Streak Multiplier`: each real completion pays coinValue × (1 + 0.05 × min(streak, 10)), capping at 1.5x.

-  `Streak Escalating milestone`: every 5th consecutive completion adds a flat bonus of 200 + 20 × (milestone# − 1) — 5th=200, 10th=220, 15th=240, etc.

  

### Bonus Game

  

At any given time, one game sitting in your `Hold` is randomly flagged as your **Bonus Game**. Upon finishing a bonus, game you are rewarded **1.5x** its normal reward (multiplier and streak bonuses still apply on top of that). The flag re-rolls periodically as you keep playing, and the likeliness of landing on a game that's been sitting in your `Hold` a while will increase. `Bonus Games` are not a guarantee after sitting in your `Hold` for a while, but are intended to give you a little extra reason to actually work through your `Hold` instead of letting games pile up.

  

### Free starting picks (Interest Title Games)

  

- Each player flags a small number of specific games they wanted (the **Interest** column), and claim one for free instead of leaving it to the wheel. We capped interest picks at **3 free claims per player**.

-  `Claim Method` records whether a copy was won by `Wheel` or claimed via `Interest`, so a player can't keep free-claiming past their cap.

  

### The Lobby

  

The Lobby is a shared area for everyone in the lobby. This shows whatever everyone's currently actively playing, and is supposed to mimic what's happening in the current archipelago randomizer session. You move a game there from your `Hold` when you're ready to play, and it has to be there before you can mark it finished (see Core Loop above). Only one game per player in the Lobby at a time.

  

### Trading

  

Two players can swap a game each currently holds, one-for-one. No coins involved, just an even trade between two holds.

  

### Forcing

  

A player can **force** a game from their own hold onto someone else instead of finishing it themselves. The force cost is denoted by the `Force Release Cost` on each game. The `Force Cost` is 4x the game completion reward.

  

### Rerolling

  

Don't want a game you're holding? You can put it back into the pool instead of forcing it on a friend or eating a release. Your first **5 rerolls are free**; every one after that costs coins, and the cost climbs a bit with each additional reroll you use.

  

### Coin Gifting

  

Players can hand coins directly to each other, for whatever reason. Handy for pooling coins together as a group (e.g. chipping in to help someone afford releasing a game nobody in the group wants to play).

  

### Removed / excluded games

  

-  `Removed Games` and their subsequent `Removed Games List` remove copies from the circulation entirely. They are excluded from the wheel and free pick options.

  

### Leaderboard & Activity Feed

  

The **Leaderboard** ranks everyone by coins earned, current balance, longest streak, games finished/released, and times forced onto someone else. The **Activity Feed** is a concurrent log of what's actually happening on the site.

  

### Limits

  
| Rule | Value |
|--|--|
| Max games in your hold at once | 10 |
| Free interest-list claims per player | 3 |
| Free Rerolls | 5 |
| Coins for a real finish | That copy's Coin Value |
| Coins for a release | That copy's Force/Release Cost (4x Finish Cost), and it resets your streak |
| Cost to force a game onto someone | That copy's Force/Release Cost (4x Finish Cost) |