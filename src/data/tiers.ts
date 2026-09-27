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
