# Feedback Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 7 playtest fixes in `docs/superpowers/specs/2026-09-24-feedback-round-1-design.md`.

**Architecture:**
- Sim changes are limited to:
  - the ice latch (`world.ts` and `entities.ts`)
  - a `god` flag (`world.ts`)
- Everything else is presentation:
  - scene flow in `src/main.ts`
  - drawing in `src/render/`
  - a pure cheat module in `src/game/cheats.ts`
- Pure logic (ice, cheats, act pips) gets unit tests in `tests/`.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D.

**Verification after every task:** run `npx tsc -p .` and `npm test`. Both must pass before the commit. Commit messages end with the Co-Authored-By trailer.

---

## File map
| File | Change |
|---|---|
| `src/sim/entities.ts` | `iceHold` → `iceDir` + `iceSlide` |
| `src/sim/world.ts` | ice latch in pac movement; `god` flag in `hurtPac` |
| `src/sim/modifiers.ts` | `ICE_SLIDE` constant, new ice desc |
| `src/game/run.ts` | `BOSS_INFO.rules`, `actPips()`, `cheated` flag |
| `src/game/cheats.ts` (new) | `runCheat()` parser/executor |
| `src/render/renderer.ts` | `HudInfo` fields (`introHold`, `boss`, `pips`), intro card, boss bar, hit popups, ice tint, modifier badges |
| `src/render/cutscenes.ts` (new) | act title card + 3 chase gags |
| `src/render/upgrades.ts` (new) | `drawUpgradeList()` |
| `src/main.ts` | intro hold, cutscene scene, console overlay, slowmo, upgrades overlay, cheated handling |
| `tests/sim.test.ts` | ice tests |
| `tests/game.test.ts` (new) | pips + cheats tests |
| `DECISIONS.md` | ice, press-to-start, cutscenes, cheats |

---

### Task 1: Press-a-key start

**Files:** Modify `src/main.ts`, `src/render/renderer.ts`.

