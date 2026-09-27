# Game++ (Reincarnations): Design

Date: 2026-09-27. Source: brainstorm with the user about growing Neon Chomp into a 3–5 hour game that could sell on Steam for about $5.

## Goals
- Keep the first clear as it is. The user took about 7 runs, with perks bought along the way, to beat the 15 stages. That is roughly 1.5–2 hours, and it feels good.
- Add 2–3 hours after the first win through 5 **reincarnation tiers** (R1–R5). Each tier adds a story beat, new content and a harder twist. R5 ends with Evil Pac and a true ending.
- Give optional **Heat** rules to players who want more after (or alongside) the tiers.
- New intermission cutscenes are the main reward for progress.

Expected length: first clear about 1.5–2h, plus 5 tiers × 1–3 attempts × 20–25 min. That comes to about 3.5–6h in total.

## Pacing rules (the effort-to-reward ratio stays as it is)
1. **You get something new before it gets harder.** Every tier opens with new toys (fruit, upgrades, a cutscene) before the new threat.
2. **Failing doesn't cost you progress.** You choose the tier when a run starts. Losing an Rn run means trying Rn again.
3. **A tier should take 1–3 attempts, not 7.** The first clear is the wall. The Game++ is the fun part.
4. **Heat is never required.** The story and the true ending only need R1–R5. Heat rewards are cosmetics, a soul bonus and badges.
5. **Souls scale with tier** (×1.2^tier). Game++ shop prices scale to match, so the number of runs per unlock stays about the same as now.

## The loop
- The first win at R0 plays the current `ending` and then a new `sting` cutscene (the screen glitches and a shadow Pac grins). It unlocks R1.
- The run lobby gets a tier picker (`R0 … R<highest unlocked>`, default = highest). It appears only once R1 is unlocked.
- Clearing Rn when n is the highest unlocked tier (and n < 5) unlocks Rn+1. Tiers are cumulative: R3 includes the R1 and R2 twists.
- Beating R5 plays the true ending and the credits and opens every heat rule. Heat rules start unlocking one at a time from R2.
- Cheated runs never unlock tiers (the same rule the save already follows).
- Tiers apply to Solo and Co-op runs. Chomp Royale and Ghost Squad are unaffected.

## Story thread
Every time Pac wins, the Glitch copies a bit more of him. At R5 the copy is complete: that is Evil Pac, and he fights with your own inputs. It is told only through wordless arcade-style gags.

