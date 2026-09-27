import type { Mods } from '../sim/mods';

/** Optional difficulty rules (Game++). Each point of heat is +10% souls. Never needed for the story. */
export interface HeatRule {
  id: string;
  name: string;
  desc: string;
  points: number;
  /** Reincarnation tier that unlocks the rule. */
  tier: number;
  apply(m: Mods): void;
}

export const HEAT_RULES: HeatRule[] = [
  { id: 'phantom_plague', name: 'Phantom Plague', desc: 'Every elite is a phantom, and elites are more common.', points: 2, tier: 2, apply: m => { m.allPhantom = true; m.eliteChance += 0.25; } },
  { id: 'lean_maze', name: 'Lean Maze', desc: 'Mazes keep only 2 power pellets.', points: 2, tier: 2, apply: m => { m.leanMaze = true; } },
  { id: 'stingy_stand', name: 'Stingy Stand', desc: 'One fewer upgrade choice at every stand.', points: 1, tier: 3, apply: m => { m.fruitStandChoices -= 1; } },
  { id: 'iron_ghosts', name: 'Iron Ghosts', desc: 'Ghosts (except Blinky) start with a shield.', points: 2, tier: 4, apply: m => { m.ironGhosts = true; } },
  { id: 'overclock', name: 'Overclock', desc: 'You move 10% faster. Ghosts move 12% faster.', points: 3, tier: 5, apply: m => { m.pacSpeed *= 1.1; m.ghostSpeed *= 1.12; } },
  { id: 'no_refunds', name: 'No Refunds', desc: 'The Fruit Stand stops selling lives.', points: 1, tier: 5, apply: m => { m.noLives = true; } },
];
export const HEAT_BY_ID = Object.fromEntries(HEAT_RULES.map(r => [r.id, r]));
export const MAX_HEAT = HEAT_RULES.reduce((a, r) => a + r.points, 0);

export const heatPoints = (ids: string[]) => ids.reduce((a, id) => a + (HEAT_BY_ID[id]?.points ?? 0), 0);
export const heatSoulMult = (points: number) => 1 + 0.1 * points;

/** Cosmetic skins for clearing a run at this much heat. */
export const HEAT_SKINS = [
  { heat: 4, id: 'skin_ember', name: 'Skin: Ember', color: '#ff8a3d' },
  { heat: 8, id: 'skin_inferno', name: 'Skin: Inferno', color: '#ff2d55' },
  { heat: MAX_HEAT, id: 'skin_whitehot', name: 'Skin: White Hot', color: '#fffbe8' },
];
