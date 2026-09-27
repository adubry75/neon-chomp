# Tier Framework (Game++ Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reincarnation tiers R0–R5 from start to finish. That means a save v2 with migration, tier unlocks on wins, a tier-scaled soul payout, a tier picker, the `sting` cutscene and debug hooks. No tier twists yet.

**Architecture:** A data table `src/data/tiers.ts` holds tier names and soul multipliers. The save logic (migration, recording a win) is pure functions in `src/game/meta.ts`, so it can be tested without `localStorage`. `Run` carries `tier`. `main.ts` wires up the UI. The sim (`src/sim/`) is not touched in this step.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-09-27-game-plus-reincarnations-design.md` (section "Step 1: tier framework").

**Deviations from the spec (on purpose):**
- The tier picker lives on the **title screen** (left/right while SOLO RUN or CO-OP RUN is highlighted). Solo has no lobby, so the title screen is the only place both modes share. The co-op lobby shows the chosen tier as read-only text.
- `twists` and `twistsFor()` are **not** added yet. Nothing reads them in this step (YAGNI). Step 3 (R1 / Phantom) adds them.
- The HUD "badge" is the stage label prefix (`R1 · ACT I`), so the renderer doesn't change.

**Verification after every task:** `npx tsc -p .` and `npm test` both pass.

---

### Task 1: Tier table

**Files:**
- Create: `src/data/tiers.ts`
- Test: `tests/game.test.ts` (append)

- [ ] **Step 1: Write the failing test.** Append to `tests/game.test.ts`, and add the import at the top:

```ts
import { MAX_TIER, TIERS, tierLabel, tierSouls } from '../src/data/tiers';

