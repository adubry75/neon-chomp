import { BASE_SPEED, DIRS, DOWN, DX, DY, LEFT, NONE, RIGHT, TICK, UP, dist2, opposite, type Dir, type Vec } from './types';
import { I_COIN, I_CORE, I_NONE, I_PELLET, I_POWER, T_OPEN, T_WALL, type Maze } from './maze';
import { Rng } from './rng';
import { advance, atCenter, centerOf, tryCorner } from './movement';
import { SCATTER, chaseTarget, chooseDir, type GhostKind } from './ghostAI';
import { levelParams, type LevelParams } from '../data/levels';
import { FRUITS, type FruitId } from '../data/fruits';
import type { Mods } from './mods';
import type { Dozer, Fruit, GameEvent, Gate, Ghost, MegaBoss, Pac, Peel, Teleporter, TrainCar } from './entities';
import { ICE_SLIDE, setupConveyors, setupDozers, setupGates, setupTeleporters, type ModifierId } from './modifiers';

export type GameMode = 'run' | 'royale' | 'squad';
export type BossId = 'mega' | 'train' | 'eater';

export interface PlayerInfo { slot: number; color: string }
export interface PlayerInput { dir: Dir; action: boolean }

export interface StageConfig {
  mode: GameMode;
  maze: Maze;
  level: number;
  mods: Mods;
  modifiers: ModifierId[];
  boss: BossId | null;
  players: PlayerInfo[];
  seed: number;
  fruitPool: FruitId[];
  lives: number;
  scoreBase: number;
  /** squad: slot playing Pac; others (ghostPlayers) drive ghosts. */
  squadPac?: number;
  ghostPlayers?: number[];
  royaleTime?: number;
}

export const GHOST_COLORS: Record<GhostKind, string> = {
  blinky: '#ff2d55', pinky: '#ff8cf0', inky: '#2de2ff', clyde: '#ffab2d', stalker: '#a45cff',
};

const EXTRA_LIFE_EVERY = 25000;
const FRUIT_LIFETIME = 10;

export class World {
  cfg: StageConfig;
  maze: Maze;
  pristine: Maze;
  params: LevelParams;
  mods: Mods;
  rng: Rng;
  time = 0;
  phase: 'ready' | 'play' | 'dying' | 'clear' | 'over' = 'ready';
  phaseT = 2.2;
  done: null | 'clear' | 'over' = null;
  hitStop = 0;

  pacs: Pac[] = [];
  ghosts: Ghost[] = [];
  cars: TrainCar[] = [];
  dozers: Dozer[] = [];
  fruit: Fruit | null = null;
  peels: Peel[] = [];
  fire: Float32Array;
  conveyor: Int8Array | null = null;
  teleporters: Teleporter[] = [];
  gates: Gate[] = [];
  gateT = 6;
  inputs: PlayerInput[] = [];
  prevAction: boolean[] = [];
  events: GameEvent[] = [];

  score: number;
  lives: number;
  coins = 0;
  coinsF = 0;
  shieldsLeft: number;
  combo = 0;
  bestCombo = 0;
  ghostsEaten = 0;
  fruitsEaten = 0;
  powerT = 0;
  freezeT = 0;
  frenzyT = 0;
  modeIdx = 0;
  modeT = 0;
  dotsEaten = 0;
  idleT = 0;
  nextFruitAt: number;
  deathsThisStage = 0;
  dyingPac: Pac | null = null;
  ghostScores: Record<number, number> = {};
  royaleT: number;
  powerRespawn: { x: number; y: number; t: number }[] = [];
  mega: MegaBoss | null = null;
  voidY = Infinity;
  voidSpeed = 0.42;
  coresLeft = 0;
  bossDefeated = false;
  /** Cheat: main pacs can't be hurt. */
  god = false;
  private idGen = 1;
  private tpCool = new WeakMap<object, number>();

  constructor(cfg: StageConfig) {
    this.cfg = cfg;
    this.maze = cfg.maze.clone();
    this.pristine = cfg.maze.clone();
    this.params = levelParams(cfg.level);
    this.mods = cfg.mods;
    this.rng = new Rng(cfg.seed);
    this.score = cfg.scoreBase;
    this.lives = cfg.lives;
    this.shieldsLeft = cfg.mods.shields;
    this.fire = new Float32Array(this.maze.w * this.maze.h);
    this.nextFruitAt = Math.round(60 / cfg.mods.fruitRate);
    this.royaleT = cfg.royaleTime ?? 150;
    for (let i = 0; i < 4; i++) { this.inputs.push({ dir: NONE, action: false }); this.prevAction.push(false); }

    const m = this.maze;
    const mods = cfg.modifiers;
    if (mods.includes('conveyor')) this.conveyor = setupConveyors(m, this.rng);
    if (mods.includes('teleport')) this.teleporters = setupTeleporters(m, this.rng);
    if (mods.includes('gates')) this.gates = setupGates(m, this.rng);
    if (mods.includes('ghostTrain')) this.dozers = setupDozers(m, this.rng, 8);

    this.spawnPacs();
    this.spawnGhosts();
    this.setupBoss();
    this.resetPositions(true);
  }

  has(mod: ModifierId) { return this.cfg.modifiers.includes(mod); }
  get mainPacs() { return this.pacs.filter(p => p.kind === 'main'); }
  get isScatter() { return this.modeIdx < this.params.modes.length && this.modeIdx % 2 === 0; }
  emit(e: GameEvent) { this.events.push(e); }

  // ───────────────────────────── setup ─────────────────────────────

  private newPac(player: number, color: string, kind: Pac['kind'] = 'main'): Pac {
    return {
      id: this.idGen++, player, kind, x: this.maze.pacStart.x, y: this.maze.pacStart.y, dir: LEFT, desired: NONE,
      state: 'alive', stateT: 0, color, mouth: 0, moving: false, powerT: 0, invulnT: 0, fx: {},
      dashCharges: 0, dashT: 0, peelT: 0, iceDir: NONE, iceSlide: 0, lifeT: 0, lives: 3, score: 0, lastTile: -1, ownerId: 0, trail: [],
    };
  }

  private spawnPacs() {
    const c = this.cfg;
    if (c.mode === 'squad') {
      const info = c.players.find(p => p.slot === c.squadPac) ?? c.players[0];
      this.pacs.push(this.newPac(info.slot, info.color));
    } else {
      for (const info of c.players) this.pacs.push(this.newPac(info.slot, info.color));
    }
  }

  private newGhost(kind: GhostKind, hx: number, hy: number): Ghost {
    return {
      id: this.idGen++, kind, x: hx, y: hy, dir: LEFT, state: 'house', homeX: hx, homeY: hy, fright: false,
      reversePending: false, stunT: 0, color: GHOST_COLORS[kind], elite: null, shield: 0, human: -1, desired: NONE,
      dotCounter: 0, releaseT: -1, splinter: false, lifeT: 0, king: false, history: [], eatenFlash: 0, bob: this.rng.next() * 6,
    };
  }

