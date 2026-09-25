import type { Mods } from '../sim/mods';

export type Rarity = 'common' | 'rare' | 'epic' | 'curse';

export interface RunCtx { mods: Mods; lives: number; coins: number }

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  max: number;
  glyph: string;
  apply(r: RunCtx): void;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#5ce1ff', rare: '#b45cff', epic: '#ffd23d', curse: '#ff2d55',
};
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 1.6, curse: 2.2 };

export const UPGRADES: UpgradeDef[] = [
  // ── common ──
  { id: 'big_appetite', name: 'Big Appetite', desc: 'Power pellets last +2s.', rarity: 'common', max: 3, glyph: '◉', apply: r => { r.mods.powerTime += 2; } },
  { id: 'fleet_feet', name: 'Fleet Feet', desc: '+7% movement speed.', rarity: 'common', max: 3, glyph: '»', apply: r => { r.mods.pacSpeed *= 1.07; } },
  { id: 'fruit_basket', name: 'Fruit Basket', desc: 'Fruit appears 60% more often.', rarity: 'common', max: 2, glyph: '♣', apply: r => { r.mods.fruitRate *= 1.6; } },
  { id: 'extra_juicy', name: 'Extra Juicy', desc: 'Fruit powers last 50% longer.', rarity: 'common', max: 2, glyph: '✚', apply: r => { r.mods.fruitDuration *= 1.5; } },
  { id: 'piggy_bank', name: 'Piggy Bank', desc: '+40% coins from everything.', rarity: 'common', max: 3, glyph: '¢', apply: r => { r.mods.coinMult += 0.4; } },
  { id: 'sticky_fingers', name: 'Sticky Fingers', desc: 'Passive pellet magnet (radius 2, then 3).', rarity: 'common', max: 2, glyph: '∩', apply: r => { r.mods.magnetRadius = r.mods.magnetRadius ? 3 : 2; } },
  { id: 'molasses', name: 'Molasses', desc: 'Ghosts move 5% slower.', rarity: 'common', max: 3, glyph: '≈', apply: r => { r.mods.ghostSpeed *= 0.95; } },
  { id: 'snack_time', name: 'Snack Time', desc: '+1 life.', rarity: 'common', max: 5, glyph: '♥', apply: r => { r.lives += 1; } },
  { id: 'pellet_pusher', name: 'Pellet Pusher', desc: 'Pellets are worth +100%.', rarity: 'common', max: 3, glyph: '•', apply: r => { r.mods.pelletPoints += 1; } },
  { id: 'tunnel_rat', name: 'Tunnel Rat', desc: '+50% speed inside wrap tunnels.', rarity: 'common', max: 1, glyph: '⇆', apply: r => { r.mods.tunnelRat = true; } },
  { id: 'ghost_jelly', name: 'Ghost Jelly', desc: 'Frightened ghosts move 25% slower.', rarity: 'common', max: 2, glyph: '~', apply: r => { r.mods.frightSlow *= 0.75; } },
  // ── rare ──
  { id: 'chain_chomp', name: 'Chain Chomp', desc: 'Ghost combo never resets between power pellets.', rarity: 'rare', max: 1, glyph: '∞', apply: r => { r.mods.chainChomp = true; } },
  { id: 'afterimage', name: 'Afterimage', desc: 'Ignore the first hit in every maze.', rarity: 'rare', max: 3, glyph: '◈', apply: r => { r.mods.shields += 1; } },
  { id: 'pellet_bomb', name: 'Pellet Bomb', desc: 'Every 100th pellet stuns nearby ghosts.', rarity: 'rare', max: 1, glyph: '✸', apply: r => { r.mods.pelletBomb = true; } },
  { id: 'double_chomp', name: 'Double Chomp', desc: 'Power pellet time stacks instead of resetting.', rarity: 'rare', max: 1, glyph: '⧉', apply: r => { r.mods.doubleChomp = true; } },
  { id: 'clyde_friend', name: "Clyde's Friend", desc: 'Clyde never chases you. Ghost points -25%.', rarity: 'rare', max: 1, glyph: '☺', apply: r => { r.mods.clydeFriend = true; } },
  { id: 'lucky_start', name: 'Lucky Start', desc: 'Start every maze with a random fruit power.', rarity: 'rare', max: 1, glyph: '✦', apply: r => { r.mods.startFruit = true; } },
  { id: 'bounty_hunter', name: 'Bounty Hunter', desc: '+2 coins per ghost eaten.', rarity: 'rare', max: 2, glyph: '$', apply: r => { r.mods.comboCoins += 2; } },
  { id: 'ghost_gourmet', name: 'Ghost Gourmet', desc: 'Ghosts are worth +50% points.', rarity: 'rare', max: 2, glyph: '★', apply: r => { r.mods.ghostPoints *= 1.5; } },
  // ── epic ──
  { id: 'score_rush', name: 'Score Rush', desc: 'All points x1.5.', rarity: 'epic', max: 2, glyph: '▲', apply: r => { r.mods.scoreMult *= 1.5; } },
  { id: 'second_wind', name: 'Second Wind', desc: '+2 lives.', rarity: 'epic', max: 2, glyph: '♥♥', apply: r => { r.lives += 2; } },
  { id: 'power_surge', name: 'Power Surge', desc: 'Power +4s and frightened ghosts crawl.', rarity: 'epic', max: 1, glyph: 'ϟ', apply: r => { r.mods.powerTime += 4; r.mods.frightSlow *= 0.8; } },
  { id: 'big_menu', name: 'Big Menu', desc: '+1 choice at every Fruit Stand.', rarity: 'epic', max: 1, glyph: '☰', apply: r => { r.mods.fruitStandChoices += 1; } },
  // ── curses (risk / reward) ──
  { id: 'glass_cannon', name: 'Glass Cannon', desc: 'Lose ALL extra lives. Score x3, coins x2.', rarity: 'curse', max: 1, glyph: '◇', apply: r => { r.lives = 0; r.mods.scoreMult *= 3; r.mods.coinMult *= 2; } },
  { id: 'hunted', name: 'Hunted', desc: 'A 5th ghost stalks you. +1 stand choice, score x1.25.', rarity: 'curse', max: 1, glyph: '☠', apply: r => { r.mods.hunted = true; r.mods.fruitStandChoices += 1; r.mods.scoreMult *= 1.25; } },
  { id: 'greedy', name: 'Greedy', desc: 'Pellets worth x3. Ghosts 10% faster.', rarity: 'curse', max: 1, glyph: '♛', apply: r => { r.mods.pelletPoints *= 3; r.mods.ghostSpeed *= 1.1; } },
  { id: 'night_owl', name: 'Night Owl', desc: 'Every maze is a blackout. Coins x2.', rarity: 'curse', max: 1, glyph: '☾', apply: r => { r.mods.blackout = true; r.mods.coinMult *= 2; } },
  { id: 'elite_squad', name: 'Elite Squad', desc: 'Elite ghosts everywhere. Ghost points x2.', rarity: 'curse', max: 1, glyph: '♜', apply: r => { r.mods.eliteChance += 0.45; r.mods.ghostPoints *= 2; } },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Everything moves 15% faster. Score x1.5.', rarity: 'curse', max: 1, glyph: '⚡', apply: r => { r.mods.pacSpeed *= 1.15; r.mods.ghostSpeed *= 1.15; r.mods.scoreMult *= 1.5; } },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