- [ ] Add `introHold = false` to `Game`. Set it to `true` in `startStage()`, `startRoyale()` and `startSquad()`, after the world is created.
- [ ] In `play()`, after the pause check: if `introHold`:
  - draw the world with `dt`, then return;
  - release the hold when `input.anyKeyThisFrame`, or when any pad has `a`/`start`/a direction edge (add `anyPadEdge()` to `Input`: true when any pad's `a`, `b`, `start` or `dir` changed from its previous not-pressed state). Also set `acc = 0`;
  - never call `w.update()` while held.
- [ ] `HudInfo.introHold?: boolean`, passed from `hudInfo()`.
- [ ] `drawBanner`:
  - the intro card is shown when `hud.introHold`, instead of the `phaseT` heuristic;
  - it gets a blinking `PRESS ANY KEY` line under the modifiers (`Math.floor(this.time * 2) % 2`);
  - when not held, READY shows with no card;
  - make the panel tall enough for the modifier lines.
- [ ] Keep the controls hint visible while held.
- [ ] Run tsc and tests, then commit `Hold stage intro card until a key is pressed`.

### Task 2: Boss clarity

**Files:** Modify `src/game/run.ts`, `src/main.ts`, `src/render/renderer.ts`.

- [ ] `BOSS_INFO` gets a `rules: string[]` field (2 short lines each):
  - mega: `['EAT A POWER PELLET, THEN CHOMP HIM.', '4 HITS TO WIN. PELLETS RESPAWN.']`
  - train: `['POWER UP AND EAT ALL 12 TRAIN CARS,', 'THEN CHOMP THE KING.']`
  - eater: `['OUTRUN THE RISING VOID.', 'EAT 3 CORES TO PUSH IT BACK.']`
- [ ] `HudInfo.boss?: { name; rules; color }`, set in `hudInfo()` for boss stages.
- [ ] Boss intro card when `hud.boss && introHold`:
  - blinking red `⚠ BOSS ⚠` header;
  - name in boss color;
  - rules lines in white;
  - a larger panel.
- [ ] Boss bar in `drawHud` (run mode, boss stage), under the score row at y ≈ `2.6*T`:
  - label, plus a segmented bar across the middle ~60% width;
  - mega: `hp/maxHp` segments;
  - train: 12 car segments (`cars.filter(alive)`), plus the king once cars are 0 (`KING EXPOSED!`);
  - eater: 3 core segments;
  - remove the old bottom-bar boss text lines.
- [ ] Hit popups in `Renderer.handle`:
  - `bossHit`: large popup `N HITS LEFT!` / `LAST HIT!` from `e.s`;
  - `core`: `N CORES LEFT!` from `e.s`.
- [ ] Run tsc and tests, then commit `Boss intro card, boss health bar and hit callouts`.

### Task 3: Ice rework

**Files:** Modify `src/sim/entities.ts`, `src/sim/world.ts`, `src/sim/modifiers.ts`, `src/render/renderer.ts`. Test: `tests/sim.test.ts`.

- [ ] **Write failing tests** (append to the `movement` describe or a new `ice` describe):

```ts
describe('ice', () => {
  // classic maze row 5 is a corridor; tile (6,5) is a 4-way junction and (1,5) turns down too.
  const iceWorld = (x: number) => {
    const w = new World({ ...cfg(4), modifiers: ['ice'] });
    w.phase = 'play';
    for (const g of w.ghosts) g.state = 'gone' as never;   // keep ghosts out of the way
    const p = w.pacs[0]; p.x = x; p.y = 5.5; p.dir = LEFT; p.desired = LEFT;
    w.setInput(0, LEFT, false); w.update();               // settle moving left
    return w;
  };
  it('turns when the turn is pressed well before the junction', () => {
    const w = iceWorld(7.3);  // after one tick, ~0.6+ tiles before 6.5
    for (let i = 0; i < 40; i++) { w.setInput(0, DOWN, false); w.update(); }
    expect(w.pacs[0].x).toBe(6.5);
    expect(w.pacs[0].y).toBeGreaterThan(6);
  });
  it('slides past when the turn is pressed too late', () => {
    const w = iceWorld(6.8);
    for (let i = 0; i < 12; i++) { w.setInput(0, DOWN, false); w.update(); }
    expect(w.pacs[0].x).toBeLessThan(6.5);
    expect(w.pacs[0].y).toBe(5.5);
  });
  it('reverses instantly', () => {
    const w = iceWorld(9.5);
    w.setInput(0, RIGHT, false); w.update();
    expect(w.pacs[0].dir).toBe(RIGHT);
  });
});
```

  If `g.state = 'gone'` breaks the ghost update, use the existing ghost-state value that means removed (check `entities.ts`), or move ghosts far away and set `p.invulnT = 99`.

- [ ] Run `npx vitest run -t ice`. Expected: the "well before" test FAILS on current code (current code always skips the first junction).
- [ ] **Implement:**
  - In `entities.ts`, replace `iceHold: Dir` with `iceDir: Dir; iceSlide: number;` and a comment. Update both init sites in `world.ts` (`iceDir: NONE, iceSlide: 0`).
  - In `modifiers.ts`, add `export const ICE_SLIDE = 0.5;` (tiles a new turn must slide before it can take effect) and set the ice desc to `'Slippery! Press turns early.'`.
  - In `world.ts`, change the pac movement block:

```ts
const ice = this.has('ice') && p.kind !== 'mini';
if (p.kind !== 'mini') {
  if (p.desired !== NONE && p.desired === opposite(p.dir)) { p.dir = p.desired; p.iceDir = NONE; p.iceSlide = 0; }
  else if (!ice) tryCorner(p, p.desired, m);
  else if (p.desired !== NONE && p.desired !== p.dir && p.desired !== p.iceDir) { p.iceDir = p.desired; p.iceSlide = ICE_SLIDE; }
}
const stepDist = this.pacSpeed(p) * TICK;
if (ice) p.iceSlide = Math.max(0, p.iceSlide - stepDist);
// decide():
if (ice && canWant && want !== mv.dir && canStraight && p.iceSlide > 0) return mv.dir;
if (canWant) { p.iceDir = NONE; return want; }
```

    Then pass `stepDist` to `advance`.
- [ ] Run tests. Expected: all pass, including determinism and the modifier smoke test.
- [ ] **Render:**
  - ice tint: in `drawMaze`, when `w.has('ice')`, fill the maze area with `rgba(160,240,255,0.07)` using `'lighter'` plus a few slow drifting sparkle dots from `this.time`;
  - modifier badges: in `drawHud` (run mode), draw each active modifier as a small rounded pill in its color at the top-left under `1UP` (y ≈ `2.65*T`). Remove the old bottom-center modifier text.
- [ ] Run tsc and tests, then commit `Rework ice: half-tile slide, frosty tint, modifier badges`.

### Task 4: Act progress pips

**Files:** Modify `src/game/run.ts`, `src/main.ts`, `src/render/renderer.ts`. Test: `tests/game.test.ts` (new).

- [ ] **Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { actPips } from '../src/game/run';
describe('actPips', () => {
  it('marks cleared, current, upcoming and boss', () => {
    expect(actPips(2)).toEqual(['done', 'done', 'current', 'todo', 'boss']);
    expect(actPips(4)).toEqual(['done', 'done', 'done', 'done', 'bossCurrent']);
    expect(actPips(5)).toEqual(['current', 'todo', 'todo', 'todo', 'boss']);
  });
});
```

- [ ] **Implement** in `run.ts`:

```ts
export type Pip = 'done' | 'current' | 'todo' | 'boss' | 'bossCurrent';
export function actPips(stage: number): Pip[] {
  const idx = stage % STAGES_PER_ACT;
  return Array.from({ length: STAGES_PER_ACT }, (_, i) =>
    i === STAGES_PER_ACT - 1 ? (i === idx ? 'bossCurrent' : 'boss') : i < idx ? 'done' : i === idx ? 'current' : 'todo');
}
```

- [ ] `HudInfo.pips?: Pip[]` and `stageLabel = 'ACT I'` etc.
- [ ] `drawHud` draws the label, then pips to the right edge:
  - `done`: filled dot;
  - `current`: pulsing ring + dot;
  - `todo`: hollow;
  - `boss`/`bossCurrent`: ☠, red, pulsing when current.
- [ ] Run tsc and tests, then commit `Act progress pips in HUD`.

### Task 5: Act title cards and chase gags

**Files:** Create `src/render/cutscenes.ts`. Modify `src/main.ts`.

- [ ] `cutscenes.ts` exports:

```ts
export type CutsceneId = 'title0' | 'title1' | 'title2' | 'gag1' | 'gag2' | 'ending';
export const CUTSCENE_LEN: Record<CutsceneId, number>; // title 2.8s, gags ~8s, ending ~9s
export function drawCutscene(c: Ctx, id: CutsceneId, t: number): void; // pure drawing from elapsed time
```

  - Title cards: `ACTS[a]` split on ` · ` into two lines (`ACT II` big, `GHOST RAILS` in the act color), with a scanline wipe-in.
  - gag1: Blinky chases Pac L←R across the screen at y=VH/2; beat; a giant Pac (r≈90) chases a blue Blinky back R→L.
  - gag2: a ghost train (Blinky head + cars, one empty/dim) crosses; Pac hops into the empty car and rides off; then a glitch (RGB-offset bars, jitter) and a purple void rises from the bottom.
  - ending: the void collapses to a dot; 4 ghosts line up with a white flag; `THE END?` text.
  - All drawing uses `drawPac`/`drawGhost`/`text` from `draw.ts`.
- [ ] `main.ts`:
  - new scene `'cutscene'` with a `cutQueue: CutsceneId[]` and `cutThen: () => void`;
  - `playCutscenes(ids, then)` sets up the queue and goes to the scene;
  - the scene draws the current one with `sceneT`, advances when `sceneT >= CUTSCENE_LEN`, and on any key after 0.3s skips the current one;
  - when the queue is empty, call `cutThen()`.
- [ ] Flow:
  - `startRun`: `playCutscenes(['title0'], () => this.startStage())`;
  - in the stand's `startStage` calls, if `run.current.index === 0 && run.stage > 0` (a new act is starting), play `['gag' + act, 'title' + act]` first;
  - `finishWorld`: when `run.advance()` returns false (won), `playCutscenes(['ending'], () => this.endRun(true))`;
  - `?auto=run` skips cutscenes (direct `startStage`).
- [ ] Track: `trackFor('cutscene')` returns `'stand'` (reuse existing music).
- [ ] Run tsc and tests, then commit `Act title cards and arcade-style intermissions`.

### Task 6: Upgrades panel

**Files:** Create `src/render/upgrades.ts`. Modify `src/main.ts`.

- [ ] `drawUpgradeList(c, owned: Record<string, number>, x, y, w, maxRows?)`:
  - one row per owned upgrade: glyph (rarity color), `NAME xN`, and the description on a second smaller line;
  - two columns when the count > maxRows;
  - uses `UPGRADE_BY_ID` and `RARITY_COLOR`;
  - shows `NO UPGRADES YET` when empty.
- [ ] Pause menu: replace the name list with `drawUpgradeList` below the menu.
- [ ] Fruit Stand: replace the grey `HAVE:` line with a glyph chip row and `TAB / (Y): VIEW YOUR UPGRADES`.
  - Tab (`input.key('Tab')`, preventDefault in `Input`) or pad button 3 toggles `standOverlay`;
  - while the overlay is on, draw a dim backdrop + `drawUpgradeList`, and any confirm/back closes it;
  - add `y` to `PadState` (`btn(3)`) and `Input.upgradesToggle()`.
- [ ] Run tsc and tests, then commit `Upgrades panel in pause menu and Fruit Stand`.

### Task 7: Cheat console

**Files:** Create `src/game/cheats.ts`. Modify `src/sim/world.ts`, `src/game/run.ts`, `src/main.ts`, `src/input/input.ts`. Test: `tests/game.test.ts`.

- [ ] **Failing tests:** in `tests/game.test.ts`, build a `Run` with a stub meta (`defaultMeta()` from `meta.ts`, or whatever `loadMeta` falls back to) and its world. Cover:
  - `runCheat('lives 9')` sets `run.lives`/`world.lives` to 9 and `run.cheated` true;
  - `COINS 500`;
  - `UPGRADE fleet_feet` increments `run.upgrades.fleet_feet`;
  - `UPGRADE all`;
  - `GOD` toggles `world.god`;
  - `bogus` returns an error string starting with `?` and leaves `cheated` false;
  - `STAGE 99` is rejected;
  - `STAGE 10` calls `jumpToStage(9)`.
- [ ] **Implement** `cheats.ts`:

```ts
export interface CheatCtx { run: Run | null; world: World | null; jumpToStage(i: number): void; rebuildStage(): void; toggleSlowmo(): boolean }
export const CHEAT_HELP = 'GOD LIVES n COINS n STAGE 1-15 CLEAR BOSSHP n FRUIT id UPGRADE id|ALL MOD id POWER SLOWMO';
export function runCheat(input: string, ctx: CheatCtx): string
```

  - Parse `[cmd, arg]` (uppercase cmd, lowercase arg). Commands that need a run/world return `? START A RUN FIRST` when missing.
  - `CLEAR`: `world.maze.pelletsLeft = 0` for normal stages; for bosses call a new `World.cheatDefeatBoss()` that runs `bossDown` at the pac's position.
  - `BOSSHP n`: mega `hp = clamp(n,1,maxHp)`; eater `coresLeft`; train kills cars down to n.
  - `FRUIT id`: validate against `FRUIT_IDS` and `world.applyFruit(world.mainPacs[0], id)`.
  - `MOD id`: validate against `MODIFIERS`, push to `run.plan[run.stage].modifiers`, `rebuildStage()`.
  - `POWER`: `world.powerT = max(powerT, 8)` and fright the ghosts. Find the existing power-pellet routine in `world.ts` (`eatPower` or the power branch around line 556). Expose it as `cheatPower()`.
  - `SLOWMO`: `toggleSlowmo()`.
  - Successful commands set `run.cheated = true` (when a run exists) and return `OK: …`.
- [ ] `world.ts`: `god = false;` field. In `hurtPac`, `if (this.god && p.kind === 'main') return;` near the top. Void and ghost hits both route through `hurtPac`.
- [ ] `run.ts`: `cheated = false;`.
- [ ] `main.ts`:
  - `console: { open: boolean; text: string; log: string[] }`;
  - a `keydown` listener in `Game` for Backquote toggles it;
  - while open, `e.key` characters append (Backspace deletes, Enter runs, Escape closes), and input is suppressed: add `Input.suspended` which makes `keydown` ignore game handling;
  - draw the overlay (bottom panel, last 4 log lines, blinking cursor) on top of any scene;
  - while open, `play()` doesn't step the world;
  - `slowmo` halves `dt` added to `acc`;
  - `jumpToStage(i)` sets `run.stage = i` then `startStage()`;
  - `rebuildStage()` = `startStage()`;
  - `endRun`: if `run.cheated`, skip the `best`/`souls`/`wins`/`bossesBeaten` updates and show `CHEATED — NOT SAVED` on results.
- [ ] Run tsc and tests, then commit `Backtick cheat console`.

### Task 8: Docs and build

- [ ] Add to `DECISIONS.md`: ice half-tile slide; press-any-key intro; act cutscenes (story beats); cheat console always on, and cheated runs don't touch the save.
- [ ] Add to `README.md`: a Cheat console section (codes list) and a note about the upgrades overlay.
- [ ] Run `npm run build:single`. Expected: `dist/neon-chomp.html written`.
- [ ] Commit `Docs for feedback round 1`. Do not push. The user playtests first.
