# NEON CHOMP — Pac-Man Roguelite Remix
*Design doc + build plan for Claude Opus 5.5. Personal project, not for release.*

> **Pitch:** Classic Pac-Man, with the chase rules kept exactly right, in a glowing neon style (think Championship Edition DX), turned into a **roguelite**. Each run is a string of mazes. Fruits act as wild power-ups. You pick an upgrade between mazes, a boss waits at the end of every act, and up to 4 people can play couch co-op or versus.

---

## 0. Instructions to Claude (read first)

- **Stack:** TypeScript (strict) + Vite + **Phaser (latest major)**, WebGL renderer. Target modern desktop browsers plus gamepads.
- **Zero external assets.** Draw all art as vector shapes and particles in code. Synthesize all audio with the WebAudio API (sfxr-style). That keeps the whole game in code you control.
- **Build phase by phase (Section 9).** The game must be playable at the end of every phase. Don't start a phase until the one before it meets its acceptance criteria.
- **Test what can be tested.** Write Vitest unit tests for ghost targeting, movement, collision, and the maze generator. Use Playwright to run the game headless and take screenshots after each phase so you can check the visuals yourself.
- **Keep content in data.** Fruits, upgrades, maze modifiers, and bosses live in typed definition tables (`/src/data/*.ts`). A new fruit should mean adding a table entry, not editing the engine.
- **Simulation is separate from rendering.** Run the simulation at a fixed 60 Hz timestep with a seeded RNG, so a run seed always replays the same way. Rendering interpolates between simulation steps.
- When a design choice is unclear, pick whatever makes the game **feel juicier** and note it in `DECISIONS.md`.

---

## 1. Core feel (don't mess this up)

The classic rules are what make the game work. Get these right before adding anything fancy.

- **Tile grid:** 28×31 for classic-size boards. Actors move tile to tile but render smoothly.
- **Cornering and input buffering:** the player can press a direction before reaching a turn and the move happens as soon as it's legal. Pac-Man cuts corners slightly faster than ghosts, like the arcade.
- **Ghost AI (faithful):**
  - Ghosts cycle through **Scatter** and **Chase** modes on a timer that changes per level. They flip direction whenever the mode changes.
  - **Blinky** targets Pac's tile. He gets faster as the pellets run out ("Cruise Elroy").
  - **Pinky** targets the tile 4 ahead of Pac.
  - **Inky** targets a point you get by drawing a vector from Blinky through the tile 2 ahead of Pac and doubling it.
  - **Clyde** targets Pac when more than 8 tiles away. When closer, he heads for his scatter corner.
  - Ghosts can't reverse on their own. At each intersection they pick the next tile closest to their target (tie-break order: up > left > down > right).
  - While **Frightened**, ghosts pick random turns (from the seeded RNG). When eaten, they return to the ghost house as eyes.
- **Speed tables** per level for Pac, ghosts, frightened ghosts, and ghosts in tunnels. Put them in data.
- **Game juice:** hit-stop on ghost eats (about 60 ms), screen shake, particle bursts, a combo counter that grows on screen, a dynamic music layer that speeds up as pellets run out.

---

## 2. Visual style — "Neon Arcade"

- Near-black background with bloom and glow on everything. Maze walls are glowing tubes whose color shifts per act.
- Pellets pulse softly. Power pellets throb in time with the music.
- Pac and the ghosts are clean vector shapes with glow trails at speed.
- **Frightened ghosts** turn deep blue with a wobble. When the timer is running out they flash white in sync with the beat.
- UI: a chunky arcade font drawn as vector strokes, plus combo popups that fly toward the score.
- A CRT scanline option in settings.

---

## 3. Fruit = power-ups (the star of the show)

Fruits spawn in the middle of the maze at pellet milestones (like the classic game) and sometimes in random corridors. Each one gives a **timed effect** and points. You can stack up to 2 effects at once.

