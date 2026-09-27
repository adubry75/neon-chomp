import { describe, expect, it } from 'vitest';
import { Run, actPips } from '../src/game/run';
import { defaultMeta, migrateMeta, newTierWaiting, recordWin } from '../src/game/meta';
import { runCheat, type CheatCtx } from '../src/game/cheats';
import { MAX_TIER, TIERS, gagFor, tierLabel, tierSouls, twistsFor } from '../src/data/tiers';

describe('actPips', () => {
  const plan = new Run(1, [{ slot: 0, color: '#fff' }], defaultMeta()).plan;
  it('marks cleared, current, upcoming and boss', () => {
    expect(actPips(plan, 2)).toEqual(['done', 'done', 'current', 'todo', 'boss']);
    expect(actPips(plan, 4)).toEqual(['done', 'done', 'done', 'done', 'bossCurrent']);
    expect(actPips(plan, 5)).toEqual(['current', 'todo', 'todo', 'todo', 'boss']);
  });
  it('handles a one-stage act', () => {
    expect(actPips([{ act: 0, boss: null }, { act: 1, boss: 'evil' }], 1)).toEqual(['bossCurrent']);
  });
});


describe('cheat console', () => {
  const setup = () => {
    const run = new Run(123, [{ slot: 0, color: '#ffe600' }], defaultMeta());
    const world = run.makeWorld();
    const calls: string[] = [];
    let slow = false;
    const ctx: CheatCtx = {
      run, world,
      jumpToStage: i => calls.push(`jump ${i}`),
      rebuildStage: () => calls.push('rebuild'),
      toggleSlowmo: () => (slow = !slow),
      restartAtTier: t => calls.push(`tier ${t}`),
    };
    return { run, world, ctx, calls };
  };

  it('sets lives and coins and marks the run as cheated', () => {
    const { run, world, ctx } = setup();
    expect(run.cheated).toBe(false);
    expect(runCheat('lives 9', ctx)).toMatch(/^OK/);
    expect(world.lives).toBe(9);
    expect(runCheat('COINS 500', ctx)).toMatch(/^OK/);
    expect(run.coins).toBe(500);
    expect(run.cheated).toBe(true);
  });
  it('grants upgrades one at a time or all at once', () => {
    const { run, ctx } = setup();
    runCheat('upgrade fleet_feet', ctx);
    expect(run.upgrades.fleet_feet).toBe(1);
    runCheat('UPGRADE ALL', ctx);
    expect(run.upgrades.chain_chomp).toBe(1);
    expect(run.upgrades.fleet_feet).toBe(2);
  });
  it('toggles god mode', () => {
    const { world, ctx } = setup();
    runCheat('god', ctx);
    expect(world.god).toBe(true);
    runCheat('god', ctx);
    expect(world.god).toBe(false);
  });
  it('jumps to 1-based stages and rejects out-of-range ones', () => {
    const { ctx, calls } = setup();
    expect(runCheat('stage 10', ctx)).toMatch(/^OK/);
    expect(calls).toEqual(['jump 9']);
    expect(runCheat('stage 99', ctx)).toMatch(/^\?/);
    expect(calls).toEqual(['jump 9']);
  });
  it('rejects unknown commands and bad ids without marking the run', () => {
    const { run, ctx } = setup();
    expect(runCheat('bogus', ctx)).toMatch(/^\?/);
    expect(runCheat('fruit durian', ctx)).toMatch(/^\?/);
    expect(runCheat('mod lava', ctx)).toMatch(/^\?/);
    expect(runCheat('lives abc', ctx)).toMatch(/^\?/);
    expect(run.cheated).toBe(false);
  });
  it('adds a modifier to the current stage and rebuilds it', () => {
    const { run, ctx, calls } = setup();
    runCheat('mod ice', ctx);
    expect(run.current.modifiers).toContain('ice');
    expect(calls).toEqual(['rebuild']);
  });
  it('clears the current stage', () => {
    const { world, ctx } = setup();
    runCheat('clear', ctx);
    expect(world.maze.pelletsLeft).toBe(0);
  });
  it('restarts the run on a tier, 0-5 only', () => {
    const { run, ctx, calls } = setup();
    expect(runCheat('TIER 9', ctx)).toMatch(/^\?/);
    expect(run.cheated).toBe(false);
    expect(runCheat('tier 2', ctx)).toMatch(/^OK/);
    expect(calls).toContain('tier 2');
  });
  it('needs a run for run commands', () => {
    const ctx: CheatCtx = { run: null, world: null, jumpToStage: () => {}, rebuildStage: () => {}, toggleSlowmo: () => false, restartAtTier: () => {} };
    expect(runCheat('lives 3', ctx)).toMatch(/^\?/);
    expect(runCheat('help', ctx)).toMatch(/GOD/);
  });
});

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