  private spawnGhosts() {
    const m = this.maze, c = this.cfg;
    const hx = m.houseCenter.x, hy = m.houseCenter.y;
    const kinds: GhostKind[] =
      c.boss === 'mega' ? ['blinky', 'pinky'] :
      c.boss === 'train' ? ['blinky', 'pinky', 'inky'] :
      c.mode === 'royale' ? ['blinky', 'pinky', 'inky'] :
      ['blinky', 'pinky', 'inky', 'clyde'];
    if (c.mode === 'run' && this.mods.hunted && !c.boss) kinds.push('stalker');
    const homes: Record<GhostKind, [number, number]> = {
      blinky: [m.houseExit.x, m.houseExit.y], pinky: [hx, hy], inky: [hx - 2, hy], clyde: [hx + 2, hy], stalker: [hx, hy],
    };
    for (const k of kinds) this.ghosts.push(this.newGhost(k, ...homes[k]));

    // Elite variants (never Blinky, never in versus modes)
    if (c.mode === 'run') {
      const chance = Math.min(0.6, Math.max(0, (c.level - 4) * 0.07) + this.mods.eliteChance);
      for (const g of this.ghosts) {
        if (g.kind === 'blinky' || !this.rng.chance(chance)) continue;
        g.elite = this.rng.pick(['speedy', 'shielded', 'splitter'] as const);
        if (g.elite === 'shielded') g.shield = 1;
      }
    }
    if (c.mode === 'squad' && c.ghostPlayers) {
      c.ghostPlayers.forEach((slot, i) => { if (this.ghosts[i]) this.ghosts[i].human = slot; });
    }
  }

  private setupBoss() {
    const b = this.cfg.boss;
    if (b === 'mega') {
      this.mega = { x: 14, y: 5.5, hp: 4, maxHp: 4, r: 1.9, invulnT: 2, spawnT: 7, vx: 0, vy: 0 };
    } else if (b === 'train') {
      const king = this.ghosts[0];
      king.king = true; king.color = '#ffd23d';
      const colors = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
      for (let i = 0; i < 12; i++) this.cars.push({ x: king.x, y: king.y, alive: true, color: colors[i % 4], wobble: i * 0.7 });
    } else if (b === 'eater') {
      this.voidY = this.maze.h + 1;
      this.coresLeft = 3;
      this.placeCore();
    }
  }

  /** Put pacs and ghosts back at their starting spots. */
  resetPositions(initial = false) {
    const m = this.maze;
    const royaleSpots: Vec[] = [{ x: 1.5, y: 1.5 }, { x: m.w - 1.5, y: m.h - 1.5 }, { x: m.w - 1.5, y: 1.5 }, { x: 1.5, y: m.h - 1.5 }];
    this.pacs = this.pacs.filter(p => p.kind === 'main');
    this.pacs.forEach((p, i) => {
      if (p.state === 'out') return;
      if (this.cfg.mode === 'royale') {
        const s = royaleSpots[i % 4]; p.x = s.x; p.y = s.y; p.dir = i % 2 ? LEFT : RIGHT;
      } else {
        const s = this.safeSpawn(); p.x = s.x; p.y = s.y; p.dir = i % 2 ? RIGHT : LEFT;
      }
      p.state = 'alive'; p.desired = NONE; p.fx = {}; p.dashCharges = 0; p.dashT = 0; p.powerT = 0; p.iceDir = NONE; p.iceSlide = 0;
      p.invulnT = initial ? 0 : 1.2; p.trail = [];
    });
    const stagger = [0, 1.5, 4, 6.5, 9];
    let houseIdx = 0;
    for (const g of this.ghosts) {
      if (g.splinter) { g.state = 'gone'; continue; }
      g.x = g.homeX; g.y = g.homeY; g.fright = false; g.stunT = 0; g.reversePending = false; g.history = [];
      if (g.kind === 'blinky') { g.state = 'active'; g.dir = LEFT; continue; }
      g.state = 'house'; g.dir = houseIdx % 2 ? DOWN : UP;
      if (!initial || this.cfg.mode === 'squad' || this.cfg.boss) g.releaseT = stagger[houseIdx + 1];
      houseIdx++;
    }
    this.ghosts = this.ghosts.filter(g => g.state !== 'gone');
    this.powerT = 0; this.freezeT = 0; this.frenzyT = 0;
    if (!this.mods.chainChomp) this.combo = 0;
    this.peels = [];
    if (this.cfg.boss === 'train') {
      const king = this.ghosts.find(g => g.king);
      if (king) for (const c of this.cars) { c.x = king.x; c.y = king.y; }
    } else if (this.cars.length) this.disbandTrain();
    if (this.mega) { this.mega.x = 14; this.mega.y = 4.5; this.mega.vx = this.mega.vy = 0; this.mega.invulnT = 2; }
  }

  private safeSpawn(): Vec {
    const m = this.maze, s = m.pacStart;
    if (s.y < this.voidY - 4) return { ...s };
    // Eater stage: nearest open tile to the top-middle that is well above the void
    let best: Vec = { x: 1.5, y: 1.5 }, bd = Infinity;
    for (const t of m.openTiles()) {
      if (t.y + 0.5 > this.voidY - 6) continue;
      const d = dist2(t.x, t.y, 14, Math.max(1, this.voidY - 9));
      if (d < bd) { bd = d; best = { x: t.x + 0.5, y: t.y + 0.5 }; }
    }
    return best;
  }

  // ───────────────────────────── main loop ─────────────────────────────

  setInput(slot: number, dir: Dir, action: boolean) {
    if (!this.inputs[slot]) return;
    this.inputs[slot].dir = dir; this.inputs[slot].action = action;
  }

  update() {
    if (this.done) return;
    if (this.hitStop > 0) { this.hitStop -= TICK; return; }
    this.time += TICK;
    switch (this.phase) {
      case 'ready':
        this.phaseT -= TICK;
        this.animateIdle();
        if (this.phaseT <= 0) {
          this.phase = 'play'; this.emit({ t: 'go' });
          if (this.mods.startFruit && this.time < 3 && this.cfg.mode === 'run') {
            for (const p of this.mainPacs) this.applyFruit(p, this.rollFruit(), true);
          }
        }
        break;
      case 'play': this.step(); break;
      case 'dying':
        this.phaseT -= TICK;
        if (this.phaseT <= 0) this.afterDeath();
        break;
      case 'clear':
        this.phaseT -= TICK;
        if (this.phaseT <= 0) this.done = 'clear';
        break;
      case 'over':
        this.phaseT -= TICK;
        if (this.phaseT <= 0) this.done = 'over';
        break;
    }
    for (let i = 0; i < 4; i++) this.prevAction[i] = this.inputs[i].action;
  }

  private animateIdle() {
    for (const g of this.ghosts) if (g.state === 'house') this.bounceInHouse(g);
  }

  private step() {
    this.updateTimers();
    for (const p of [...this.pacs]) this.updatePac(p);
    for (const g of [...this.ghosts]) this.updateGhost(g);
    this.updateTrain();
    this.updateMega();
    this.updateEater();
    this.collide();
    this.checkEnd();
  }

  private updateTimers() {
    const mods = this.mods;
    if (this.powerT > 0) {
      this.powerT -= TICK;
      if (this.powerT <= 0) {
        this.powerT = 0;
        for (const g of this.ghosts) g.fright = false;
        if (!mods.chainChomp) this.combo = 0;
        this.emit({ t: 'powerEnd' });
      }
    } else if (this.freezeT <= 0) {
      this.modeT += TICK;
      const modes = this.params.modes;
      if (this.modeIdx < modes.length && this.modeT >= modes[this.modeIdx]) {
        this.modeT = 0; this.modeIdx++;
        for (const g of this.ghosts) if (g.state === 'active' && g.human < 0) g.reversePending = true;
      }
    }
    if (this.freezeT > 0) { this.freezeT -= TICK; if (this.freezeT <= 0) this.emit({ t: 'thaw' }); }
    if (this.frenzyT > 0) this.frenzyT -= TICK;
    this.idleT += TICK;
    if (this.fruit) { this.fruit.t -= TICK; if (this.fruit.t <= 0) this.fruit = null; }
    for (let i = 0; i < this.fire.length; i++) if (this.fire[i] > 0) this.fire[i] -= TICK;
    for (const p of this.peels) p.t -= TICK;
    this.peels = this.peels.filter(p => p.t > 0);

    // power pellet respawns (boss stages & royale)
    for (const r of this.powerRespawn) {
      r.t -= TICK;
      if (r.t <= 0 && this.maze.itemAt(r.x, r.y) === I_NONE && r.y + 0.5 < this.voidY) {
        this.maze.setItem(r.x, r.y, I_POWER); this.emit({ t: 'powerBack', x: r.x + 0.5, y: r.y + 0.5 });
      }
    }
    this.powerRespawn = this.powerRespawn.filter(r => r.t > 0);

    // gates
    if (this.gates.length) {
      this.gateT -= TICK;
      if (this.gateT <= 0) {
        const closing = this.gates[0].open;
        if (closing && this.gates.some(g => this.occupied(g.tx, g.ty))) { this.gateT = 0.3; }
        else {
          for (const g of this.gates) {
            g.open = !closing;
            this.maze.terrain[g.ty * this.maze.w + g.tx] = g.open ? T_OPEN : T_WALL;
          }
          this.gateT = closing ? 4 : 6;
          this.emit({ t: closing ? 'gateClose' : 'gateOpen' });
        }
      }
    }

    // house release on idle
    if (this.idleT > this.params.idleRelease) {
      const g = this.preferredHouseGhost();
      if (g) { g.releaseT = 0.01; this.idleT = 0; }
    }

    if (this.cfg.mode === 'royale') {
      this.royaleT -= TICK;
      if (this.royaleT <= 0) this.endGame('over');
    }
  }