## Tier content
| Tier | Reward first | Then harder | New cutscenes |
|---|---|---|---|
| R1 · Afterglow | Lime fruit (PHASE: walk through one wall). 3 new upgrades. | **Phantom** elite: every few seconds it phases through a wall section, with a flicker warning first. A new palette for each act. | `sting` (after the R0 ending), R1 Act I→II gag (the shadow watching) |
| R2 · Echo | Game++ perks in the souls shop. 3 new upgrades. First heat rules. | **Mega Blinky remix**: splits into two halves at half HP, and each half needs its own hits. | Act II→III gag (the shadow copies Pac's moves, badly) |
| R3 · Null Sector | **Act IV** unlocks. Runs become 20 stages. | Act IV maze rule **de-rez** (wall sections dissolve and reform). A new boss that rewrites the maze between phases. | Act IV title card, Act III→IV gag (falling into the void) |
| R4 · Déjà Vu | 3 new upgrades. A new fruit. | **Train King remix** (phantom cars). **Ghost memory**: ghosts learn your most-used junctions and set ambushes there, shown with red markers. | Act IV gag (the shadow is almost solid) |
| R5 · Mirror | The full heat menu | **Evil Pac**, the final boss, as an extra 21st stage after the Null boss. He replays P1's inputs on a delay and races for pellets. Power pellets decide who is hunting. Three phases, with less delay each phase. | Pre-boss face-off, true ending, credits |

Act IV is named "Null Sector" (Act III is already "The Glitch").

Totals: 2 new fruits, about 10 upgrades, 1 new elite, 5 new stages, 2 boss remixes, 2 new bosses, about 9 cutscenes and about 6 heat rules.

**Heat rules:** Each point adds +10% souls, and there are cosmetics at 5, 10 and 15 heat.
- *Phantom Plague*: all elites phase.
- *Lean Maze*: 2 power pellets instead of 4.
- *Stingy Stand*: one fewer upgrade choice.
- *Iron Ghosts*: ghosts have shields.
- *Overclock*: everything is 10% faster.
- *No Refunds*: you can't buy lives.

Each rule's exact numbers are set in its build step.

**Known risk:** if ghost memory (R4) doesn't read clearly in playtesting, it gets swapped for a simpler twist.

## Architecture
- `src/data/tiers.ts`: a `TIERS` table (id, name, soul multiplier, cutscene IDs, `twists`). `twistsFor(tier)` merges twists cumulatively. The twist flags are `phantom`, `megaRemix`, `actIV`, `trainRemix`, `ghostMemory` and `evilPac`. Each build step turns its flag on.
- `src/data/heat.ts`: heat rules applied to `Mods` in the same way as upgrades.
- `Run` takes `tier` (and later `heat`). `buildPlan()` adds Act IV and the remixed bosses based on the twists. `TOTAL_STAGES` becomes `plan.length`.
- `World` receives the twists through its config as plain data, so the sim stays pure and deterministic. The new `BossId`s are `mega2`, `train2`, `null` and `evil`. Evil Pac reads a per-tick buffer of P1's recorded inputs.
- New boss logic lives in `src/sim/bosses/*.ts`, because `world.ts` is already about 1,260 lines. Mega Blinky and the Train King move there only when their remix step touches them.
- New cutscenes go in `src/render/cutscenesGP.ts`.
- `main.ts` gets the tier picker in the lobby, a tier badge in the HUD, and later a Heat menu.

## Build order
Each step gets its own mini-spec and plan, keeps the game playable, passes `npx tsc -p .` and `npm test`, and is committed separately.

1. **Tier framework** (specified in full below).
2. **Evil Pac prototype**, time-boxed, behind `?auto=evil`. It tests the delayed-mirror fight for fun *before* the tiers that build up to it. If it isn't fun, the R5 boss is redesigned now, not at the end.
3. **R1**: Phantom, Lime, upgrades, palettes, gag.
4. **R2**: Mega remix, Game++ perks, the heat framework and the first rules.
5. **R3**: Act IV, de-rez, Null boss, cutscenes.
6. **R4**: Train remix, ghost memory.
7. **R5**: Evil Pac (finished from the prototype), true ending, credits, remaining heat rules.
8. Later, as a separate project: rebrand away from Pac-Man trademarks, and Steam packaging.

## Step 1: tier framework (full spec)
**Data**
- `src/data/tiers.ts` has entries R0–R5 with `name` (R0 "Arcade", then Afterglow, Echo, Null Sector, Déjà Vu, Mirror) and `soulMult = 1.2 ** tier`. All twist flags are off in this step.

**Save v2**
- `MetaSave.v` becomes `2`. New fields:
  - `tierUnlocked: number` (0–5)
  - `tierWins: number[]` (6 entries)
  - `heatBest: number`
  - `seenCutscenes: string[]`
- The localStorage key stays `neon-chomp-save-v1`, so the old save is found.
- The `loadMeta()` migration fills in defaults. A v1 save with `wins > 0` gets `tierUnlocked = 1`. `seenCutscenes` starts empty, so a player who already won still sees the sting on their next win.

**Run**
- `new Run(seed, players, meta, tier = 0)` stores `tier`.
- `TOTAL_STAGES` usages switch to `run.plan.length`, so Act IV can extend the plan later.
- Souls for a run are `soulsForRun(...) * soulMult`, rounded down.

**Unlock**
- When a non-cheated run is won, `tierWins[tier]++`.
- If `tier === tierUnlocked && tier < 5`, then `tierUnlocked++` and the results screen shows "REINCARNATION n UNLOCKED".

**Sting**
- A new `sting` cutscene (about 5s, skippable) plays after `ending` on any win while `'sting'` is not in `seenCutscenes`. It is then added there. Tier wins R1–R4 play the existing `ending` until their own content steps add more.

**UI**
- The run lobby shows a `◀ R2 · ECHO ▶` tier picker (left/right) when `tierUnlocked > 0`, defaulting to the highest unlocked tier.
- The HUD shows a small `R<n>` badge when tier > 0.
- The title screen shows the highest tier reached.

**Debug**
- `?auto=run&tier=n` starts a run at tier n (debug only, save untouched).
- The console code `TIER n` restarts the run at stage 1 on tier n and marks it cheated.

**Tests**
- Save migration from v1 to v2 (with and without wins).
- Tier unlock rules (only on the highest tier, never on cheated runs, capped at 5).
- Soul multiplier.
- The plan still has 15 stages at every tier while `actIV` is off.
- Determinism holds at tier > 0.

**Docs**
- The README's "Save data" section gets v2.
- DECISIONS.md gets the Game++ structure.
- ROADMAP.md points to this spec.