describe('save v2', () => {
  const v1 = (wins: number) => ({
    v: 1, souls: 50, best: 9000, runs: 8, wins, bossesBeaten: 4,
    unlockedFruits: ['banana'], perks: { start_lives: 1 }, skin: '#5cffc8',
    settings: { bloom: 1, crt: true, music: 0.3, sfx: 0.5, shake: false },
  });
  it('migrates a v1 save with a win to R1 unlocked, keeping everything else', () => {
    const m = migrateMeta(v1(1) as never);
    expect(m.v).toBe(2);
    expect(m.tierUnlocked).toBe(1);
    expect(m.tierWins).toEqual([0, 0, 0, 0, 0, 0]);
    expect(m.heatBest).toBe(0);
    expect(m.seenCutscenes).toEqual([]); // they still get the sting on their next win
    expect(newTierWaiting(m)).toBe(true); // and the title shows the NEW banner until they try R1
    expect(m.souls).toBe(50);
    expect(m.perks).toEqual({ start_lives: 1 });
    expect(m.settings.crt).toBe(true);
  });
  it('migrates a v1 save without wins to R0', () => {
    expect(migrateMeta(v1(0) as never).tierUnlocked).toBe(0);
    expect(newTierWaiting(migrateMeta(v1(0) as never))).toBe(false);
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

describe('game++ gating', () => {
  const p = [{ slot: 0, color: '#ffe600' }];
  it('twists stack by tier', () => {
    expect(twistsFor(0).phantom).toBe(false);
    expect(twistsFor(1).phantom).toBe(true);
    expect(twistsFor(3)).toMatchObject({ phantom: true, megaRemix: true, actIV: true, trainRemix: false });
    expect(twistsFor(5).evilPac).toBe(true);
  });
  it('Lime only spawns from R1', () => {
    expect(new Run(1, p, defaultMeta(), 0).fruitPool).not.toContain('lime');
    expect(new Run(1, p, defaultMeta(), 1).fruitPool).toContain('lime');
  });
  it('tier upgrades are never offered below their tier', () => {
    for (let s = 0; s < 40; s++) {
      const run = new Run(s, p, defaultMeta(), 0);
      run.mods.fruitStandChoices = 8;
      run.rollOffers();
      expect(run.offers.every(u => (u.tier ?? 0) === 0)).toBe(true);
    }
  });
  it('newest gag at or below the tier plays', () => {
    expect(gagFor(1, 0)).toBe('gag1');
    expect(gagFor(1, 1)).toBe('gagR1');
    expect(gagFor(1, 3)).toBe('gagR1');
    expect(gagFor(1, 4)).toBe('gagR4');
    expect(gagFor(3, 2)).toBe(null);
  });
});

describe('run tier', () => {
  const p = [{ slot: 0, color: '#ffe600' }];
  it('defaults to R0 and stores the tier', () => {
    expect(new Run(1, p, defaultMeta()).tier).toBe(0);
    expect(new Run(1, p, defaultMeta(), 3).tier).toBe(3);
  });
  it('keeps the first 15 stages (mazes, modifiers) the same at every tier', () => {
    const strip = (s: { mazeSeed: unknown; modifiers: unknown; level: number; act: number }) => [s.mazeSeed, s.modifiers, s.level, s.act];
    const base = new Run(42, p, defaultMeta(), 0).plan.slice(0, 15).map(strip);
    for (let t = 0; t <= 5; t++) expect(new Run(42, p, defaultMeta(), t).plan.slice(0, 15).map(strip)).toEqual(base);
  });
  it('adds Act IV (4 de-rez mazes + the Null) from R3', () => {
    expect(new Run(42, p, defaultMeta(), 2).plan.length).toBe(15);
    const plan = new Run(42, p, defaultMeta(), 3).plan;
    expect(plan.length).toBe(20);
    expect(plan.slice(15, 19).every(s => s.act === 3 && s.modifiers[0] === 'derez' && s.modifiers.length === 2)).toBe(true);
    expect(plan[19].boss).toBe('null');
  });
  it('adds the Evil Pac finale as stage 21 at R5', () => {
    expect(new Run(42, p, defaultMeta(), 4).plan.length).toBe(20);
    const plan = new Run(42, p, defaultMeta(), 5).plan;
    expect(plan.length).toBe(21);
    expect(plan[20]).toMatchObject({ act: 4, boss: 'evil' });
    expect(actPips(plan, 20)).toEqual(['bossCurrent']);
    expect(gagFor(4, 5)).toBe('faceoff');
    expect(new Run(42, p, defaultMeta(), 5).plan.slice(0, 20).map(s => s.boss)).toEqual(new Run(42, p, defaultMeta(), 4).plan.map(s => s.boss));
  });
  it('swaps in Mega Blinky EX from R2', () => {
    expect(new Run(42, p, defaultMeta(), 1).plan[4].boss).toBe('mega');
    expect(new Run(42, p, defaultMeta(), 2).plan[4].boss).toBe('mega2');
  });
});

describe('heat and Game++ perks', () => {
  const p = [{ slot: 0, color: '#ffe600' }];
  it('applies heat rules to the run mods and counts points', () => {
    const run = new Run(1, p, defaultMeta(), 2, ['stingy_stand', 'overclock', 'bogus']);
    expect(run.heat).toEqual(['stingy_stand', 'overclock']);
    expect(run.heatPoints).toBe(4);
    expect(run.mods.fruitStandChoices).toBe(2);
    expect(run.mods.pacSpeed).toBeCloseTo(1.1);
  });
  it('No Refunds blocks buying lives', () => {
    const run = new Run(1, p, defaultMeta(), 5, ['no_refunds']);
    run.coins = 999;
    expect(run.buyLife()).toBe(false);
  });
  it('Free Reroll perk makes the first reroll at each stand free', () => {
    const meta = { ...defaultMeta(), perks: { gp_reroll: 1 } };
    const run = new Run(1, p, meta, 2);
    run.coins = 0;
    run.openStand();
    expect(run.rerollCost).toBe(0);
    expect(run.reroll()).toBe(true);
    expect(run.reroll()).toBe(false); // the second one costs coins
    run.openStand();
    expect(run.rerollCost).toBe(0);
  });
  it('Head Start grants one common upgrade', () => {
    const run = new Run(3, p, { ...defaultMeta(), perks: { gp_headstart: 1 } }, 2);
    expect(Object.values(run.upgrades).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
