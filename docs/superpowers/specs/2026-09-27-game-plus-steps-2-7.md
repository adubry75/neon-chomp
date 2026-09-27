# Game++ Steps 2–7: Mini-Specs

Date: 2026-09-27. Parent spec: `2026-09-27-game-plus-reincarnations-design.md`. Every step keeps `src/sim/` pure and deterministic, passes `npx tsc -p .` and `npm test`, and is committed separately on `game-plus-tiers`.

## Step 2: Evil Pac prototype (`?auto=evil`)
**Change from the parent spec:** Evil Pac replays P1's recorded *path* (positions per tick), not raw inputs. Same inputs from a different start would just wander around. Following your path means you really are dodging your past self, and it replays exactly.

**Arena and rules**
- New `BossId` `'evil'`, logic in `src/sim/bosses/evil.ts`. The arena is a generated maze with pellets and 4 power pellets that respawn after 11s, like other boss stages.
- **Follow:** Evil Pac sits where P1 was `delay` seconds ago. Touching him hurts. The delay shrinks by 0.04s per second while you're unpowered, down to the phase minimum, so standing still or looping slowly lets him close in.
- **Hunt flips:** eating a power pellet makes him frightened. He leaves your trail and runs away on the grid (frightened-ghost movement, 90% of Pac's speed). Touching him lands a hit.
- **Glitch back:** after a hit, or when power runs out, he vanishes for 1.2s with a warning marker and reappears at the trail point `delay` behind you.
- **Three phases:** a hit moves to the next phase.

| Phase | Delay | Minimum | Ghosts |
|---|---|---|---|
| 1 | 3.0s | 1.6s | none |
| 2 | 2.4s | 1.2s | + Blinky |
| 3 | 1.8s | 0.9s | + Blinky + Pinky |

- The third hit is `bossDown`.
- If P1 dies, the trail is cleared and he waits at his spawn (top middle) until P1 has moved for `delay` seconds.
- `BOSS_INFO.evil`: EVIL PAC. "HE FOLLOWS YOUR PATH. DON'T DOUBLE BACK." "POWER UP, THEN CHOMP HIM. 3 HITS."

**Tests**
- He tracks the trail at the right delay.
- Power makes him fleeable.
- Three hits beat him.
- Same seed and inputs give the same result.

## Step 3: R1 · Afterglow
**Twists infra.** `tiers.ts` gets `twistsFor(tier)` (cumulative). `Run` passes `twists` into `StageConfig`, default all off.

**Phantom elite** (`twists.phantom`)
- `Elite` gains `'phantom'`, joining the elite pool at R1+, with elite chance +0.12.
- A phantom has a cycle: 5.5s solid, then 0.9s warning flicker, then 2.2s phasing.
- While phasing it moves as walker `'phase'`: walls are walkable, rows outside the maze and the house/door are not. If the phase ends inside a wall, it keeps phasing until it reaches an open tile.
- Frightened phantoms don't phase.
- Drawn translucent, with the flicker as the warning.

**Lime fruit** (`tier: 1`): PHASE, 12s, 2 charges. At a tile center, if the held direction hits a wall that's 1 tile thick with an open tile beyond it, Pac hops through (`phaseHop` event) and spends a charge. Fruit defs get `tier?`, and the run's fruit pool filters by tier.

**New upgrades** (defs get `tier?`, and the stand offers only tier ≤ run tier):
- *Glow Up* (common): +1.5s invulnerability when power ends.
- *Combo Keeper* (rare): each ghost eaten adds +0.75s power.
- *Fruit Punch* (rare): eating fruit gives a 3s power surge.

**Palettes.** `TIERS[t].palette` gives act colours for R1+.

**Gags.** `GAGS` table `{ transition, tier, id }`. The newest gag with `tier ≤ run tier` plays. R1 replaces the Act I→II gag with `gagR1` (the shadow watches from a rooftop).

## Step 4: R2 · Echo
**Mega remix** (`twists.megaRemix`): new boss id `'mega2'`. `World.mega` becomes `megas: MegaBoss[]`, and the logic moves to `src/sim/bosses/mega.ts`. At 2 hits left it splits into two halves (2 hits each, smaller, faster). Total 6 hits.

**New upgrades** (tier 2):
- *Echo Pellet* (rare): each maze's first eaten power pellet respawns once after 20s.
- *Overcharge* (epic): power pellets stun ghosts for 1s.
- *Soul Siphon* (common): +25% souls from this run.

**Game++ perks** (meta items need `tierUnlocked ≥ 2`):
- *Free Reroll*: the first reroll at each stand is free.
- *Head Start*: start each run with a random common upgrade.
- *Soul Magnet*: +15% souls.

**Heat framework** (`src/data/heat.ts`)
- Rules are picked on a new title-menu scene, HEAT, shown once any rule is unlocked.
- Each point gives +10% souls.
- `heatBest` is recorded on wins.
- Cosmetic skins at heat **4 / 8 / 11**. That's a change from 5/10/15, because the full rule set adds up to 11.

| Rule | Points | Unlocks at | Effect |
|---|---|---|---|
| Phantom Plague | 2 | R2 | all elites are phantoms, elite chance +0.25 |
| Lean Maze | 2 | R2 | non-boss mazes keep only 2 power pellets |
| Stingy Stand | 1 | R3 | −1 stand choice |
| Iron Ghosts | 2 | R4 | non-Blinky ghosts spawn shielded |
| Overclock | 3 | R5 | Pac ×1.1, ghosts ×1.12 |
| No Refunds | 1 | R5 | the stand doesn't sell lives |

**Gag.** `gagR2` (Act II→III): the shadow copies Pac's moves, badly.

## Step 5: R3 · Null Sector
**Act IV** (`twists.actIV`)
- The plan grows to 20 stages. `ACTS[3]` = "ACT IV · NULL SECTOR".
- Mazes are generated. Each Act IV maze gets `derez` plus one random modifier.
- `actPips` becomes plan-aware.

**De-rez modifier**
- It uses thin wall tiles: 1 thick, open on both opposite sides, outside the house area and the border rows. They're mirrored, 8–10 tiles.
- Every 5s half of them dissolve (become open) for 4s, then reform, with a 1s flicker first. A tile won't reform while an actor is in it.
- Opening walls never disconnects the maze, so no connectivity test is needed.

**Null boss** (`'null'`, `src/sim/bosses/null.ts`)
- 4 key shards (`I_CORE`) sit in the maze, with Blinky and Inky hunting you.
- Eating all 4 exposes THE NULL, a drifting glitch square, for 6s. Touching it lands a hit.
- After each hit the Null rewrites the maze: a new generated layout, Pac snapped to the nearest open tile, ghosts sent home, 4 new shards.
- 3 hits wins.

**Cutscenes:** the `title3` card and `gagR3` (Act III→IV: Pac falls into the void).

## Step 6: R4 · Deja Vu
**Train remix** (`'train2'`): the King is a phantom, so the train cuts through walls. 12 cars.

**Ghost memory** (`twists.ghostMemory`)
- Each maze counts how often P1 passes each junction (3+ exits).
- A junction becomes "learned" at 6 visits, up to 3 per maze, and gets a red marker.
- In chase mode, Pinky targets the learned junction nearest to Pac when Pac is within 8 tiles of it. Clyde does the same for the second nearest.

**Kiwi fruit** (tier 4): DECOY. Drops a decoy Pac for 5s that every ghost chases. A ghost reaching it pops it.

**New upgrades** (tier 4):
- *Rewind* (epic, max 1): once per maze, a fatal hit sends you back 3s along your path instead.
- *Forget Me* (common): ghosts need twice as many visits to learn a junction.
- *Haunted* (curse): phantom elite chance +0.35, coins ×2.

**Gag.** `gagR4` replaces the Act I→II gag at R4+: the shadow is almost solid.

## Step 7: R5 · Mirror
- With `twists.evilPac`, the plan gets stage 21: an act of its own ("FINALE · MIRROR", 1 pip) with boss `'evil'`.
- The `faceoff` cutscene plays before stage 21.
- Winning R5 plays `trueEnding` and then `credits` instead of `ending`.
- Evil Pac is tuned from the prototype. The remaining heat rules unlock through their tier gates.