  private occupied(tx: number, ty: number) {
    const near = (x: number, y: number) => Math.abs(x - (tx + 0.5)) < 1.3 && Math.abs(y - (ty + 0.5)) < 1.3;
    return this.pacs.some(p => p.state === 'alive' && near(p.x, p.y)) || this.ghosts.some(g => near(g.x, g.y));
  }

  // ───────────────────────────── pacs ─────────────────────────────

  pacSpeed(p: Pac): number {
    const P = this.params;
    let s = (this.powerT > 0 ? P.pacFright : P.pac) * this.mods.pacSpeed;
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (p.fx.cherry) s *= 1.4;
    if (p.fx.melon) s *= 0.9;
    if (this.mods.tunnelRat && this.maze.isTunnel(tx, ty)) s *= 1.5;
    if (p.dashT > 0) s *= 3.2;
    if (p.kind === 'mini') s *= 1.05;
    s *= this.conveyorFactor(tx, ty, p.dir);
    return s * BASE_SPEED;
  }

  private conveyorFactor(tx: number, ty: number, dir: Dir) {
    if (!this.conveyor || dir < 0) return 1;
    const c = this.conveyor[ty * this.maze.w + this.maze.wrapX(tx)];
    if (c < 0) return 1;
    return c === dir ? 1.6 : c === opposite(dir) ? 0.6 : 1;
  }

  private updatePac(p: Pac) {
    if (p.state === 'out') return;
    if (p.state === 'bubble') return;
    if (p.state === 'respawn') {
      p.stateT -= TICK;
      if (p.stateT <= 0) this.respawnRoyale(p);
      return;
    }
    const m = this.maze;
    if (p.invulnT > 0) p.invulnT -= TICK;
    if (p.dashT > 0) p.dashT -= TICK;
    if (p.powerT > 0) p.powerT -= TICK;

    if (p.kind === 'main') {
      for (const k of Object.keys(p.fx) as FruitId[]) {
        p.fx[k]! -= TICK;
        if (p.fx[k]! <= 0) this.endFx(p, k);
      }
      let dir = this.inputs[p.player]?.dir ?? NONE;
      if (this.has('mirror') && (dir === LEFT || dir === RIGHT)) dir = opposite(dir);
      if (dir !== NONE) p.desired = dir;
      const act = this.inputs[p.player]?.action && !this.prevAction[p.player];
      if (act && p.dashCharges > 0 && p.dashT <= 0) {
        p.dashCharges--; p.dashT = 0.3; this.emit({ t: 'dash', x: p.x, y: p.y, c: p.color });
      }
      if (p.fx.banana) {
        p.peelT -= TICK;
        if (p.peelT <= 0 && this.peels.length < 6) {
          p.peelT = 1.8;
          this.peels.push({ tx: Math.floor(p.x), ty: Math.floor(p.y), t: 14 });
          this.emit({ t: 'peel', x: p.x, y: p.y });
        }
      }
    } else if (p.kind === 'clone') {
      const owner = this.pacs.find(o => o.id === p.ownerId);
      if (!owner || owner.state !== 'alive' || !owner.fx.strawberry) { this.removePac(p); return; }
      const d = owner.desired;
      p.desired = d === LEFT ? RIGHT : d === RIGHT ? LEFT : d;
    } else {
      p.lifeT -= TICK;
      if (p.lifeT <= 0) { this.removePac(p); this.emit({ t: 'pop', x: p.x, y: p.y, c: p.color }); return; }
    }

    const ice = this.has('ice') && p.kind !== 'mini';
    if (p.kind !== 'mini') {
      if (p.desired !== NONE && p.desired === opposite(p.dir)) { p.dir = p.desired; p.iceDir = NONE; p.iceSlide = 0; }
      else if (!ice) tryCorner(p, p.desired, m);
      else if (p.desired !== NONE && p.desired !== p.dir && p.desired !== p.iceDir) { p.iceDir = p.desired; p.iceSlide = ICE_SLIDE; }
    }
    const stepDist = this.pacSpeed(p) * TICK;
    if (ice) p.iceSlide = Math.max(0, p.iceSlide - stepDist);

    const ox = p.x, oy = p.y;
    const decide = (mv: { x: number; y: number; dir: Dir }): Dir => {
      const tx = Math.floor(mv.x), ty = Math.floor(mv.y);
      if (p.kind === 'mini') return this.miniDir(tx, ty, mv.dir);
      const want = p.desired;
      const canWant = want !== NONE && m.canGo(tx, ty, want, 'pac');
      const canStraight = mv.dir !== NONE && m.canGo(tx, ty, mv.dir, 'pac');
      if (ice && canWant && want !== mv.dir && canStraight && p.iceSlide > 0) return mv.dir;
      if (canWant) { p.iceDir = NONE; return want; }
      if (canStraight) return mv.dir;
      return NONE;
    };
    advance(p, stepDist, m.w, decide, mv => this.onCenter(mv as Pac, true));
    const moved = Math.abs(p.x - ox) + Math.abs(p.y - oy) > 1e-6;
    p.moving = moved;
    if (moved) p.mouth += TICK * 14;

    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    const tile = ty * m.w + tx;
    if (p.fx.melon) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.eatAt(p, tx + dx, ty + dy);
    } else this.eatAt(p, tx, ty);

