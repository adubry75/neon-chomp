import { describe, expect, it } from 'vitest';
import { Run, actPips } from '../src/game/run';
import { defaultMeta } from '../src/game/meta';
import { runCheat, type CheatCtx } from '../src/game/cheats';

describe('actPips', () => {
  it('marks cleared, current, upcoming and boss', () => {
    expect(actPips(2)).toEqual(['done', 'done', 'current', 'todo', 'boss']);
    expect(actPips(4)).toEqual(['done', 'done', 'done', 'done', 'bossCurrent']);
    expect(actPips(5)).toEqual(['current', 'todo', 'todo', 'todo', 'boss']);
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
    expect(runCheat('fruit kiwi', ctx)).toMatch(/^\?/);
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
  it('needs a run for run commands', () => {
    const ctx: CheatCtx = { run: null, world: null, jumpToStage: () => {}, rebuildStage: () => {}, toggleSlowmo: () => false };
    expect(runCheat('lives 3', ctx)).toMatch(/^\?/);
    expect(runCheat('help', ctx)).toMatch(/GOD/);
  });
});
