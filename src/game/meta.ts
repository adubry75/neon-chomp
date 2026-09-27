import type { FruitId } from '../data/fruits';
import { MAX_TIER, TIERS } from '../data/tiers';

export interface MetaSave {
  v: 2;
  souls: number;
  best: number;
  runs: number;
  wins: number;
  bossesBeaten: number;
  /** Highest reincarnation tier the player may start a run on (0..MAX_TIER). */
  tierUnlocked: number;
  /** Wins per tier, index = tier. */
  tierWins: number[];
  /** Highest heat cleared (Heat arrives in a later step). */
  heatBest: number;
  /** One-time cutscenes already shown, e.g. 'sting'. */
  seenCutscenes: string[];
  unlockedFruits: FruitId[];
  perks: Record<string, number>;
  skin: string;
  settings: { bloom: number; crt: boolean; music: number; sfx: number; shake: boolean };
}

const KEY = 'neon-chomp-save-v1';

export const defaultMeta = (): MetaSave => ({
  v: 2, souls: 0, best: 0, runs: 0, wins: 0, bossesBeaten: 0,
  tierUnlocked: 0, tierWins: TIERS.map(() => 0), heatBest: 0, seenCutscenes: [],
  unlockedFruits: [], perks: {}, skin: '#ffe600',
  settings: { bloom: 2, crt: false, music: 0.6, sfx: 0.8, shake: true },
});

/** Bring any saved shape (v1 or v2) up to the current MetaSave. */
export function migrateMeta(raw: Partial<Omit<MetaSave, 'v'>> & { v?: number }): MetaSave {
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

export function saveMeta(m: MetaSave) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable: progress lives for this session only */ }
}

export interface MetaItem {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => number;
  max: number;
  kind: 'fruit' | 'perk' | 'skin';
  fruit?: FruitId;
  color?: string;
}

export const META_ITEMS: MetaItem[] = [
  { id: 'fruit_pineapple', name: 'Unlock Pineapple', desc: 'DASH fruit joins the spawn pool.', cost: () => 15, max: 1, kind: 'fruit', fruit: 'pineapple' },
  { id: 'fruit_banana', name: 'Unlock Banana', desc: 'PEEL TRAP fruit joins the pool.', cost: () => 15, max: 1, kind: 'fruit', fruit: 'banana' },
  { id: 'fruit_grapes', name: 'Unlock Grapes', desc: 'SWARM fruit joins the pool.', cost: () => 25, max: 1, kind: 'fruit', fruit: 'grapes' },
  { id: 'fruit_chili', name: 'Unlock Chili', desc: 'FIRE TRAIL fruit joins the pool.', cost: () => 25, max: 1, kind: 'fruit', fruit: 'chili' },
  { id: 'fruit_key', name: 'Unlock Key', desc: 'VAULT fruit joins the pool.', cost: () => 35, max: 1, kind: 'fruit', fruit: 'key' },
  { id: 'start_lives', name: 'Spare Pac', desc: '+1 starting life per level.', cost: l => 40 + l * 40, max: 2, kind: 'perk' },
  { id: 'start_coins', name: 'Allowance', desc: '+30 starting coins per level.', cost: l => 20 + l * 25, max: 3, kind: 'perk' },
  { id: 'stand_choice', name: 'VIP Stand', desc: '+1 Fruit Stand choice.', cost: () => 90, max: 1, kind: 'perk' },
  { id: 'start_shield', name: 'Lucky Charm', desc: 'Start runs with Afterimage (1 shield).', cost: () => 60, max: 1, kind: 'perk' },
  { id: 'skin_mint', name: 'Skin: Mint', desc: 'Cosmetic.', cost: () => 10, max: 1, kind: 'skin', color: '#5cffc8' },
  { id: 'skin_pink', name: 'Skin: Hot Pink', desc: 'Cosmetic.', cost: () => 10, max: 1, kind: 'skin', color: '#ff5cf0' },
  { id: 'skin_white', name: 'Skin: Ghost White', desc: 'Cosmetic.', cost: () => 20, max: 1, kind: 'skin', color: '#f4f4ff' },
  { id: 'skin_gold', name: 'Skin: Solid Gold', desc: 'Cosmetic. Flex.', cost: () => 60, max: 1, kind: 'skin', color: '#ffb300' },
];

export const perkLevel = (m: MetaSave, id: string) => m.perks[id] ?? 0;

export function soulsForRun(score: number, stagesCleared: number, bosses: number, won: boolean) {
  return Math.floor(score / 3000) + stagesCleared * 2 + bosses * 8 + (won ? 30 : 0);
}