    if (tile !== p.lastTile) {
      if (p.fx.cherry && p.lastTile >= 0) { this.addScore(p, 20); this.emit({ t: 'trail', x: p.x, y: p.y }); }
      p.lastTile = tile;
    }
    if (p.fx.chili) this.fire[tile] = 3;
    const mag = Math.max(this.mods.magnetRadius, p.fx.apple ? 4 : 0);
    if (mag > 0 && p.kind === 'main') this.magnet(p, mag);
  }

  private endFx(p: Pac, k: FruitId) {
    delete p.fx[k];
    if (k === 'pineapple') p.dashCharges = 0;
    if (k === 'strawberry') for (const c of this.pacs.filter(c => c.kind === 'clone' && c.ownerId === p.id)) this.removePac(c);
    this.emit({ t: 'fxEnd', s: k, p: p.player });
  }

  private removePac(p: Pac) { this.pacs = this.pacs.filter(o => o !== p); }

  private magnet(p: Pac, r: number) {
    const m = this.maze;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const it = m.itemAt(cx + dx, cy + dy);
      if (it === I_PELLET || it === I_COIN) {
        this.emit({ t: 'magnet', x: m.wrapX(cx + dx) + 0.5, y: cy + dy + 0.5, x2: p.x, y2: p.y });
        this.eatAt(p, cx + dx, cy + dy);
      }
    }
  }

  /** Grapes mini-Pacs: BFS toward the nearest pellet. */
  private miniDir(tx: number, ty: number, cur: Dir): Dir {
    const m = this.maze;
    const start = ty * m.w + m.wrapX(tx);
    const first = new Int8Array(m.w * m.h).fill(-2);
    first[start] = -1;
    const q: number[] = [start];
    for (let qi = 0; qi < q.length && qi < 500; qi++) {
      const i = q[qi], x = i % m.w, y = (i / m.w) | 0;
      if (i !== start && (m.items[i] === I_PELLET || m.items[i] === I_POWER || m.items[i] === I_COIN)) return first[i] as Dir;
      const order = this.rng.shuffle([...DIRS]);
      for (const d of order) {
        if (!m.canGo(x, y, d, 'pac')) continue;
        const j = (y + DY[d]) * m.w + m.wrapX(x + DX[d]);
        if (first[j] !== -2) continue;
        first[j] = i === start ? d : first[i];
        q.push(j);
      }
    }
    return chooseDir(m, tx, ty, cur, null, 'pac', this.rng, false);
  }

  private onCenter(a: { x: number; y: number; dir: Dir }, isPac: boolean) {
    // teleporters
    if (!this.teleporters.length) return;
    const cool = this.tpCool.get(a) ?? 0;
    if (cool > this.time) return;
    const tx = Math.floor(a.x), ty = Math.floor(a.y);
    for (const t of this.teleporters) {
      for (const [from, to] of [[t.a, t.b], [t.b, t.a]] as const) {
        if (from.x === tx && from.y === ty) {
          this.emit({ t: 'teleport', x: a.x, y: a.y, x2: to.x + 0.5, y2: to.y + 0.5, v: t.hue, s: isPac ? 'pac' : 'ghost' });
          a.x = to.x + 0.5; a.y = to.y + 0.5;
          this.tpCool.set(a, this.time + 0.6);
          if (!this.maze.canGo(to.x, to.y, a.dir, isPac ? 'pac' : 'ghost')) {
            // pick any open direction so nothing gets stuck
            for (const d of DIRS) if (this.maze.canGo(to.x, to.y, d, 'pac')) { a.dir = d; break; }
          }
          return;
        }
      }
    }
  }

  private eatAt(p: Pac, tx: number, ty: number) {
    const m = this.maze;
    if (ty < 0 || ty >= m.h) return;
    const it = m.itemAt(tx, ty);
    if (it === I_NONE) return;
    const x = m.wrapX(tx) + 0.5, y = ty + 0.5;
    m.setItem(tx, ty, I_NONE);
    if (it === I_PELLET || it === I_POWER) {
      m.pelletsLeft--;
      this.dotsEaten++;
      this.idleT = 0;
      const hg = this.preferredHouseGhost();
      if (hg) hg.dotCounter++;
      if (it === I_PELLET) {
        this.addScore(p, 10 * this.mods.pelletPoints * (this.frenzyT > 0 ? 5 : 1));
        this.emit({ t: 'pellet', x, y, p: p.player });
      } else {
        this.addScore(p, 50);
        this.power(p);
        if (this.cfg.boss || this.cfg.mode === 'royale') this.powerRespawn.push({ x: m.wrapX(tx), y: ty, t: this.cfg.mode === 'royale' ? 14 : 11 });
      }
      if (this.dotsEaten >= this.nextFruitAt && !this.fruit) {
        this.spawnFruit();
        this.nextFruitAt = this.dotsEaten + Math.round(95 / this.mods.fruitRate);
      }
      if (this.mods.pelletBomb && this.dotsEaten % 100 === 0) {
        this.emit({ t: 'bomb', x, y });
        for (const g of this.ghosts) if (g.state === 'active' && dist2(g.x, g.y, x, y) < 49) { g.stunT = 2.5; g.reversePending = true; }
      }
      if (this.cfg.mode === 'royale' && m.pelletsLeft <= 0) this.refillPellets();
    } else if (it === I_COIN) {
      this.addCoins(1);
      this.emit({ t: 'coin', x, y });
    } else if (it === I_CORE) {
      this.eatCore(p, x, y);
    }
  }

  private refillPellets() {
    const src = this.pristine;
    for (let i = 0; i < src.items.length; i++) if (src.items[i] === I_PELLET) this.maze.items[i] = I_PELLET;
    this.maze.countPellets();
    this.emit({ t: 'refill' });
  }

  addScore(p: Pac | null, pts: number) {
    const v = Math.round(pts * this.mods.scoreMult);
    const before = this.score;
    this.score += v;
    if (p) {
      const owner = p.kind === 'main' ? p : this.pacs.find(o => o.id === p.ownerId);
      if (owner) owner.score += v;
    }
    if (this.cfg.mode === 'run' && Math.floor(this.score / EXTRA_LIFE_EVERY) > Math.floor(before / EXTRA_LIFE_EVERY)) {
      this.lives++; this.emit({ t: 'extraLife' });
    }
  }

  addCoins(n: number) {
    this.coinsF += n * this.mods.coinMult;
    const c = Math.floor(this.coinsF);
    if (c > this.coins) this.coins = c;
  }

  private power(p: Pac) {
    const dur = this.params.frightTime + this.mods.powerTime;
    if (this.mods.doubleChomp && this.powerT > 0) this.powerT += dur;
    else this.powerT = Math.max(this.powerT, dur);
    if (!this.mods.chainChomp) this.combo = 0;
    for (const g of this.ghosts) {
      if (g.state === 'eyes' || g.state === 'entering' || g.state === 'gone') continue;
      if (g.human >= 0 && g.state !== 'active') continue;
      g.fright = true;
      if (g.state === 'active') g.reversePending = true;
    }
    const owner = p.kind === 'main' ? p : this.pacs.find(o => o.id === p.ownerId) ?? p;
    owner.powerT = this.powerT;
    this.emit({ t: 'power', x: p.x, y: p.y, p: p.player });
  }

  // ───────────────────────────── fruit ─────────────────────────────

  rollFruit(): FruitId {
    return this.rng.weighted(this.cfg.fruitPool, id => FRUITS[id].weight);
  }

  private spawnFruit() {
    if (!this.cfg.fruitPool.length) return;
    const id = this.rollFruit();
    let x = this.maze.fruitSpot.x, y = this.maze.fruitSpot.y;
    if (this.rng.chance(0.35) || y > this.voidY - 2) {
      const tiles = this.maze.openTiles().filter(t => t.y + 0.5 < this.voidY - 3 && this.maze.itemAt(t.x, t.y) === I_NONE && !this.maze.isTunnel(t.x, t.y));
      const far = tiles.filter(t => this.mainPacs.every(p => dist2(p.x, p.y, t.x, t.y) > 36));
      const pick = far.length ? this.rng.pick(far) : tiles.length ? this.rng.pick(tiles) : null;
      if (pick) { x = pick.x + 0.5; y = pick.y + 0.5; }
    }
    this.fruit = { id, x, y, t: FRUIT_LIFETIME };
    this.emit({ t: 'fruitSpawn', x, y, s: id });
  }

  applyFruit(p: Pac, id: FruitId, silent = false) {
    const def = FRUITS[id];
    const dur = def.duration * this.mods.fruitDuration;
    switch (id) {
      case 'bell':
        for (const g of this.ghosts) if (g.state === 'active') { g.stunT = 3; g.reversePending = true; }
        this.emit({ t: 'shock', x: p.x, y: p.y });
        break;
      case 'key': {
        const tiles = this.rng.shuffle(this.maze.openTiles().filter(t => this.maze.itemAt(t.x, t.y) === I_NONE && t.y + 0.5 < this.voidY - 1 && !this.maze.isTunnel(t.x, t.y)));
        for (const t of tiles.slice(0, 16)) { this.maze.setItem(t.x, t.y, I_COIN); this.emit({ t: 'coinDrop', x: t.x + 0.5, y: t.y + 0.5 }); }
        this.emit({ t: 'vault', x: p.x, y: p.y });
        break;
      }
      case 'orange':
        this.freezeT = Math.max(this.freezeT, dur);
        break;
      case 'rainbow':
        this.frenzyT = dur;
        this.power(p);
        this.powerT = Math.max(this.powerT, dur);
        for (const o of this.mainPacs) o.powerT = this.powerT;
        break;
      default: {
        // timed personal effect, max 2 at once (oldest-remaining drops)
        const active = (Object.keys(p.fx) as FruitId[]).filter(k => k !== id);
        if (active.length >= 2) {
          const drop = active.reduce((a, b) => (p.fx[a]! < p.fx[b]! ? a : b));
          this.endFx(p, drop);
        }
        p.fx[id] = dur;
        if (id === 'strawberry') this.spawnClone(p);
        if (id === 'grapes') this.spawnMinis(p, dur);
        if (id === 'pineapple') p.dashCharges = 3;
        if (id === 'banana') p.peelT = 0.2;
      }
    }
    if (!silent) this.emit({ t: 'fruit', x: p.x, y: p.y, s: id, p: p.player });
    else this.emit({ t: 'fxStart', s: id, p: p.player });
  }

  private spawnClone(p: Pac) {
    for (const c of this.pacs.filter(c => c.kind === 'clone' && c.ownerId === p.id)) this.removePac(c);
    const c = this.newPac(p.player, p.color, 'clone');
    c.ownerId = p.id;
    c.x = this.maze.w - p.x; c.y = p.y;
    c.dir = p.dir === LEFT ? RIGHT : p.dir === RIGHT ? LEFT : p.dir;
    if (!this.maze.walkable(Math.floor(c.x), Math.floor(c.y), 'pac')) { c.x = p.x; c.y = p.y; }
    this.pacs.push(c);
  }

  private spawnMinis(p: Pac, dur: number) {
    for (let i = 0; i < 3; i++) {
      const c = this.newPac(p.player, p.color, 'mini');
      c.ownerId = p.id; c.x = centerOf(p.x); c.y = centerOf(p.y); c.dir = DIRS[i + 1]; c.lifeT = dur;
      this.pacs.push(c);
    }
  }

  // ───────────────────────────── ghosts ─────────────────────────────

  private preferredHouseGhost(): Ghost | undefined {
    const order: GhostKind[] = ['pinky', 'inky', 'clyde', 'stalker'];
    for (const k of order) {
      const g = this.ghosts.find(g => g.kind === k && g.state === 'house' && !g.splinter);
      if (g) return g;
    }
    return undefined;
  }

  private nearestPac(x: number, y: number): Pac | null {
    let best: Pac | null = null, bd = Infinity;
    for (const p of this.pacs) {
      if (p.state !== 'alive' || p.kind === 'mini') continue;
      const d = dist2(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private elroy(): number {
    if (this.cfg.boss || this.cfg.mode !== 'run') return 0;
    const left = this.maze.pelletsLeft, P = this.params;
    if (this.ghosts.some(g => g.kind === 'clyde' && g.state === 'house')) return 0;
    return left <= P.elroy2Dots ? 2 : left <= P.elroy1Dots ? 1 : 0;
  }

  ghostTarget(g: Ghost): Vec {
    const tx = Math.floor(g.x), ty = Math.floor(g.y);
    const pac = this.nearestPac(g.x, g.y);
    if (!pac) return SCATTER[g.kind];
    const elroy = g.kind === 'blinky' && this.elroy() > 0;
    if (g.kind === 'clyde' && this.mods.clydeFriend) return SCATTER.clyde;
    if (this.isScatter && !elroy && !g.king && !g.splinter) return SCATTER[g.kind];
    const blinky = this.ghosts.find(o => o.kind === 'blinky' && o.state === 'active');
    const view = { tx: Math.floor(pac.x), ty: Math.floor(pac.y), dir: pac.dir };
    const kind: GhostKind = g.splinter || g.king ? 'blinky' : g.kind;
    return chaseTarget(kind, view, { x: tx, y: ty }, blinky ? { x: Math.floor(blinky.x), y: Math.floor(blinky.y) } : { x: tx, y: ty });
  }

  ghostSpeed(g: Ghost): number {
    const P = this.params;
    const tx = Math.floor(g.x), ty = Math.floor(g.y);
    let s: number;
    if (g.state === 'eyes') return 2.0 * BASE_SPEED;
    if (g.fright) s = P.ghostFright * this.mods.frightSlow;
    else {
      s = P.ghost;
      const e = g.kind === 'blinky' ? this.elroy() : 0;
      if (e === 1) s = P.elroy1; else if (e === 2) s = P.elroy2;
    }
    if (this.maze.isTunnel(tx, ty)) s = Math.min(s, P.ghostTunnel);
    if (g.elite === 'speedy') s *= 1.13;
    if (g.splinter) s *= 0.92;
    if (g.king) s *= 0.82 + (12 - this.cars.filter(c => c.alive).length) * 0.025;
    if (g.human >= 0) s = Math.max(s, P.ghost);
    s *= this.mods.ghostSpeed;
    s *= this.conveyorFactor(tx, ty, g.dir);
    return s * BASE_SPEED;
  }

  private bounceInHouse(g: Ghost) {
    const sp = 2.2 * TICK;
    const top = g.homeY - 0.4, bot = g.homeY + 0.4;
    if (g.dir === UP) { g.y -= sp; if (g.y <= top) { g.y = top; g.dir = DOWN; } }
    else { g.dir = DOWN; g.y += sp; if (g.y >= bot) { g.y = bot; g.dir = UP; } }
  }

  private updateGhost(g: Ghost) {
    g.bob += TICK;
    if (g.eatenFlash > 0) g.eatenFlash -= TICK;
    if (g.splinter) { g.lifeT -= TICK; if (g.lifeT <= 0) { g.state = 'gone'; this.emit({ t: 'pop', x: g.x, y: g.y, c: g.color }); this.ghosts = this.ghosts.filter(o => o !== g); return; } }
    const m = this.maze;
    const exit = m.houseExit;
    switch (g.state) {
      case 'house': {
        this.bounceInHouse(g);
        const limit = this.params.dotLimits[['pinky', 'inky', 'clyde', 'stalker'].indexOf(g.kind)] ?? 0;
        let go = false;
        if (g.releaseT >= 0) { g.releaseT -= TICK; if (g.releaseT <= 0) go = true; }
        else if (g.human < 0 && g.dotCounter >= limit && this.preferredHouseGhost() === g) go = true;
        if (go) { g.state = 'leaving'; g.releaseT = -1; }
        break;
      }
      case 'leaving': {
        const sp = 4 * TICK;
        if (Math.abs(g.x - exit.x) > 1e-3) { const d = exit.x - g.x; g.x += Math.sign(d) * Math.min(sp, Math.abs(d)); g.dir = d < 0 ? LEFT : RIGHT; }
        else if (Math.abs(g.y - exit.y) > 1e-3) { g.x = exit.x; g.y -= Math.min(sp, g.y - exit.y); g.dir = UP; }
        else { g.state = 'active'; g.x = exit.x; g.y = exit.y; g.dir = this.rng.chance(0.5) ? LEFT : RIGHT; g.reversePending = false; }
        break;
      }
      case 'entering': {
        const sp = 5 * TICK;
        g.x = exit.x;
        g.y += Math.min(sp, m.houseCenter.y - g.y);
        g.dir = DOWN;
        if (m.houseCenter.y - g.y < 1e-3) { g.state = 'leaving'; g.fright = false; g.eatenFlash = 0.6; }
        break;
      }
      case 'eyes': {
        advance(g, this.ghostSpeed(g) * TICK, m.w, mv => {
          if (g.state !== 'eyes') return NONE;
          return chooseDir(m, Math.floor(mv.x), Math.floor(mv.y), mv.dir, { x: Math.floor(exit.x - 0.5), y: Math.floor(exit.y) }, 'ghost', null, false);
        }, mv => {
          if (Math.abs(mv.y - exit.y) < 1e-3 && Math.abs(mv.x - exit.x) <= 0.5 + 1e-3) { g.x = exit.x; g.y = exit.y; g.state = 'entering'; }
        });
        if (g.state === 'eyes' && dist2(g.x, g.y, exit.x, exit.y) < 0.02) { g.x = exit.x; g.y = exit.y; g.state = 'entering'; }
        break;
      }
      case 'active': {
        if (g.stunT > 0) { g.stunT -= TICK; return; }
        if (this.freezeT > 0) return;
        if (this.voidY < Infinity && g.y > this.voidY - 0.3) { this.voidRespawn(g); return; }
        const fireI = Math.floor(g.y) * m.w + m.wrapX(Math.floor(g.x));
        if (this.fire[fireI] > 0 && !g.king) { this.burn(g); return; }
        if (g.reversePending) {
          g.reversePending = false;
          const b = opposite(g.dir);
          const onC = atCenter(g.x) && atCenter(g.y);
          if (!onC || m.canGo(Math.floor(g.x), Math.floor(g.y), b, 'ghost')) g.dir = b;
        }
        if (g.human >= 0) {
          const d = this.inputs[g.human]?.dir ?? NONE;
          if (d !== NONE) g.desired = d;
          if (g.desired !== NONE && g.desired === opposite(g.dir)) g.dir = g.desired;
          else tryCorner(g, g.desired, m, 'ghost');
        }
        const leader = g.king || (this.cars.length > 0 && g.kind === 'blinky');
        const ox = g.x, oy = g.y;
        advance(g, this.ghostSpeed(g) * TICK, m.w, mv => this.ghostDecide(g, mv.x, mv.y, mv.dir), mv => {
          this.onCenter(mv, false);
          const tx = Math.floor(mv.x), ty = Math.floor(mv.y);
          const peel = this.peels.find(p => p.tx === tx && p.ty === ty);
          if (peel) {
            peel.t = 0; g.stunT = 1.6; g.reversePending = true;
            this.addScore(null, 100); this.emit({ t: 'slip', x: mv.x, y: mv.y });
          }
        });
        if (leader && (g.x !== ox || g.y !== oy)) {
          g.history.push({ x: g.x, y: g.y });
          if (g.history.length > 1200) g.history.splice(0, g.history.length - 1200);
        }
        break;
      }
    }
  }

  private ghostDecide(g: Ghost, x: number, y: number, dir: Dir): Dir {
    const m = this.maze, tx = Math.floor(x), ty = Math.floor(y);
    if (g.stunT > 0) return NONE;
    if (g.human >= 0) {
      if (g.desired !== NONE && m.canGo(tx, ty, g.desired, 'ghost')) return g.desired;
      if (m.canGo(tx, ty, dir, 'ghost')) return dir;
      return chooseDir(m, tx, ty, dir, null, 'ghost', this.rng, false);
    }
    const target = g.fright ? null : this.ghostTarget(g);
    return chooseDir(m, tx, ty, dir, target, 'ghost', g.fright ? this.rng : null, !g.fright && this.cfg.mode === 'run');
  }

  private sendHome(g: Ghost) {
    g.fright = false; g.stunT = 0; g.reversePending = false;
    if (this.voidY < Infinity) { this.voidRespawn(g); return; }
    g.state = 'eyes';
    // eyes move on the grid: make sure they sit on a lane
    if (!atCenter(g.x) && !atCenter(g.y)) { g.x = centerOf(g.x); g.y = centerOf(g.y); }
    if (g.kind === 'blinky' && this.dozers.length + this.cars.length > 0 && !this.cfg.boss) this.disbandTrain();
  }

  private voidRespawn(g: Ghost) {
    const tiles = this.maze.openTiles().filter(t => t.y <= 4);
    const t = this.rng.pick(tiles);
    g.state = 'active'; g.x = t.x + 0.5; g.y = t.y + 0.5; g.dir = DOWN; g.fright = false; g.eatenFlash = 0.8;
    this.emit({ t: 'spawn', x: g.x, y: g.y, c: g.color });
  }

  private burn(g: Ghost) {
    this.addScore(null, 200);
    this.emit({ t: 'burn', x: g.x, y: g.y, c: g.color });
    this.sendHome(g);
  }

  // ───────────────────────────── collisions ─────────────────────────────

  private collide() {
    for (const p of [...this.pacs]) {
      if (p.state !== 'alive') continue;
      const giant = !!p.fx.melon;
      const r = giant ? 1.35 : 0.62;
      for (const g of [...this.ghosts]) {
        if (g.state !== 'active' || p.state !== 'alive') continue;
        if (dist2(p.x, p.y, g.x, g.y) > r * r) continue;
        if (g.stunT > 0) continue;
        if (this.freezeT > 0) { if (p.kind !== 'mini') this.shatter(g); continue; }
        if (p.kind === 'mini') continue;
        if (g.fright || (giant && !g.king)) { this.eatGhost(g, p); continue; }
        if (g.king) { if (this.powerT > 0 && this.cars.some(c => c.alive)) { this.emit({ t: 'clank', x: g.x, y: g.y }); } continue; }
        if (p.invulnT > 0 || p.dashT > 0) continue;
        this.hurtPac(p, g.human);
      }
      // train cars
      for (const c of this.cars) {
        if (!c.alive || p.state !== 'alive' || p.kind === 'mini') continue;
        if (dist2(p.x, p.y, c.x, c.y) > r * r) continue;
        if (this.freezeT > 0 || this.powerT > 0 || giant) {
          c.alive = false; this.combo++;
          const pts = Math.min(200 * 2 ** Math.min(this.combo - 1, 6), 12800);
          this.addScore(p, pts * this.mods.ghostPoints); this.addCoins(1 + this.mods.comboCoins);
          this.bestCombo = Math.max(this.bestCombo, this.combo); this.ghostsEaten++;
          this.hitStop = 0.08;
          this.emit({ t: 'eatGhost', x: c.x, y: c.y, v: pts, c: c.color, p: p.player });
        } else if (p.invulnT <= 0 && p.dashT <= 0) this.hurtPac(p, -1);
      }
      // bubbles: revive teammates
      if (p.kind === 'main') {
        for (const o of this.pacs) {
          if (o.state === 'bubble' && dist2(p.x, p.y, o.x, o.y) < 0.8) {
            o.state = 'alive'; o.invulnT = 2; o.desired = NONE;
            o.x = centerOf(o.x); o.y = centerOf(o.y);
            this.emit({ t: 'revive', x: o.x, y: o.y, c: o.color });
          }
        }
      }
      // fruit
      if (this.fruit && p.kind === 'main' && dist2(p.x, p.y, this.fruit.x, this.fruit.y) < 0.8) {
        const f = this.fruit; this.fruit = null;
        this.fruitsEaten++;
        this.addScore(p, FRUITS[f.id].points); this.addCoins(3);
        this.emit({ t: 'fruitPts', x: f.x, y: f.y, v: FRUITS[f.id].points, c: FRUITS[f.id].color });
        this.applyFruit(p, f.id);
      }
    }
    // royale PvP
    if (this.cfg.mode === 'royale') {
      const mains = this.mainPacs.filter(p => p.state === 'alive');
      for (const a of mains) for (const b of mains) {
        if (a === b || a.state !== 'alive' || b.state !== 'alive') continue;
        if (a.powerT > 0 && b.powerT <= 0 && b.invulnT <= 0 && dist2(a.x, a.y, b.x, b.y) < 0.6) {
          this.addScore(a, 1500);
          this.emit({ t: 'pvp', x: b.x, y: b.y, c: a.color, v: 1500 });
          this.hitStop = 0.25;
          this.hurtPac(b, -1);
        }
      }
    }
  }

  private shatter(g: Ghost) {
    this.addScore(null, 300);
    this.addCoins(1);
    this.emit({ t: 'shatter', x: g.x, y: g.y, c: g.color, v: 300 });
    this.hitStop = 0.06;
    this.sendHome(g);
  }

  private eatGhost(g: Ghost, p: Pac) {
    if (g.elite === 'shielded' && g.shield > 0) {
      g.shield = 0; g.fright = false; g.reversePending = true;
      this.addScore(p, 100);
      this.emit({ t: 'shieldBreak', x: g.x, y: g.y, c: g.color });
      this.hitStop = 0.08;
      return;
    }
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.ghostsEaten++;
    const pts = Math.round(Math.min(200 * 2 ** Math.min(this.combo - 1, 6), 12800) * this.mods.ghostPoints * (this.mods.clydeFriend ? 0.75 : 1));
    this.addScore(p, pts);
    this.addCoins(Math.min(this.combo, 4) + this.mods.comboCoins);
    this.hitStop = 0.22;
    this.emit({ t: 'eatGhost', x: g.x, y: g.y, v: pts, c: g.color, p: p.player, s: String(this.combo) });
    if (g.human >= 0 && this.cfg.mode === 'squad') this.ghostScores[g.human] = (this.ghostScores[g.human] ?? 0) - 200;
    if (g.elite === 'splitter' && !g.splinter) {
      const s = this.newGhost('blinky', g.x, g.y);
      s.splinter = true; s.lifeT = 9; s.state = 'active'; s.color = g.color;
      s.x = centerOf(g.x); s.y = centerOf(g.y); s.dir = opposite(g.dir);
      this.ghosts.push(s);
      this.emit({ t: 'splinter', x: g.x, y: g.y, c: g.color });
    }
    if (g.splinter) { g.state = 'gone'; this.ghosts = this.ghosts.filter(o => o !== g); return; }
    if (g.king) { this.bossDown(g.x, g.y); g.state = 'gone'; return; }
    this.sendHome(g);
  }

  hurtPac(p: Pac, byHuman: number) {
    if (p.kind === 'clone') { this.removePac(p); this.emit({ t: 'pop', x: p.x, y: p.y, c: p.color }); return; }
    if (p.kind === 'mini') return;
    if (this.god && p.kind === 'main') return;
    const mode = this.cfg.mode;
    if (mode === 'run' && this.shieldsLeft > 0) {
      this.shieldsLeft--; p.invulnT = 2;
      this.emit({ t: 'shield', x: p.x, y: p.y });
      return;
    }
    if (mode === 'squad' && byHuman >= 0) this.ghostScores[byHuman] = (this.ghostScores[byHuman] ?? 0) + 1000;
    if (mode === 'royale') {
      p.lives--;
      this.emit({ t: 'death', x: p.x, y: p.y, c: p.color, p: p.player });
      p.state = p.lives > 0 ? 'respawn' : 'out';
      p.stateT = 2.2; p.fx = {}; p.dashCharges = 0;
      for (const c of this.pacs.filter(c => c.ownerId === p.id)) this.removePac(c);
      return;
    }
    const others = this.mainPacs.filter(o => o !== p && o.state === 'alive');
    if (mode === 'run' && others.length > 0) {
      p.state = 'bubble'; p.fx = {}; p.dashCharges = 0;
      for (const c of this.pacs.filter(c => c.ownerId === p.id)) this.removePac(c);
      this.emit({ t: 'down', x: p.x, y: p.y, c: p.color });
      return;
    }
    this.dyingPac = p;
    this.phase = 'dying';
    this.phaseT = 1.9;
    this.deathsThisStage++;
    this.emit({ t: 'death', x: p.x, y: p.y, c: p.color, p: p.player });
  }

  private afterDeath() {
    this.dyingPac = null;
    if (this.lives <= 0) { this.endGame('over'); return; }
    this.lives--;
    if (this.voidY < Infinity) this.voidY = Math.min(this.maze.h + 1, this.voidY + 5);
    this.resetPositions();
    this.phase = 'ready';
    this.phaseT = 1.6;
  }

  private respawnRoyale(p: Pac) {
    const tiles = this.maze.openTiles();
    let best = tiles[0], bestScore = -1;
    for (let i = 0; i < 16; i++) {
      const t = this.rng.pick(tiles);
      const threats = [...this.ghosts.filter(g => g.state === 'active'), ...this.mainPacs.filter(o => o !== p && o.state === 'alive')];
      const s = Math.min(...threats.map(o => dist2(o.x, o.y, t.x, t.y)), 999);
      if (s > bestScore) { bestScore = s; best = t; }
    }
    p.x = best.x + 0.5; p.y = best.y + 0.5; p.state = 'alive'; p.invulnT = 2.5; p.desired = NONE; p.powerT = 0;
    for (const d of DIRS) if (this.maze.canGo(best.x, best.y, d, 'pac')) { p.dir = d; break; }
    this.emit({ t: 'respawn', x: p.x, y: p.y, c: p.color });
  }

  // ───────────────────────────── ghost train (modifier + boss) ─────────────────────────────

  private disbandTrain() {
    const alive = this.cars.filter(c => c.alive);
    for (const c of alive) {
      this.dozers.push({ x: centerOf(c.x), y: centerOf(c.y), color: c.color, z: this.rng.next() * 6 });
    }
    if (alive.length) this.emit({ t: 'trainBreak' });
    this.cars = [];
  }

  private updateTrain() {
    // wake dozers
    const leader = this.ghosts.find(g => g.king) ?? (this.dozers.length || this.cars.length ? this.ghosts.find(g => g.kind === 'blinky' && g.state === 'active') : undefined);
    if (this.dozers.length && leader && !this.cfg.boss) {
      for (const d of [...this.dozers]) {
        d.z += TICK;
        if (this.mainPacs.some(p => p.state === 'alive' && dist2(p.x, p.y, d.x, d.y) < 6.5)) {
          this.dozers = this.dozers.filter(o => o !== d);
          this.cars.push({ x: d.x, y: d.y, alive: true, color: d.color, wobble: this.rng.next() * 6 });
          this.emit({ t: 'wake', x: d.x, y: d.y, c: d.color });
        }
      }
    }
    if (!this.cars.length || !leader) return;
    if (leader.state !== 'active') return;
    const h = leader.history;
    const spd = this.ghostSpeed(leader) * TICK;
    const gap = Math.max(3, Math.round(0.95 / Math.max(spd, 0.02)));
    let k = 0;
    for (const c of this.cars) {
      if (!c.alive) continue;
      k++;
      const idx = h.length - 1 - k * gap;
      const pt = h[Math.max(0, idx)];
      if (pt) {
        // cars that are still walking over from where they woke up glide toward their slot
        const d = Math.hypot(pt.x - c.x, pt.y - c.y);
        if (d > 2.5 && d < 12) { c.x += (pt.x - c.x) * 0.12; c.y += (pt.y - c.y) * 0.12; }
        else { c.x = pt.x; c.y = pt.y; }
      }
      c.wobble += TICK;
    }
    this.cars = this.cars.filter(c => c.alive);
  }

  // ───────────────────────────── bosses ─────────────────────────────

  private updateMega() {
    const b = this.mega;
    if (!b || b.hp <= 0) return;
    if (b.invulnT > 0) b.invulnT -= TICK;
    const pac = this.nearestPac(b.x, b.y);
    const frozen = this.freezeT > 0;
    if (pac && !frozen) {
      const dx = pac.x - b.x, dy = pac.y - b.y, d = Math.hypot(dx, dy) || 1;
      const flee = this.powerT > 0 ? -0.75 : 1;
      const speed = (1.9 + (b.maxHp - b.hp) * 0.45) * flee;
      b.vx += ((dx / d) * speed - b.vx) * 0.035;
      b.vy += ((dy / d) * speed - b.vy) * 0.035;
    } else { b.vx *= 0.9; b.vy *= 0.9; }
    b.x += b.vx * TICK; b.y += b.vy * TICK;
    b.x = Math.max(b.r * 0.6, Math.min(this.maze.w - b.r * 0.6, b.x));
    b.y = Math.max(b.r * 0.6, Math.min(this.maze.h - b.r * 0.6, b.y));
    b.spawnT -= TICK;
    if (b.spawnT <= 0 && !frozen) {
      b.spawnT = 8 - (b.maxHp - b.hp);
      // spit a splinter onto the nearest lane
      let best: Vec | null = null, bd = Infinity;
      for (const t of this.maze.openTiles()) {
        const d = dist2(t.x + 0.5, t.y + 0.5, b.x, b.y);
        if (d < bd && !(t.y >= 12 && t.y <= 16 && t.x >= 10 && t.x <= 17)) { bd = d; best = t; }
      }
      if (best && this.ghosts.filter(g => g.splinter).length < 3) {
        const s = this.newGhost('blinky', best.x + 0.5, best.y + 0.5);
        s.splinter = true; s.lifeT = 10; s.state = 'active'; s.color = '#ff5c7a';
        s.fright = this.powerT > 0;
        this.ghosts.push(s);
        this.emit({ t: 'splinter', x: s.x, y: s.y, c: s.color });
      }
    }
    for (const p of this.mainPacs) {
      if (p.state !== 'alive') continue;
      const reach = b.r + (p.fx.melon ? 1.2 : 0.4);
      if (dist2(p.x, p.y, b.x, b.y) > reach * reach) continue;
      if ((this.powerT > 0 || p.fx.melon || frozen) && b.invulnT <= 0) {
        b.hp--; b.invulnT = 1.4; b.r = Math.max(0.9, b.r - 0.28);
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
        b.vx = (dx / d) * 9; b.vy = (dy / d) * 9;
        this.addScore(p, 2500);
        this.hitStop = 0.3;
        this.emit({ t: 'bossHit', x: b.x, y: b.y, v: 2500, s: `${b.hp}` });
        if (b.hp <= 0) this.bossDown(b.x, b.y);
      } else if (this.powerT <= 0 && !frozen && p.invulnT <= 0 && p.dashT <= 0) {
        this.hurtPac(p, -1);
      }
    }
  }

  private updateEater() {
    if (this.voidY === Infinity || this.bossDefeated) return;
    this.voidY -= this.voidSpeed * TICK;
    const row = Math.floor(this.voidY + 0.5);
    const m = this.maze;
    for (let y = Math.max(0, row); y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const it = m.items[y * m.w + x];
      if (it === I_PELLET || it === I_POWER) { m.items[y * m.w + x] = I_NONE; m.pelletsLeft--; }
      else if (it === I_COIN) m.items[y * m.w + x] = I_NONE;
    }
    for (const p of this.pacs) {
      if (p.state === 'alive' && p.y > this.voidY + 0.1 && p.invulnT <= 0) this.hurtPac(p, -1);
      else if (p.state === 'alive' && p.y > this.voidY + 0.1) { const s = this.safeSpawn(); p.x = s.x; p.y = s.y; }
    }
    if (this.fruit && this.fruit.y > this.voidY) this.fruit = null;
  }

  private placeCore() {
    const n = 3 - this.coresLeft; // 0,1,2
    const bands = [[15, 23], [7, 15], [1, 7]];
    const [lo, hi] = bands[n];
    const tiles = this.maze.openTiles().filter(t => t.y >= lo && t.y <= hi && !(t.y >= 12 && t.y <= 16 && t.x >= 10 && t.x <= 17) && !this.maze.isTunnel(t.x, t.y));
    const far = tiles.filter(t => this.mainPacs.every(p => dist2(p.x, p.y, t.x, t.y) > 49));
    const t = this.rng.pick(far.length ? far : tiles);
    this.maze.setItem(t.x, t.y, I_CORE);
    this.emit({ t: 'coreSpawn', x: t.x + 0.5, y: t.y + 0.5 });
  }

  private eatCore(p: Pac, x: number, y: number) {
    this.coresLeft--;
    this.addScore(p, 5000);
    this.hitStop = 0.3;
    this.emit({ t: 'core', x, y, v: 5000, s: String(this.coresLeft) });
    this.voidY = Math.min(this.maze.h + 1, this.voidY + 6);
    this.voidSpeed += 0.08;
    if (this.coresLeft <= 0) this.bossDown(x, y);
    else this.placeCore();
  }

  // ───────────────────────────── cheat console hooks ─────────────────────────────

  cheatPower() { const p = this.mainPacs[0]; if (p) this.power(p); }

  /** Finish the stage: beat the boss, or eat every pellet. */
  cheatWin() {
    if (this.cfg.boss) {
      if (this.bossDefeated) return;
      const p = this.mainPacs[0];
      this.bossDown(p?.x ?? 14, p?.y ?? 14);
      return;
    }
    const m = this.maze;
    for (let i = 0; i < m.items.length; i++) if (m.items[i] === I_PELLET || m.items[i] === I_POWER) m.items[i] = I_NONE;
    m.pelletsLeft = 0;
  }

  /** Set the boss's remaining health (hits, cars or cores). False when there's no boss. */
  cheatBossHp(n: number): boolean {
    if (this.mega) { this.mega.hp = Math.max(1, Math.min(this.mega.maxHp, n)); return true; }
    if (this.cfg.boss === 'train') {
      let keep = Math.max(0, n);
      for (const c of this.cars) if (c.alive) { if (keep > 0) keep--; else c.alive = false; }
      return true;
    }
    if (this.cfg.boss === 'eater') { this.coresLeft = Math.max(1, Math.min(3, n)); return true; }
    return false;
  }

  private bossDown(x: number, y: number) {
    this.bossDefeated = true;
    this.addScore(null, 10000);
    this.addCoins(25);
    this.emit({ t: 'bossDown', x, y, v: 10000 });
    this.hitStop = 0.5;
  }

  // ───────────────────────────── end conditions ─────────────────────────────

  private checkEnd() {
    if (this.phase !== 'play') return;
    const c = this.cfg;
    if (c.mode === 'royale') {
      const standing = this.mainPacs.filter(p => p.state !== 'out');
      if ((c.players.length > 1 && standing.length <= 1) || standing.length === 0) this.endGame('over');
      return;
    }
    if (c.mode === 'run') {
      const mains = this.mainPacs;
      if (mains.length && mains.every(p => p.state === 'bubble' || p.state === 'out')) {
        this.dyingPac = mains[0]; this.phase = 'dying'; this.phaseT = 1.9; this.deathsThisStage++;
        this.emit({ t: 'death', x: mains[0].x, y: mains[0].y, c: mains[0].color });
        return;
      }
    }
    const cleared = c.boss ? this.bossDefeated : this.maze.pelletsLeft <= 0;
    if (cleared) {
      this.phase = 'clear'; this.phaseT = c.boss ? 3 : 2.4;
      this.fruit = null;
      this.emit({ t: 'clear' });
    }
  }

  private endGame(_why: 'over') {
    this.phase = 'over'; this.phaseT = 2.2;
    this.emit({ t: 'gameOver' });
  }
}
