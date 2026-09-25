# Feedback Round 1: Design

Date: 2026-09-24. Source: first playtest feedback.

## Goals
Fix these problems from the first playtest:
- Boss rules were unclear.
- Ice was unplayable and not visibly on.
- Intro text disappeared before it could be read.
- Nothing showed progress within an act.
- There were no act intros or intermissions.
- Upgrades in effect were hard to see.

Also add a cheat console for testing.

## Constraints
- `src/sim/` stays pure and deterministic (no DOM, no `Math.random`). Presentation-only features live in `src/main.ts` / `src/render/`.
- `npx tsc -p .` and `npm test` pass after every item. Deliverable: `npm run build:single`.
- The localStorage save shape does not change.
- Deviations from `docs/DESIGN.md` are logged in `DECISIONS.md`.
- One commit per item, in the order below. Nothing is pushed until the user has playtested it.

## 1. Press-a-key start
- On stage start (run) and round start (versus), the world is not updated. The intro card stays up with a blinking "PRESS ANY KEY" prompt.
- Any key or gamepad button (confirm/action/any direction) releases the hold. Then the normal READY countdown runs.
- Respawns after a death skip the card and go straight to READY, as they do now.
- The intro card no longer depends on `phaseT`. It shows while the hold is active.
- Implementation: a hold flag in `main.ts`. `World` is untouched.

## 2. Boss clarity
- Boss stages use a distinct intro card: red "⚠ BOSS ⚠" header, boss name, plain-language rules:
  - Mega Blinky: "Eat a power pellet, then chomp him. 4 hits to win. Power pellets respawn."
  - Train King: "Power up and eat all 12 train cars, then chomp the King."
  - Maze Eater: "Outrun the rising void. Eat 3 cores to push it back."
- Top-of-screen boss health bar, shown on every boss stage:
  - Mega Blinky: hp/maxHp.
  - Train King: cars remaining + king.
  - Maze Eater: cores remaining.
- Replaces the small bottom-HUD text and the dots above Mega Blinky. The dots may stay as extra feedback.
- On each hit (`bossHit` event), a large floating "N HITS LEFT!" message ("LAST HIT!" at 1).

## 3. Ice rework
- New behavior: when Pac's desired direction changes to a new perpendicular direction, a latch is set to `ICE_SLIDE` tiles (constant, default 0.5). The latch counts down by the distance moved. A turn is allowed only once the latch is 0.
  - Pressing ≥ 0.5 tile before a junction center makes the turn. Pressing later slides past it.
  - The queued turn is kept and taken at the next opening.
  - Reversing is always instant and clears the latch.
  - Cornering stays disabled on ice.
  - Mini-pacs are unaffected, as today.
- The latch replaces `iceHold` on `Pac` (sim state, deterministic).
- `MODIFIERS.ice.desc` becomes "Slippery! Press turns early."
- Visuals: a frosty blue tint over the maze floor while ice is active.
- Modifier badges: the HUD shows a persistent badge (name, in modifier color) for every active modifier, not only ice.
- Tests (`tests/sim.test.ts`):
  - Pressing 0.6 tile before a junction turns there.
  - Pressing 0.3 tile before slides past and turns at the next valid opening.
  - Reversing is immediate.

## 4. Act progress
- HUD stage label becomes `ACT I` followed by 5 pips: ● cleared, ◉ current, ○ upcoming, ☠ boss (the 5th pip; highlighted when current).
- Run mode only.

## 5. Act title cards and chase gags
- New scene `cutscene` in `main.ts`, and new file `src/render/cutscenes.ts`:
  - Each cutscene is a function `(ctx, t) => boolean` (true = finished), driven by elapsed time and drawn with existing `draw.ts` helpers.
  - Skippable with any key after a short debounce (0.3s).
- Title card: full-screen act name (`ACTS[a]`) with a music sting, about 2.5s.
- Flow:
  - New run: Act I title card → stage 1.
  - After the Fruit Stand that follows each boss: chase gag → next act title card → next stage.
  - After the Maze Eater: victory gag → results.
- Cutscenes:
  - **I→II:** Blinky chases Pac right-to-left offscreen; a giant Pac returns chasing a blue Blinky.
  - **II→III:** the ghost train chugs across with one empty car. Pac hops in and rides off. The screen glitches and a void creeps in from one edge.
  - **Ending:** Pac eats the last core. The void collapses. The ghosts wave a white flag. "THE END?"
- Run modes only (solo/co-op). Versus modes are unaffected.

## 6. Upgrades panel
- New render helper `drawUpgradeList(ctx, run, x, y, w)`. Each row shows glyph, name, ×N, and description, colored by `RARITY_COLOR`, using `UPGRADE_BY_ID`.
- Pause menu: replaces the current names-only list. It is a two-column layout if the list is long.
- Fruit Stand: replaces the grey "HAVE:" line with a row of owned-upgrade glyph chips. A key (Tab / gamepad Y) toggles a full-screen owned-upgrades overlay using the same helper.

## 7. Cheat console
- Backtick opens a one-line console overlay and pauses the game.
  - While open, keystrokes go to the console, not the game.
  - Enter runs the command. Esc or backtick closes the console.
  - Output: a small scrollback of the last few messages.
- `src/game/cheats.ts`: pure `runCheat(cmd: string, ctx: CheatCtx): string` over `{ run, world, jumpToStage }`. Case-insensitive. Returns a message ("OK: …" or an error).
- Commands:

  | Command | Effect |
  |---|---|
  | `GOD` | Toggle `world.god` |
  | `LIVES n` | Set lives |
  | `COINS n` | Set coins |
  | `STAGE n` | Jump to stage n, where n is 1–15 |
  | `CLEAR` | Win the current stage |
  | `BOSSHP n` | Set the current boss's health |
  | `FRUIT id` | Apply a fruit power |
  | `UPGRADE id\|ALL` | Grant an upgrade |
  | `MOD id` | Add a modifier and rebuild the stage |
  | `POWER` | Instant power-pellet effect |
  | `SLOWMO` | Toggle half-speed game |
  | `HELP` | List the commands |

- Sim change: `World.god: boolean`, default false. The pac-death check is skipped when true. Deterministic, off by default.
- `SLOWMO` scales the main-loop accumulator in `main.ts`. The sim is untouched.
- Any successful cheat sets `run.cheated = true` (run object only, not the save):
  - The results screen shows "CHEATED".
  - Best score and souls are not updated for that run.
- Tests: parser/executor unit tests for argument parsing, unknown commands, `LIVES`/`COINS`/`UPGRADE`, and the `cheated` flag.

## Out of scope
Roadmap items, touch controls, new content, and balance changes other than ice.
