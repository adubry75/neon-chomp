import type { Run } from './run';
import type { World } from '../sim/world';
import { FRUIT_IDS, type FruitId } from '../data/fruits';
import { MODIFIERS, type ModifierId } from '../sim/modifiers';
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades';
import { MAX_TIER } from '../data/tiers';

/** What the backtick console can touch. `main.ts` supplies the scene-level hooks. */
export interface CheatCtx {
  run: Run | null;
  world: World | null;
  jumpToStage(index: number): void;
  rebuildStage(): void;
  toggleSlowmo(): boolean;
  restartAtTier(tier: number): void;
}

export const CHEAT_HELP = 'GOD  LIVES n  COINS n  STAGE n  TIER 0-5  CLEAR  BOSSHP n  FRUIT id  UPGRADE id|ALL  MOD id  POWER  SLOWMO';

/**
 * Run one console command. Returns a message for the console log:
 * "OK: …" on success (and the run is marked as cheated), "? …" on error.
 */
export function runCheat(input: string, ctx: CheatCtx): string {
  const [rawCmd = '', rawArg = ''] = input.trim().split(/\s+/);
  const cmd = rawCmd.toUpperCase(), arg = rawArg.toLowerCase();
  const { run, world } = ctx;
  const num = Number(arg);
  const needNum = () => (arg !== '' && Number.isFinite(num) ? null : `? ${cmd} NEEDS A NUMBER`);
  const ok = (msg: string) => { if (run) run.cheated = true; return `OK: ${msg}`; };
  const noRun = '? START A RUN FIRST';

  switch (cmd) {
    case '': return '';
    case 'HELP': return CHEAT_HELP;
    case 'GOD':
      if (!world) return noRun;
      world.god = !world.god;
      return ok(`GOD MODE ${world.god ? 'ON' : 'OFF'}`);
    case 'LIVES': {
      if (!run || !world) return noRun;
      const bad = needNum(); if (bad) return bad;
      run.lives = world.lives = Math.max(0, Math.floor(num));
      return ok(`LIVES ${world.lives}`);
    }
    case 'COINS': {
      if (!run) return noRun;
      const bad = needNum(); if (bad) return bad;
      run.coins = Math.max(0, Math.floor(num));
      return ok(`COINS ${run.coins}`);
    }
    case 'STAGE': {
      if (!run) return noRun;
      const bad = needNum(); if (bad) return bad;
      if (num < 1 || num > run.plan.length) return `? STAGE MUST BE 1-${run.plan.length}`;
      ctx.jumpToStage(Math.floor(num) - 1);
      return ok(`STAGE ${Math.floor(num)}`);
    }
    case 'TIER': {
      if (!run) return noRun;
      const bad = needNum(); if (bad) return bad;
      if (num < 0 || num > MAX_TIER) return `? TIER MUST BE 0-${MAX_TIER}`;
      ctx.restartAtTier(Math.floor(num));
      return ok(`RESTART ON R${Math.floor(num)}`);
    }
    case 'CLEAR':
      if (!world) return noRun;
      world.cheatWin();
      return ok('STAGE CLEARED');
    case 'BOSSHP': {
      if (!world) return noRun;
      const bad = needNum(); if (bad) return bad;
      if (!world.cheatBossHp(Math.floor(num))) return '? NOT A BOSS STAGE';
      return ok(`BOSS HP ${Math.floor(num)}`);
    }
    case 'FRUIT': {
      if (!world) return noRun;
      if (!FRUIT_IDS.includes(arg as FruitId)) return `? FRUITS: ${FRUIT_IDS.join(' ')}`.toUpperCase();
      const p = world.mainPacs[0];
      if (!p) return '? NO PAC';
      world.applyFruit(p, arg as FruitId);
      return ok(`FRUIT ${arg.toUpperCase()}`);
    }
    case 'UPGRADE': {
      if (!run) return noRun;
      const list = arg === 'all' ? UPGRADES : UPGRADE_BY_ID[arg] ? [UPGRADE_BY_ID[arg]] : null;
      if (!list) return '? UNKNOWN UPGRADE (USE THE ID, E.G. FLEET_FEET)';
      let n = 0;
      for (const u of list) {
        if ((run.upgrades[u.id] ?? 0) >= u.max) continue;
        const before = run.lives;
        run.take(u);
        // life changes land on the live world too, since the run re-reads lives from it
        if (world) world.lives = Math.max(0, world.lives + run.lives - before);
        n++;
      }
      return n ? ok(`${n} UPGRADE${n > 1 ? 'S' : ''} ADDED`) : '? ALREADY AT MAX';
    }
    case 'MOD': {
      if (!run) return noRun;
      if (!(arg in MODIFIERS)) return `? MODS: ${Object.keys(MODIFIERS).join(' ')}`.toUpperCase();
      const mods = run.current.modifiers;
      if (!mods.includes(arg as ModifierId)) mods.push(arg as ModifierId);
      ctx.rebuildStage();
      return ok(`MOD ${arg.toUpperCase()}`);
    }
    case 'POWER':
      if (!world) return noRun;
      world.cheatPower();
      return ok('POWER UP');
    case 'SLOWMO':
      return ok(`SLOWMO ${ctx.toggleSlowmo() ? 'ON' : 'OFF'}`);
    default:
      return `? UNKNOWN: ${cmd}. TYPE HELP`;
  }
}