describe('tiers', () => {
  it('has R0 through R5', () => {
    expect(TIERS.map(t => t.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(MAX_TIER).toBe(5);
    expect(tierLabel(0)).toBe('R0 · ARCADE');
    expect(tierLabel(2)).toBe('R2 · ECHO');
  });
  it('scales souls by 1.2 per tier, rounded down', () => {
    expect(tierSouls(100, 0)).toBe(100);
    expect(tierSouls(100, 1)).toBe(120);
    expect(tierSouls(100, 2)).toBe(144);
    expect(tierSouls(7, 1)).toBe(8); // 8.4 → 8
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** `npx vitest run tests/game.test.ts`. Expected: FAIL (cannot resolve `../src/data/tiers`).

- [ ] **Step 3: Implement** `src/data/tiers.ts`:

```ts
/** Reincarnation tiers (Game++). R0 is the base game; each win on your highest tier unlocks the next. */
export interface TierDef {
  id: number;
  name: string;
  color: string;
  /** Multiplier on souls earned by a run at this tier. */
  soulMult: number;
}

const NAMES = ['Arcade', 'Afterglow', 'Echo', 'Null Sector', 'Déjà Vu', 'Mirror'];
const COLORS = ['#ffe600', '#ff8a3d', '#5ce1ff', '#b45cff', '#ff5cf0', '#ff2d55'];

export const TIERS: TierDef[] = NAMES.map((name, id) => ({ id, name, color: COLORS[id], soulMult: 1.2 ** id }));
export const MAX_TIER = TIERS.length - 1;

export const tierLabel = (tier: number) => `R${tier} · ${TIERS[tier].name.toUpperCase()}`;
export const tierSouls = (base: number, tier: number) => Math.floor(base * TIERS[tier].soulMult + 1e-9);
```

(The `1e-9` guards against float error such as `100 * 1.44 = 143.99999`.)

- [ ] **Step 4: Run the tests.** `npx vitest run tests/game.test.ts`. Expected: PASS. Then `npx tsc -p .`, which should show no errors.

- [ ] **Step 5: Commit.**
```bash
git add src/data/tiers.ts tests/game.test.ts
git commit -m "Add reincarnation tier table"
```

---

### Task 2: Save v2, migration, and recording wins

**Files:**
- Modify: `src/game/meta.ts` (the `MetaSave` interface, `defaultMeta`, `loadMeta`)
- Modify: `src/main.ts:781-783` (delete `loadMetaDefault`, use `defaultMeta`)
- Test: `tests/game.test.ts` (append)

- [ ] **Step 1: Write the failing tests.** Change the meta import at the top of `tests/game.test.ts` to `import { defaultMeta, migrateMeta, recordWin } from '../src/game/meta';`, then append:

```ts
describe('save v2', () => {
  const v1 = (wins: number) => ({
    v: 1, souls: 50, best: 9000, runs: 8, wins, bossesBeaten: 4,
    unlockedFruits: ['banana'], perks: { start_lives: 1 }, skin: '#5cffc8',
    settings: { bloom: 1, crt: true, music: 0.3, sfx: 0.5, shake: false },
  });
  it('migrates a v1 save with a win to R1 unlocked, keeping everything else', () => {
    const m = migrateMeta(v1(1));
    expect(m.v).toBe(2);
    expect(m.tierUnlocked).toBe(1);
    expect(m.tierWins).toEqual([0, 0, 0, 0, 0, 0]);
    expect(m.heatBest).toBe(0);
    expect(m.seenCutscenes).toEqual([]); // they still get the sting on their next win
    expect(m.souls).toBe(50);
    expect(m.perks).toEqual({ start_lives: 1 });
    expect(m.settings.crt).toBe(true);
  });
  it('migrates a v1 save without wins to R0', () => {
    expect(migrateMeta(v1(0)).tierUnlocked).toBe(0);
  });
  it('keeps v2 fields as they are', () => {
    const m = { ...defaultMeta(), tierUnlocked: 3, tierWins: [1, 1, 1, 0, 0, 0], seenCutscenes: ['sting'] };
    const out = migrateMeta(JSON.parse(JSON.stringify(m)));
    expect(out.tierUnlocked).toBe(3);
    expect(out.tierWins).toEqual([1, 1, 1, 0, 0, 0]);
    expect(out.seenCutscenes).toEqual(['sting']);
  });
  it('unlocks the next tier only on a win at the highest unlocked tier', () => {
    const m = defaultMeta();
    expect(recordWin(m, 0)).toBe(1);
    expect(m.tierUnlocked).toBe(1);
    expect(recordWin(m, 0)).toBe(null); // replaying R0 unlocks nothing
    expect(m.tierUnlocked).toBe(1);
    expect(m.tierWins[0]).toBe(2);
    expect(m.wins).toBe(2);
  });
  it('caps at R5', () => {
    const m = { ...defaultMeta(), tierUnlocked: 5 };
    expect(recordWin(m, 5)).toBe(null);
    expect(m.tierUnlocked).toBe(5);
    expect(m.tierWins[5]).toBe(1);
  });
});
```

- [ ] **Step 2: Run them and check that they fail.** `npx vitest run tests/game.test.ts`. Expected: FAIL (`migrateMeta` / `recordWin` are not exported).

- [ ] **Step 3: Implement it in `src/game/meta.ts`.**

Add the import: `import { MAX_TIER, TIERS } from '../data/tiers';`

Change the interface to use `v: 2` and add these fields after `bossesBeaten`:
```ts
  /** Highest reincarnation tier the player may start a run on (0..MAX_TIER). */
  tierUnlocked: number;
  /** Wins per tier, index = tier. */
  tierWins: number[];
  /** Highest heat cleared (Heat arrives in a later step). */
  heatBest: number;
  /** One-time cutscenes already shown, e.g. 'sting'. */
  seenCutscenes: string[];
```

Update `defaultMeta()`:
```ts
export const defaultMeta = (): MetaSave => ({
  v: 2, souls: 0, best: 0, runs: 0, wins: 0, bossesBeaten: 0,
  tierUnlocked: 0, tierWins: TIERS.map(() => 0), heatBest: 0, seenCutscenes: [],
  unlockedFruits: [], perks: {}, skin: '#ffe600',
  settings: { bloom: 2, crt: false, music: 0.6, sfx: 0.8, shake: true },
});
```

Replace the body of `loadMeta` and add `migrateMeta` and `recordWin`:
```ts
/** Bring any saved shape (v1 or v2) up to the current MetaSave. */
export function migrateMeta(raw: Partial<MetaSave> & { v?: number }): MetaSave {
  const d = defaultMeta();
  const m: MetaSave = {
    ...d, ...raw, v: 2,
    settings: { ...d.settings, ...raw.settings },
    perks: { ...raw.perks },
    tierWins: d.tierWins.map((_, i) => raw.tierWins?.[i] ?? 0),
    seenCutscenes: [...(raw.seenCutscenes ?? [])],
  };
  // v1 → v2: a player who has already won starts with Reincarnation 1 open.
  if ((raw.v ?? 1) < 2) m.tierUnlocked = (raw.wins ?? 0) > 0 ? 1 : 0;
  return m;
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrateMeta(JSON.parse(raw)) : defaultMeta();
  } catch { return defaultMeta(); }
}

/** Record a (non-cheated) win at `tier`. Returns the newly unlocked tier, or null. */
export function recordWin(m: MetaSave, tier: number): number | null {
  m.wins++;
  m.tierWins[tier]++;
  if (tier === m.tierUnlocked && tier < MAX_TIER) return ++m.tierUnlocked;
  return null;
}
```
Keep `const KEY = 'neon-chomp-save-v1';` as it is (the old key, so existing saves are found).

In `src/main.ts`, delete the `loadMetaDefault` function (lines 781–783). Change its caller (around line 718) to `this.meta = { ...defaultMeta(), settings: keep };` and add `defaultMeta` to the `./game/meta` import on line 10.

- [ ] **Step 4: Run the tests.** Run `npx vitest run` and `npx tsc -p .`. Expected: all pass, with no type errors.

- [ ] **Step 5: Commit.**
```bash
git add src/game/meta.ts src/main.ts tests/game.test.ts
git commit -m "Save v2: reincarnation tiers, migration from v1"
```

---

### Task 3: Run carries a tier, dynamic stage count, TIER cheat

**Files:**
- Modify: `src/game/run.ts` (remove `TOTAL_STAGES`, add `tier`)
- Modify: `src/game/cheats.ts` (STAGE range, TIER command, help text)
- Test: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests.** Append to `tests/game.test.ts`:

```ts
describe('run tier', () => {
  const p = [{ slot: 0, color: '#ffe600' }];
  it('defaults to R0 and stores the tier', () => {
    expect(new Run(1, p, defaultMeta()).tier).toBe(0);
    expect(new Run(1, p, defaultMeta(), 3).tier).toBe(3);
  });
  it('has 15 stages at every tier (Act IV is not in yet) and the same plan for the same seed', () => {
    const base = new Run(42, p, defaultMeta(), 0).plan;
    for (let t = 0; t <= 5; t++) {
      const plan = new Run(42, p, defaultMeta(), t).plan;
      expect(plan.length).toBe(15);
      expect(plan).toEqual(base);
    }
  });
});
```

Also, inside `describe('cheat console')`, add `restartAtTier: t => calls.push(`tier ${t}`),` to the `ctx` object in `setup()`, and append:

```ts
  it('restarts the run on a tier, 0-5 only', () => {
    const { run, ctx, calls } = setup();
    expect(runCheat('TIER 9', ctx)).toMatch(/^\?/);
    expect(run.cheated).toBe(false);
    expect(runCheat('tier 2', ctx)).toMatch(/^OK/);
    expect(calls).toContain('tier 2');
  });
```

- [ ] **Step 2: Run them and check that they fail.** `npx vitest run tests/game.test.ts`. Expected: FAIL. `run.tier` is undefined, and the TIER command returns the unknown-command error instead of `OK`.

- [ ] **Step 3: Implement it.**

`src/game/run.ts`:
- Delete `export const TOTAL_STAGES = 15;`.
- Add a field `tier: number;` next to `seed`.
- Change the constructor signature to `constructor(seed: number, players: PlayerInfo[], meta: MetaSave, tier = 0)` and set `this.tier = tier;` as its first line.
- In `advance()`, replace `TOTAL_STAGES` with `this.plan.length`.

`src/game/cheats.ts`:
- Remove `import { TOTAL_STAGES } from './run';` and add `import { MAX_TIER } from '../data/tiers';`.
- Add `restartAtTier(tier: number): void;` to `CheatCtx`.
- In `STAGE`, replace the range check with:
```ts
      if (num < 1 || num > run.plan.length) return `? STAGE MUST BE 1-${run.plan.length}`;
```
- Add a new case before `CLEAR`:
```ts
    case 'TIER': {
      if (!run) return noRun;
      const bad = needNum(); if (bad) return bad;
      if (num < 0 || num > MAX_TIER) return `? TIER MUST BE 0-${MAX_TIER}`;
      ctx.restartAtTier(Math.floor(num));
      return ok(`RESTART ON R${Math.floor(num)}`);
    }
```
- Change `CHEAT_HELP` to `'GOD  LIVES n  COINS n  STAGE n  TIER 0-5  CLEAR  BOSSHP n  FRUIT id  UPGRADE id|ALL  MOD id  POWER  SLOWMO'`.

`src/main.ts` `execCheat` (around line 463): add the hook:
```ts
      restartAtTier: t => { this.startRun(this.players, undefined, 0, t); this.run!.cheated = true; },
```
and change `startRun`'s signature to `startRun(players: Player[], seed?: number, stage = 0, tier = 0)`, passing `tier` as the 4th argument to `new Run(...)`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run` and `npx tsc -p .`. Expected: all pass.

- [ ] **Step 5: Commit.**
```bash
git add src/game/run.ts src/game/cheats.ts src/main.ts tests/game.test.ts
git commit -m "Runs carry a reincarnation tier; TIER cheat; stage count from the plan"
```

---

### Task 4: The `sting` cutscene

**Files:**
- Create: `src/render/cutscenesGP.ts`
- Modify: `src/render/cutscenes.ts:7-10` (the `CutsceneId` union, `CUTSCENE_LEN`) and the `drawCutscene` switch

No unit test, because this is canvas drawing. Check it with tsc now, and by eye in Task 6.

- [ ] **Step 1: Create `src/render/cutscenesGP.ts`.** The shot: Pac rests on a floor line and the text "PEACE AT LAST..." fades in. At 1.8s the screen glitches (horizontal slice offsets plus a red/cyan split). A shadow Pac (dark body, violet rim, red eye) slides out from behind Pac and grins. Then "...OR IS IT?" and "REINCARNATION UNLOCKED" appear.

```ts
import { RIGHT, LEFT } from '../sim/types';
import { drawPac, text, type Ctx } from './draw';
import { VH, VW } from './renderer';

/** Game++ cutscenes. Each is a pure function of time, like cutscenes.ts. */

/** After the first win: the Glitch has copied Pac. ~5.2s. */
export function sting(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  const glitch = t > 1.8 && t < 2.6;
  c.save();
  c.strokeStyle = '#2d7bff'; c.globalAlpha = 0.5; c.lineWidth = 2; c.shadowColor = '#2d7bff'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(0, y + 30); c.lineTo(VW, y + 30); c.stroke();
  c.restore();

  if (t < 1.8) {
    c.save(); c.globalAlpha = Math.min(1, t / 0.6);
    text(c, 'PEACE AT LAST...', VW / 2, 240, 16, '#ffe600', 'center', 12);
    c.restore();
  }
  // the shadow slides out from behind Pac and faces him
  const sx = t < 2.6 ? VW / 2 : Math.min(VW / 2 + 90, VW / 2 + (t - 2.6) * 160);
  if (t > 2.6) shadowPac(c, sx, y, t);
  drawPac(c, VW / 2 - (t > 2.6 ? 40 : 0), y, 18, t > 3 ? RIGHT : LEFT, t > 3 ? 0.35 : 0.04 + 0.26 * Math.abs(Math.sin(t * 3)), '#ffe600');

  if (glitch) glitchBars(c, t);
  if (t > 3.2) text(c, '...OR IS IT?', VW / 2, 240, 18, Math.floor(t * 3) % 2 ? '#ff2d55' : '#b45cff', 'center', 16);
  if (t > 4) text(c, 'REINCARNATION UNLOCKED', VW / 2, 300, 11, '#5ce1ff', 'center', 10);
}

function shadowPac(c: Ctx, x: number, y: number, t: number) {
  c.save();
  drawPac(c, x, y, 18, LEFT, 0.12 + 0.05 * Math.sin(t * 20), '#1a0830', 18);
  c.strokeStyle = '#b45cff'; c.lineWidth = 2; c.shadowColor = '#b45cff'; c.shadowBlur = 12;
  c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ff2d55'; c.shadowColor = '#ff2d55'; c.shadowBlur = 10;
  c.beginPath(); c.arc(x - 2, y - 8, 3, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Slice the current frame into offset bars with a red/cyan split. */
function glitchBars(c: Ctx, t: number) {
  const seed = Math.floor(t * 30);
  const canvas = c.canvas;
  for (let i = 0; i < 7; i++) {
    const h = 8 + ((seed * 13 + i * 29) % 40);
    const yy = (seed * 71 + i * 113) % VH;
    const dx = (((seed + i) * 37) % 60) - 30;
    const sy = canvas.height / VH;
    c.drawImage(canvas, 0, yy * sy, canvas.width, h * sy, dx, yy, VW, h);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25;
    c.fillStyle = i % 2 ? '#ff2d55' : '#2de2ff'; c.fillRect(0, yy, VW, h);
    c.restore();
  }
}
```

Note: `drawImage` from the context's own canvas copies the already-drawn pixels. The canvas may be scaled for DPR, which is why the source rectangle is scaled by `canvas.height / VH`. If the renderer draws to an offscreen buffer instead, the effect still shows the colour bars, which is acceptable.

- [ ] **Step 2: Register it in `src/render/cutscenes.ts`.**
- Add `'sting'` to the `CutsceneId` union.
- Add `sting: 5.2` to `CUTSCENE_LEN`.
- Add `import { sting } from './cutscenesGP';`.
- Add `case 'sting': sting(c, t); break;` in the `drawCutscene` switch.

- [ ] **Step 3: Type-check.** Run `npx tsc -p .`. Expected: no errors. Then `npm test`, which should pass.

- [ ] **Step 4: Commit.**
```bash
git add src/render/cutscenesGP.ts src/render/cutscenes.ts
git commit -m "Sting cutscene: the Glitch copies Pac"
```

---

### Task 5: Wire tiers into the game flow and UI

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Game state.**
- Add the field `tier = 0;` to `Game`. It holds the tier the next run starts on.
- In the constructor after `applySettings()`, add `this.tier = this.meta.tierUnlocked;`.
- Add the import `import { TIERS, tierLabel, tierSouls } from './data/tiers';`.
- Add `recordWin` to the `./game/meta` import.
- Change `resultInfo`'s type to add `unlocked: number | null`.

- [ ] **Step 2: Debug URL.** Change the `auto=run` line to:
```ts
    if (q.get('auto') === 'run') this.startSolo(Number(q.get('seed')) || undefined, Number(q.get('stage')) || 0, Math.min(5, Math.max(0, Number(q.get('tier')) || 0)));
```
- Change `startSolo` to `startSolo(seed?: number, stage = 0, tier = this.tier)` and pass `tier` through: `this.startRun(this.players, seed, stage, tier);`.
- In `launchLobby`, change the co-op call to `this.startRun(this.players, undefined, 0, this.tier);`.

- [ ] **Step 3: Title screen picker.** In `title()`:
- Right after `this.menuNav(items.length);`, add:
```ts
    const tierRow = this.meta.tierUnlocked > 0 && this.cursor <= 1;
    if (tierRow) {
      const d = this.input.menuDirEdge;
      const n = this.meta.tierUnlocked + 1;
      if (d === LEFT) { this.tier = (this.tier + n - 1) % n; this.audio.ui('move'); }
      if (d === RIGHT) { this.tier = (this.tier + 1) % n; this.audio.ui('move'); }
      text(c, `◀  ${tierLabel(this.tier)}  ▶`, VW / 2, 345, 11, TIERS[this.tier].color, 'center', 10);
    }
```
Check that `LEFT` is imported in `main.ts` (it is used by `menuNav`). If it isn't, add it to the `./sim/types` import.
- Change the stats line to append the highest tier:
```ts
    const tierTxt = this.meta.tierUnlocked ? `   ·   R${this.meta.tierUnlocked}` : '';
    text(c, `BEST ${this.meta.best}   ·   SOULS ${this.meta.souls}   ·   RUNS ${this.meta.runs}   ·   WINS ${this.meta.wins}${tierTxt}`, VW / 2, VH - 64, 8, '#b45cff', 'center', 6);
```

- [ ] **Step 4: Co-op lobby label.** In `lobby()`, after the blurb `wrapText`, add:
```ts
    if (this.lobbyMode === 'coop' && this.meta.tierUnlocked > 0) text(c, tierLabel(this.tier), VW / 2, 198, 9, TIERS[this.tier].color, 'center', 8);
```

- [ ] **Step 5: HUD label.** In `hudInfo()`, change `stageLabel` to:
```ts
        stageLabel: `${this.run.tier ? `R${this.run.tier} · ` : ''}ACT ${['I', 'II', 'III'][p.act]}`,
```

- [ ] **Step 6: Ending, sting and unlock.** In `finishWorld()`, replace the `advance()` line with:
```ts
        if (!run.advance()) {
          const ids: CutsceneId[] = ['ending'];
          if (!run.cheated && !this.meta.seenCutscenes.includes('sting')) ids.push('sting');
          this.playCutscenes(ids, () => this.endRun(true));
          return;
        }
```
In `endRun`, replace the souls and save block with:
```ts
    const souls = run.cheated ? 0 : tierSouls(soulsForRun(run.score, run.stagesCleared, run.bossesBeaten, won), run.tier);
    const newBest = !run.cheated && run.score > this.meta.best;
    let unlocked: number | null = null;
    if (!run.cheated) {
      this.meta.souls += souls;
      this.meta.best = Math.max(this.meta.best, run.score);
      this.meta.bossesBeaten += run.bossesBeaten;
      if (won) {
        unlocked = recordWin(this.meta, run.tier);
        if (!this.meta.seenCutscenes.includes('sting')) this.meta.seenCutscenes.push('sting');
        if (unlocked !== null) this.tier = unlocked;
      }
      saveMeta(this.meta);
    }
    this.resultInfo = { won, souls, newBest, cheated: run.cheated, unlocked };
```
(`recordWin` does `wins++`, so the old `if (won) this.meta.wins++;` line goes away.)

- [ ] **Step 7: Results screen.** In `results()`, after the `if (info.won) text(... 'NEON CITY IS SAFE...')` line, add:
```ts
    if (info.unlocked !== null) text(c, `${tierLabel(info.unlocked)} UNLOCKED`, VW / 2, 180, 10, Math.floor(this.r.time * 3) % 2 ? TIERS[info.unlocked].color : '#fff', 'center', 12);
```

- [ ] **Step 8: Type-check and test.** Run `npx tsc -p .` and `npm test`. Expected: both pass.

- [ ] **Step 9: Commit.**
```bash
git add src/main.ts
git commit -m "Tier picker, tier HUD label, unlock on win, sting after the first win"
```

---

### Task 6: Check it in the browser

- [ ] **Step 1:** Run `npm run dev` in the background and open http://localhost:5173.
- [ ] **Step 2:** On a fresh save (clear `localStorage`), the title screen shows no tier row. Starting a Solo run works as before.
- [ ] **Step 3:** In the console: `localStorage.setItem('neon-chomp-save-v1', JSON.stringify({v:1,souls:5,best:1,runs:3,wins:1,bossesBeaten:3,unlockedFruits:[],perks:{},skin:'#ffe600',settings:{bloom:2,crt:false,music:0.6,sfx:0.8,shake:true}}))`, then reload. The title stats show `R1`. On SOLO RUN the row `◀ R1 · AFTERGLOW ▶` appears, and left/right cycles R0 and R1.
- [ ] **Step 4:** Start an R1 solo run. The HUD shows `R1 · ACT I`.
- [ ] **Step 5:** Open the console (backtick), type `STAGE 15` then `CLEAR`. Only `ending` plays (no sting on cheated runs), and results show "CHEATED · NOT SAVED".
- [ ] **Step 6:** Check the sting by eye: open `?auto=run&stage=14`, beat Maze Eater for real (or temporarily call `playCutscenes(['sting'], ...)` from `__game` in the console: `__game.playCutscenes(['sting'], () => __game.go('title'))`). Glitch bars, shadow Pac and text appear, and any key skips.
- [ ] **Step 7:** `TIER 3` in the console restarts on R3 (the HUD shows `R3 · ACT I`, marked cheated).
- [ ] **Step 8:** Fix anything that looks wrong and commit the fixes with a clear message.

---

### Task 7: Docs and build

**Files:**
- Modify: `README.md` (Save data, Debug URLs, cheat table)
- Modify: `DECISIONS.md`, `ROADMAP.md`, `CONTEXT.md`

- [ ] **Step 1: README.**
- *Save data*: the save is now `v: 2` (still under the key `neon-chomp-save-v1`). It adds `tierUnlocked`, `tierWins`, `heatBest` and `seenCutscenes`. `migrateMeta()` upgrades v1 saves.
- *Debug URLs*: add `&tier=n`.
- *Cheat table*: add `| \`TIER n\` | Restart the run on reincarnation tier 0-5 |`, and change `STAGE n` to "Jump to stage 1-N (N = stages in this run)".
- [ ] **Step 2: DECISIONS.md.** Add a line: "**Game++ reincarnations:** after the first win, tiers R1–R5 add twists, cutscenes and Act IV, ending at Evil Pac (see docs/superpowers/specs/2026-09-27-game-plus-reincarnations-design.md). The tier picker lives on the title screen because Solo has no lobby. Souls are ×1.2 per tier."
- [ ] **Step 3: ROADMAP.md.** Replace the Phantom and Evil Pac lines with "Game++ reincarnations: see docs/superpowers/specs/2026-09-27-game-plus-reincarnations-design.md (step 1 done)".
- [ ] **Step 4: Build.** Run `npm run build:single`. Expected: `dist/neon-chomp.html` is written with no errors.
- [ ] **Step 5: Commit.**
```bash
git add README.md DECISIONS.md ROADMAP.md
git commit -m "Docs for the tier framework"
```