| Fruit | Effect |
|---|---|
| 🍒 Cherry | **Turbo:** +40% speed for 6 s, with a trail that leaves bonus pellets behind |
| 🍓 Strawberry | **Split-Pac:** a mirror clone copies your inputs flipped left/right |
| 🍊 Orange | **Freeze:** ghosts become ice blocks for 4 s. Bumping one slides it across the maze |
| 🍎 Apple | **Magnet:** pulls in pellets within 4 tiles |
| 🍈 Melon | **GIANT PAC:** 3× size, stomps ghosts, ignores thin walls, but turns slowly. Ends with a shrink-down animation |
| 🔔 Bell | **Shockwave:** every ghost is stunned and sent to scatter mode |
| 🗝️ Key | **Secret door:** a locked wall opens to a bonus room full of coins |
| 🍍 Pineapple | **Dash:** double-tap a direction to dash 5 tiles with invincibility frames |
| 🍌 Banana | **Peel trap:** drops a peel that sends a ghost spinning backward |
| 🍇 Grapes | **Swarm:** splits into 4 mini-Pacs for 5 s (control one, the rest are AI-driven eaters) |
| 🌶️ Chili | **Fire trail:** the path behind you burns; ghosts that touch it get sent home |
| 🌈 Rainbow Fruit (rare) | **Pac-Frenzy:** every ghost is frightened for 10 s, pellets are worth 5×, and the music goes double-time |

---

## 4. Roguelite structure

- **Run** = 3 Acts × (4 mazes + 1 boss maze). Every run has a seed that can be shown and shared.
- **Between mazes: the Fruit Stand.** Pick 1 of 3 upgrades. There's also a shop that spends **Coins**, which you earn from ghost combos and bonus rooms.
- **Lives:** start with 3. Extra lives come from upgrades or score thresholds.
- **Meta-progression:**
  - Unlock new fruits in the spawn pool, new starting upgrades, alternate Pac skins, and new maze modifiers.
  - Collect "Ghost Souls" for a permanent upgrade tree. Keep it light, like Hades.
  - Save everything to localStorage.

### Upgrades (sample pool — aim for 30+)

- **Big Appetite:** power pellets last +2 s.
- **Chain Chomp:** the ghost-eat combo no longer resets between power pellets.
- **Tunnel Rat:** adds extra wrap tunnels. You speed up inside tunnels.
- **Clyde's Friend:** Clyde never chases you. Ghost points −25%.
- **Fruit Basket:** fruits spawn 2× as often.
- **Afterimage:** the first ghost hit each maze is ignored.
- **Pellet Bomb:** every 100th pellet explodes and stuns nearby ghosts.
- **Double Chomp:** power pellets can stack their duration.

### Curses (risky picks for big rewards)

- **Glass Cannon:** 1 life, but everything scores 3×.
- **Hunted:** adds a 5th ghost with a unique AI, plus better upgrade offers.

### Ghost rarities / elites

Later mazes can spawn variant ghosts:
- **Speedy Red:** faster in straight lines.
- **Phantom:** passes through one wall section every few seconds.
- **Splitter:** splits in two when eaten.
- **Shielded:** needs 2 power pellets to eat.

---

## 5. Mazes

- **Handcrafted classics:** a few mazes stored as ASCII strings in `/src/data/mazes/` (walls, pellets, power pellets, tunnels, ghost house, fruit spawn).
- **Procedural generator:** builds mazes that are **left/right mirror-symmetric** with no dead ends. Every pellet must be reachable, and each maze gets at least one wrap tunnel, a ghost house, and 4 power pellets. A good approach is packing Tetris-like wall pieces into one half and mirroring it. **Validate every generated maze** (flood fill plus a dead-end check) and regenerate if it fails.
- **Maze modifiers** (1–2 per maze in Acts 2 and 3):
  - **Blackout:** you only see a flashlight radius around Pac.
  - **Ice:** actors slide one extra tile before turning.
  - **Conveyors:** belt tiles push actors along.
  - **Teleport pads:** paired portals.
  - **Shifting walls:** some walls toggle every 10 s.
  - **Mirror World:** controls are flipped left/right.
  - **Ghost Train:** sleeping ghosts line the maze. Passing near wakes them and they follow in a conga line (CE DX-style). Eat the whole train during a power pellet for a massive combo.

---

## 6. Bosses (end of each Act)

