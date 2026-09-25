import { Rng } from '../sim/rng';
import { defaultMods, type Mods } from '../sim/mods';
import { World, type BossId, type PlayerInfo } from '../sim/world';
import type { ModifierId } from '../sim/modifiers';
import { classicMaze } from '../data/mazes';
import { generateMaze } from '../sim/mazegen';
import { FRUIT_IDS, FRUITS, type FruitId } from '../data/fruits';
import { RARITY_WEIGHT, UPGRADES, type UpgradeDef } from '../data/upgrades';
import { perkLevel, type MetaSave } from './meta';

export interface StagePlan {
  act: number;       // 0..2
  index: number;     // 0..4 (4 = boss)
  level: number;
  boss: BossId | null;
  modifiers: ModifierId[];
  mazeSeed: number | 'classic';
}

export const BOSS_INFO: Record<BossId, { name: string; sub: string; rules: string[]; color: string }> = {
  mega: { name: 'MEGA BLINKY', sub: 'Only power pellets hurt him. 4 hits.', rules: ['EAT A POWER PELLET, THEN CHOMP HIM.', '4 HITS TO WIN. PELLETS RESPAWN.'], color: '#ff2d55' },
  train: { name: 'GHOST TRAIN KING', sub: 'Eat every car, then the King.', rules: ['POWER UP AND EAT ALL 12 TRAIN CARS,', 'THEN CHOMP THE KING.'], color: '#ffd23d' },
  eater: { name: 'THE MAZE EATER', sub: 'Outrun the void. Eat 3 cores.', rules: ['OUTRUN THE RISING VOID.', 'EAT 3 CORES TO PUSH IT BACK.'], color: '#b45cff' },
};

export const ACTS = ['ACT I · NEON DISTRICT', 'ACT II · GHOST RAILS', 'ACT III · THE GLITCH'];
export const STAGES_PER_ACT = 5;
export const TOTAL_STAGES = 15;

export class Run {
  seed: number;
  rng: Rng;
  players: PlayerInfo[];
  mods: Mods;
  lives: number;
  coins: number;
  score = 0;
  stage = 0;
  upgrades: Record<string, number> = {};
  plan: StagePlan[] = [];
  fruitPool: FruitId[];
  stagesCleared = 0;
  bossesBeaten = 0;
  ghostsEaten = 0;
  fruitsEaten = 0;
  bestCombo = 0;
  rerolls = 0;
  livesBought = 0;
  won = false;
  offers: UpgradeDef[] = [];

  constructor(seed: number, players: PlayerInfo[], meta: MetaSave) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.players = players;
    this.mods = defaultMods();
    this.mods.fruitStandChoices += perkLevel(meta, 'stand_choice');
    this.mods.shields += perkLevel(meta, 'start_shield');
    if (perkLevel(meta, 'start_shield')) this.upgrades.afterimage = 1;
    this.lives = 2 + perkLevel(meta, 'start_lives') + (players.length - 1);
    this.coins = 30 * perkLevel(meta, 'start_coins');
    this.fruitPool = FRUIT_IDS.filter(id => !FRUITS[id].locked || meta.unlockedFruits.includes(id));
    this.buildPlan();
  }

  private buildPlan() {
    const pool: ModifierId[] = ['ice', 'conveyor', 'teleport', 'gates', 'mirror', 'ghostTrain', 'blackout'];
    const gentle: ModifierId[] = ['conveyor', 'teleport', 'ghostTrain'];
    for (let a = 0; a < 3; a++) {
      for (let s = 0; s < STAGES_PER_ACT; s++) {
        const boss: BossId | null = s === 4 ? (['mega', 'train', 'eater'] as const)[a] : null;
        let modifiers: ModifierId[] = [];
        if (!boss) {
          if (a === 0 && s >= 2) modifiers = [this.rng.pick(gentle)];
          if (a === 1) modifiers = [this.rng.pick(pool)];
          if (a === 2) modifiers = this.rng.shuffle([...pool]).slice(0, 2);
        }
        const classic = (a === 0 && s === 0) || boss === 'mega';
        this.plan.push({
          act: a, index: s, level: a * 4 + Math.min(s, 3) + 1 + (boss ? 1 : 0), boss, modifiers,
          mazeSeed: classic ? 'classic' : Math.floor(this.rng.next() * 2 ** 31),
        });
      }
    }
  }

  get current(): StagePlan { return this.plan[this.stage]; }

  makeWorld(): World {
    const p = this.current;
    const maze = p.mazeSeed === 'classic' ? classicMaze() : generateMaze(p.mazeSeed);
    const modifiers = [...p.modifiers];
    if (this.mods.blackout && !modifiers.includes('blackout')) modifiers.push('blackout');
    return new World({
      mode: 'run', maze, level: p.level, mods: this.mods, modifiers, boss: p.boss,
      players: this.players, seed: (this.seed ^ (this.stage * 0x9e3779b1)) >>> 0,
      fruitPool: this.fruitPool, lives: this.lives, scoreBase: this.score,
    });
  }

  /** Pull results back from a finished world. */
  absorb(w: World) {
    this.score = w.score;
    this.lives = w.lives;
    this.coins += w.coins;
    this.ghostsEaten += w.ghostsEaten;
    this.fruitsEaten += w.fruitsEaten;
    this.bestCombo = Math.max(this.bestCombo, w.bestCombo);
    if (w.done === 'clear') {
      this.stagesCleared++;
      if (this.current.boss) this.bossesBeaten++;
      this.coins += 8 + this.current.act * 4 + (w.deathsThisStage === 0 ? 10 : 0);
    }
  }

  advance(): boolean {
    this.stage++;
    if (this.stage >= TOTAL_STAGES) { this.won = true; return false; }
    return true;
  }

  rollOffers() {
    const n = this.mods.fruitStandChoices;
    const avail = UPGRADES.filter(u => (this.upgrades[u.id] ?? 0) < u.max);
    const out: UpgradeDef[] = [];
    let curses = 0;
    while (out.length < n && out.length < avail.length) {
      const left = avail.filter(u => !out.includes(u) && !(u.rarity === 'curse' && curses >= 1));
      if (!left.length) break;
      const bias = this.current.act; // later acts: better stuff
      const u = this.rng.weighted(left, x => RARITY_WEIGHT[x.rarity] * (x.rarity === 'epic' ? 1 + bias * 0.7 : x.rarity === 'rare' ? 1 + bias * 0.3 : 1));
      if (u.rarity === 'curse') curses++;
      out.push(u);
    }
    this.offers = out;
  }

  take(u: UpgradeDef) {
    const ctx = { mods: this.mods, lives: this.lives, coins: this.coins };
    u.apply(ctx);
    this.lives = ctx.lives; this.coins = ctx.coins;
    this.upgrades[u.id] = (this.upgrades[u.id] ?? 0) + 1;
  }

  get lifeCost() { return 45 + this.livesBought * 30; }
  get rerollCost() { return 12 + this.rerolls * 8; }

  buyLife(): boolean {
    if (this.coins < this.lifeCost) return false;
    this.coins -= this.lifeCost; this.livesBought++; this.lives++;
    return true;
  }
  reroll(): boolean {
    if (this.coins < this.rerollCost) return false;
    this.coins -= this.rerollCost; this.rerolls++;
    this.rollOffers();
    return true;
  }

  get seedCode() { return this.seed.toString(36).toUpperCase().padStart(6, '0'); }
}
