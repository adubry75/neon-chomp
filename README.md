# Neon Chomp

A neon Pac-Man roguelite. TypeScript + Vite + Canvas 2D. There are no asset files: all art is drawn in code and all audio is synthesized with WebAudio. Personal project, not for release.

> ### ⚠️ Disclaimer
> This is a non-commercial fan project made for fun, learning and experimentation. It is **not** affiliated with, endorsed by, or in any way connected to Bandai Namco Entertainment Inc. PAC-MAN and all related characters, names and marks are trademarks of Bandai Namco. They are used here in tribute, by someone who has lost far too many quarters to Blinky.
>
> Nothing here is for sale, and no money is made from it. It has no ads, microtransactions or loot boxes, and no ghost was harmed (well, eaten, but they respawn). All code, art and sound were created from scratch; none of the original game's assets are included.
>
> If you're from Bandai Namco and want this taken down, just ask nicely and it will vanish faster than a frightened ghost at the end of a power pellet. Please don't send the lawyers; they don't look like they'd fit in the ghost house.

## Run / test / build
```
npm install
npm run dev            # http://localhost:5173, hot reload
npm test               # Vitest sim tests: ghost AI, movement, 1000 generated mazes, fruits, bosses, determinism
npm run build          # standard Vite build → dist/index.html + dist/assets/*.js
npm run build:single   # → dist/neon-chomp.html, ONE self-contained file (JS inlined). This is the deploy/share file.
```
`build:single` runs `scripts/build-single.mjs`, which builds with Vite and then inlines the JS bundle into an HTML shell. The only external request is the Google Fonts stylesheet for "Press Start 2P" (it falls back to monospace when offline).

## Debug URLs
- `?auto=run&seed=123&stage=N`: jump straight into a run. `stage` is a 0-based index into the run plan (5 stages per act, and index 4 of each act is the boss). With the current plan, 4 = Mega Blinky, 9 = Train King, 14 = Maze Eater. Add `&tier=N` (0-5) to start on a reincarnation tier.
- `?auto=royale` (4 players) and `?auto=squad` (3 players): jump into the versus modes.
- `?auto=evil`: the Evil Pac finale on its own (never saved).
- With `&tier=3` and up, Act IV adds stages 15-19 (19 = the Null); at `&tier=5`, stage 20 is Evil Pac.
- The console exposes `__game`, e.g. `__game.world.applyFruit(__game.world.pacs[0], 'melon')`.

## How to play
**Controls**
- Solo: arrows OR WASD to move, Space/Enter for the action button (used by Pineapple dash). Gamepads work too.
- Multiplayer devices: "WASD + Space", "Arrows + Enter", and up to 4 gamepads (D-pad/left stick, A = action, B = back, Start = pause).
- Esc / P / Start pauses. M mutes.
- Any key starts a stage once you've read its intro card.
- Pause menu and Fruit Stand (Tab / gamepad Y) list your upgrades. Every upgrade lasts for the rest of the run.

**Modes**
- **Solo Run**: roguelite of 3 acts × (4 mazes + boss). After each maze you pick an upgrade at the Fruit Stand, where you can also spend coins on lives and rerolls.
- **Reincarnations (Game++)**: winning unlocks the next tier, picked with left/right on the title screen. Tiers stack:
  - **R1 Afterglow**: phantom elite ghosts that phase through walls, the Lime fruit, new palettes.
  - **R2 Echo**: Mega Blinky EX splits in two, Game++ perks, and the Heat menu.
  - **R3 Null Sector**: Act IV, with de-rez walls and the Null boss, which rewrites the maze.
  - **R4 Deja Vu**: a phantom Train King, ghost memory (ghosts ambush the junctions you use most), and the Kiwi decoy.
  - **R5 Mirror**: the Evil Pac finale, the true ending and credits.

  Each tier brings new intermissions and upgrades, and souls are x1.2 per tier.
- **Heat** (from R2): optional rules on the title menu worth +10% souls per point, with cosmetic skins at heat 4, 8 and 11. It's never needed for the story.
- **Co-op Run (1–4P)**: the same run with shared lives. A downed player becomes a bubble, and a teammate touches it to revive them.
- **Chomp Royale (2–4P)**: everyone is a Pac. Powered players can eat unpowered ones. Last one standing wins, or the top score after 2:30.
- **Ghost Squad (2–4P)**: one player is Pac and the others drive ghosts. Roles rotate each round, and ghosts score for catches.

## Cheat console
Press the backtick key (`` ` ``) to open it. The game pauses while it's open. Enter runs a code; Esc or backtick closes it. A run where you use a cheat shows "CHEATED" on the results screen and doesn't count toward best score, souls or wins.

| Code | Effect |
|---|---|
| `HELP` | List codes |
| `GOD` | Toggle invincibility (lasts across stages) |
| `LIVES n` / `COINS n` | Set lives / coins |
| `STAGE n` | Jump to stage 1-N, where N is the number of stages in this run (5 = Mega Blinky, 10 = Train King, 15 = Maze Eater) |
| `TIER n` | Restart the run on reincarnation tier 0-5 |
| `CLEAR` | Win the current maze or boss |
| `BOSSHP n` | Set boss hits / cars / cores left |
| `FRUIT id` | Apply a fruit power (e.g. `FRUIT MELON`) |
| `UPGRADE id` / `UPGRADE ALL` | Grant upgrades by id (e.g. `FLEET_FEET`) |
| `MOD id` | Add a modifier and restart the stage (e.g. `MOD ICE`, `MOD DEREZ`) |
| `POWER` | Instant power pellet |
| `SLOWMO` | Toggle half speed |

## Save data
Meta progress (souls, unlocks, perks, skins, best score, settings) is stored in `localStorage` under the key `neon-chomp-save-v1` (see `src/game/meta.ts`). It includes a `v` field, currently `2`. The key keeps its old `-v1` name so existing saves are found. v2 added `tierUnlocked`, `tierWins`, `heatBest`, `seenCutscenes` and `heatPicked`, and `migrateMeta()` upgrades v1 saves (a save with a win starts with R1 unlocked). **If you change the save shape, bump the version and migrate in `migrateMeta()`** so existing progress isn't lost.

## Layout
- `src/sim/`: pure game simulation (no DOM). Runs a fixed 60 Hz step with a seeded RNG, so it is deterministic. `world.ts` is the core.
- `src/data/`: fruits, upgrades, level tables and the classic maze. Most content changes happen here.
- `src/game/`: run structure (acts, stage plan, Fruit Stand, shop) and meta save.
- `src/render/`: canvas renderer, FX, HUD and drawing helpers.
- `src/audio/`: synth SFX and a procedural chiptune.
- `src/input/`: keyboard halves plus 4 gamepads.
- `src/main.ts`: scene state machine (title, lobby, play, stand, results, shops, settings).
- `docs/DESIGN.md`: the original design doc. `DECISIONS.md`: where the build deviates from it. `ROADMAP.md`: what's next.
