/** Reincarnation tiers (Game++). R0 is the base game; each win on your highest tier unlocks the next. */
export interface TierDef {
  id: number;
  name: string;
  color: string;
  /** Multiplier on souls earned by a run at this tier. */
  soulMult: number;
}

const NAMES = ['Arcade', 'Afterglow', 'Echo', 'Null Sector', 'Deja Vu', 'Mirror'];
const COLORS = ['#ffe600', '#ff8a3d', '#5ce1ff', '#b45cff', '#ff5cf0', '#ff2d55'];

export const TIERS: TierDef[] = NAMES.map((name, id) => ({ id, name, color: COLORS[id], soulMult: 1.2 ** id }));
export const MAX_TIER = TIERS.length - 1;

export const tierLabel = (tier: number) => `R${tier} · ${TIERS[tier].name.toUpperCase()}`;
// the epsilon guards float error, e.g. 100 * 1.2 ** 2 = 143.99999…
export const tierSouls = (base: number, tier: number) => Math.floor(base * TIERS[tier].soulMult + 1e-9);

/** Gameplay twists. Tiers are cumulative: each twist is on from its tier upward. */
export interface Twists {
  phantom: boolean;      // R1: phantom elite ghosts
  megaRemix: boolean;    // R2: Mega Blinky splits in two
  actIV: boolean;        // R3: Act IV · Null Sector
  trainRemix: boolean;   // R4: phantom Train King
  ghostMemory: boolean;  // R4: ghosts learn your junctions
  evilPac: boolean;      // R5: Evil Pac finale
}
export const TWIST_TIER: Record<keyof Twists, number> = { phantom: 1, megaRemix: 2, actIV: 3, trainRemix: 4, ghostMemory: 4, evilPac: 5 };
export const NO_TWISTS: Twists = twistsFor(0);

export function twistsFor(tier: number): Twists {
  const out = {} as Twists;
  for (const k of Object.keys(TWIST_TIER) as (keyof Twists)[]) out[k] = tier >= TWIST_TIER[k];
  return out;
}

/** Wall colour for each act (I, II, III, IV, finale), per tier. R0 is the original look. */
const PALETTES = [
  ['#2d7bff', '#ff2df0', '#39ffb4', '#7d8cff', '#b45cff'],
  ['#ff8a3d', '#ff3d7a', '#ffd23d', '#7d8cff', '#b45cff'],
  ['#5ce1ff', '#7d8cff', '#39ffb4', '#7d8cff', '#b45cff'],
  ['#b45cff', '#ff2df0', '#5ce1ff', '#8a7dff', '#b45cff'],
  ['#ff5cf0', '#ffd23d', '#39ffb4', '#5cd6ff', '#b45cff'],
  ['#ff2d55', '#b45cff', '#ff8a3d', '#8a7dff', '#ff2d55'],
];
export const actColor = (tier: number, act: number) => PALETTES[tier][act];

/**
 * Intermission played before `act` begins (1 = Act I→II, …). The newest one whose tier
 * is at or below the run's tier wins, so older tiers keep their gags.
 */
const GAGS: { act: number; tier: number; id: string }[] = [
  { act: 1, tier: 0, id: 'gag1' }, { act: 1, tier: 1, id: 'gagR1' }, { act: 1, tier: 4, id: 'gagR4' },
  { act: 2, tier: 0, id: 'gag2' }, { act: 2, tier: 2, id: 'gagR2' },
  { act: 3, tier: 3, id: 'gagR3' },
  { act: 4, tier: 5, id: 'faceoff' },
];
export function gagFor(act: number, tier: number): string | null {
  let best: string | null = null, bt = -1;
  for (const g of GAGS) if (g.act === act && g.tier <= tier && g.tier > bt) { best = g.id; bt = g.tier; }
  return best;
}