1. **MEGA BLINKY** (Act 1): a giant ghost 4 tiles wide who roams the maze. Only the 4 power pellets hurt him, and each hit shrinks him. Between hits he spawns mini-ghosts.
2. **THE GHOST TRAIN KING** (Act 2): a looping train of 12+ ghosts led by a crowned engine. Eat the cars from the back to reach the engine, while the train speeds up.
3. **THE MAZE EATER** (Act 3): the maze falls apart from the bottom up (Pac-Man 256 glitch style), turning into an endless vertical scroller. Run from the void while ghosts pour in. Eat 3 "core" pellets to destroy the Eater.
4. *(Secret)* **EVIL PAC:** a mirror version of you with your current upgrades. It plays back your recorded inputs from earlier mazes with a delay. It unlocks after you beat the game once.

---

## 7. Multiplayer (local couch, 1–4 players, gamepads + keyboard split)

- **Co-op Run:** the full roguelite with shared lives. A downed player turns into a floating bubble; a teammate touches it to revive them. Upgrade picks are drafted in turns.
- **Ghost Squad** (Pac-Man Vs. style): 1 player is Pac and up to 3 players control ghosts. The ghost players see only a limited radius around themselves; the Pac player sees the whole maze. Roles rotate each round.
- **Chomp Royale:** 4 Pacs in one maze. Eating a power pellet lets you eat the *other players*. The last Pac standing wins. The maze shrinks over time.
- All modes use the same simulation. Each player gets their own color and glow, and the camera zooms and frames the players automatically.

---

## 8. Architecture sketch

```
src/
  main.ts                 # Phaser bootstrap
  sim/                    # pure TS, no Phaser imports, fully unit-testable
    World.ts              # fixed-step tick, seeded RNG, event bus
    Grid.ts  Movement.ts  Collision.ts
    ai/ GhostBrain.ts  targeting.ts  modes.ts
    effects/ FruitEffects.ts  Upgrades.ts  Modifiers.ts
    bosses/ MegaBlinky.ts  TrainKing.ts  MazeEater.ts
    mazegen/ Generator.ts  Validator.ts
  render/                 # Phaser scenes read sim state + events
    scenes/ Boot, Title, Run, FruitStand, Boss, Results, Versus
    fx/ Glow.ts  Particles.ts  Shake.ts  HitStop.ts
  audio/ Synth.ts  Music.ts (layered procedural chiptune)
  data/ fruits.ts  upgrades.ts  ghosts.ts  speeds.ts  mazes/
  input/ InputRouter.ts   # keyboard + Gamepad API → per-player intents
  save/ Meta.ts           # localStorage, versioned
tests/                    # vitest: targeting, movement, generator validity, determinism
```

- **Determinism test:** the same seed plus the same recorded inputs must produce the same final score. The replay system and Evil Pac both depend on this.

---

## 9. Build phases (each ends playable)

| # | Phase | Done when… |
|---|---|---|
| 1 | **Classic core** | One handcrafted maze, Pac movement with cornering, 4 faithful ghosts, scatter/chase/frightened, lives, score, level loop. Targeting unit tests pass. |
| 2 | **Neon juice** | Glow, particles, hit-stop, shake, combo popups, synth SFX, reactive music. The screenshot looks like a real game. |
| 3 | **Fruit system** | All 12 fruits working through data defs, with stacking rules and on-screen timers. |
| 4 | **Roguelite loop** | Run structure, Fruit Stand draft, coins, 15+ upgrades, curses, results screen, meta save. |
| 5 | **Procedural mazes + modifiers** | Generator with validator (1,000 generated mazes, 0 invalid in tests), plus 7 modifiers. |
| 6 | **Bosses** | Mega Blinky, Train King, Maze Eater. |
| 7 | **Multiplayer** | Input router, Co-op Run, Ghost Squad, Chomp Royale. |
| 8 | **Polish** | Elite ghosts, Evil Pac, settings (CRT, volume, remapping), 30+ upgrades, balance pass. |

---

## 10. Stretch ideas

- **Daily Seed** challenge with a local leaderboard.
- **Maze editor** (draw in-browser, export as ASCII).
- **Photo mode / GIF capture** of your best combo.
- **"Ghost POV"** single-player mode: you play as Blinky hunting an AI Pac.
