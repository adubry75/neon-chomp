import { DX, DY, NONE, isHorizontal, type Dir } from './types';
import type { Maze, Walker } from './maze';

export interface Mover { x: number; y: number; dir: Dir }

const EPS = 1e-6;
export const centerOf = (v: number) => Math.floor(v) + 0.5;
export const atCenter = (v: number) => Math.abs(v - centerOf(v)) < EPS;
export const snap = (v: number) => (atCenter(v) ? centerOf(v) : v);
export const tileX = (m: Mover) => Math.floor(m.x);
export const tileY = (m: Mover) => Math.floor(m.y);

/** The next tile center strictly ahead of p along sign (+1/-1). */
export function nextCenterAhead(p: number, sign: number): number {
  return sign > 0 ? Math.floor(p - 0.5 + 1e-9) + 1.5 : Math.ceil(p - 0.5 - 1e-9) - 0.5;
}

export const wrap = (v: number, w: number) => ((v % w) + w) % w;

/**
 * Move a grid actor `dist` tiles. At every tile center it passes through,
 * `decide` picks the direction to leave that center (or NONE to stop there).
 * Returns the number of tile centers crossed.
 */
export function advance(m: Mover, dist: number, w: number, decide: (m: Mover) => Dir, onCenter?: (m: Mover) => void): number {
  let crossed = 0;
  for (let guard = 0; dist > 1e-9 && guard < 12; guard++) {
    if (atCenter(m.x) && atCenter(m.y)) {
      m.x = centerOf(m.x); m.y = centerOf(m.y);
      const d = decide(m);
      if (d === NONE) return crossed;
      m.dir = d;
    }
    if (m.dir === NONE) return crossed;
    if (isHorizontal(m.dir)) {
      const s = DX[m.dir];
      const nc = nextCenterAhead(m.x, s);
      const gap = Math.abs(nc - m.x);
      if (dist >= gap) { m.x = nc; dist -= gap; crossed++; } else { m.x += s * dist; dist = 0; }
      m.x = wrap(m.x, w);
    } else {
      const s = DY[m.dir];
      const nc = nextCenterAhead(m.y, s);
      const gap = Math.abs(nc - m.y);
      if (dist >= gap) { m.y = nc; dist -= gap; crossed++; } else { m.y += s * dist; dist = 0; }
    }
    m.x = snap(m.x); m.y = snap(m.y);
    if (onCenter && atCenter(m.x) && atCenter(m.y)) onCenter(m);
  }
  return crossed;
}

export const CORNER_WINDOW = 0.32;

/**
 * Arcade-style cornering for Pac: a perpendicular input pressed just before
 * (or just after) a tile center turns at that center immediately.
 */
export function tryCorner(m: Mover, desired: Dir, maze: Maze, who: Walker = 'pac'): boolean {
  if (desired === NONE || m.dir === NONE || isHorizontal(desired) === isHorizontal(m.dir)) return false;
  const horiz = isHorizontal(m.dir);
  const pos = horiz ? m.x : m.y;
  if (atCenter(pos)) return false; // handled by advance()
  const s = horiz ? DX[m.dir] : DY[m.dir];
  const ahead = nextCenterAhead(pos, s);
  const behind = ahead - s;
  const other = horiz ? Math.floor(m.y) : Math.floor(m.x);
  for (const c of [ahead, behind]) {
    if (Math.abs(c - pos) > CORNER_WINDOW) continue;
    const t = Math.floor(c);
    const tx = horiz ? t : other, ty = horiz ? other : t;
    if (maze.canGo(tx, ty, desired, who)) {
      if (horiz) m.x = wrap(c, maze.w); else m.y = c;
      m.dir = desired;
      return true;
    }
  }
  return false;
}
