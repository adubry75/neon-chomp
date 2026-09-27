import type { Dir, Vec } from './types';
import type { GhostKind } from './ghostAI';
import type { FruitId } from '../data/fruits';

export type PacKind = 'main' | 'clone' | 'mini';
export type PacState = 'alive' | 'bubble' | 'respawn' | 'out';

export interface Pac {
  id: number;
  player: number;          // player slot index (clone/mini inherit owner's)
  kind: PacKind;
  x: number; y: number; dir: Dir;
  desired: Dir;
  state: PacState;
  stateT: number;
  color: string;
  mouth: number;           // animation phase
  moving: boolean;
  powerT: number;          // personal power timer (PvP in royale)
  invulnT: number;
  fx: Partial<Record<FruitId, number>>;   // active timed effects
  dashCharges: number;
  dashT: number;
  peelT: number;
  iceDir: Dir;             // ice: the turn currently being slid toward
  iceSlide: number;        // ice: tiles left to slide before iceDir may be taken
  lifeT: number;           // clones/minis expire
  lives: number;           // royale/squad only
  score: number;           // per-player score (royale/squad)
  lastTile: number;
  ownerId: number;         // for clones/minis
  trail: Vec[];            // for rendering motion trails
}

export type GhostState = 'house' | 'leaving' | 'active' | 'eyes' | 'entering' | 'gone';
export type Elite = 'speedy' | 'shielded' | 'splitter' | null;

export interface Ghost {
  id: number;
  kind: GhostKind;
  x: number; y: number; dir: Dir;
  state: GhostState;
  homeX: number; homeY: number;
  fright: boolean;
  reversePending: boolean;
  stunT: number;
  color: string;
  elite: Elite;
  shield: number;
  human: number;           // player slot controlling it, -1 = AI
  desired: Dir;
  dotCounter: number;
  releaseT: number;        // forced release timer (after deaths); <0 = none
  splinter: boolean;       // short-lived mini ghost
  lifeT: number;
  king: boolean;           // Train King boss leader
  history: Vec[];          // positions for conga-line followers
  eatenFlash: number;
  bob: number;
}

export interface TrainCar { x: number; y: number; alive: boolean; color: string; wobble: number }
export interface Dozer { x: number; y: number; color: string; z: number }
export interface Fruit { id: FruitId; x: number; y: number; t: number }
export interface Peel { tx: number; ty: number; t: number }
export interface Teleporter { a: Vec; b: Vec; hue: number }
export interface Gate { tx: number; ty: number; open: boolean }

export interface MegaBoss {
  x: number; y: number; hp: number; maxHp: number; r: number;
  invulnT: number; spawnT: number; vx: number; vy: number;
}

/** Final boss: follows P1's recorded path `delay` seconds behind, flees while P1 is powered. */
export interface EvilBoss {
  x: number; y: number; dir: Dir;
  hp: number; maxHp: number;
  /** 0-based fight phase; each hit advances it. */
  phase: number;
  /** Seconds behind P1 on the trail. Shrinks while unpowered. */
  delay: number;
  mode: 'follow' | 'flee' | 'gone';
  /** Seconds until he can glitch back onto the trail. */
  goneT: number;
  /** Already hit during the current power pellet: no fleeing until it ends. */
  spent: boolean;
  mouth: number;
}

export interface GameEvent {
  t: string;
  x?: number; y?: number;
  v?: number;       // points or amount
  s?: string;       // label / id
  c?: string;       // color
  p?: number;       // player
  x2?: number; y2?: number;
}
