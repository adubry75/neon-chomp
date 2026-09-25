import { DIRS, DX, DY, NONE, UP, dist2, opposite, type Dir, type Vec } from './types';
import type { Maze, Walker } from './maze';
import type { Rng } from './rng';

export type GhostKind = 'blinky' | 'pinky' | 'inky' | 'clyde' | 'stalker';

export const SCATTER: Record<GhostKind, Vec> = {
  blinky: { x: 25, y: -3 },
  pinky: { x: 2, y: -3 },
  inky: { x: 27, y: 31 },
  clyde: { x: 0, y: 31 },
  stalker: { x: 14, y: 33 },
};

export interface PacView { tx: number; ty: number; dir: Dir }

/** Faithful arcade chase targets, including the "up" overflow quirk for Pinky and Inky. */
export function chaseTarget(kind: GhostKind, pac: PacView, self: Vec, blinky: Vec): Vec {
  const d = pac.dir < 0 ? 1 : pac.dir; // standing still: treat like facing left (arcade default)
  const ahead = (n: number): Vec => {
    const v = { x: pac.tx + DX[d] * n, y: pac.ty + DY[d] * n };
    if (d === UP) v.x -= n; // arcade overflow bug
    return v;
  };
  switch (kind) {
    case 'blinky': return { x: pac.tx, y: pac.ty };
    case 'pinky': return ahead(4);
    case 'inky': {
      const p = ahead(2);
      return { x: p.x * 2 - blinky.x, y: p.y * 2 - blinky.y };
    }
    case 'clyde':
      return dist2(self.x, self.y, pac.tx, pac.ty) > 64 ? { x: pac.tx, y: pac.ty } : SCATTER.clyde;
    case 'stalker':
      // Ambushes from far away, goes straight for you when close.
      return dist2(self.x, self.y, pac.tx, pac.ty) > 36 ? ahead(6) : { x: pac.tx, y: pac.ty };
  }
}

/**
 * Pick the exit from tile (tx,ty): never reverse, prefer the neighbour tile closest
 * (straight-line) to the target, ties broken up > left > down > right.
 */
export function chooseDir(maze: Maze, tx: number, ty: number, cur: Dir, target: Vec | null, who: Walker, rng: Rng | null, respectNoUp: boolean): Dir {
  const back = opposite(cur);
  const options: Dir[] = [];
  for (const d of DIRS) {
    if (d === back) continue;
    if (!maze.canGo(tx, ty, d, who)) continue;
    if (respectNoUp && d === UP && maze.noUp.has(ty * maze.w + maze.wrapX(tx))) continue;
    options.push(d);
  }
  if (options.length === 0) return maze.canGo(tx, ty, back, who) ? back : NONE;
  if (!target && rng) return rng.pick(options);
  if (!target) return options[0];
  let best: Dir = options[0], bestD = Infinity;
  for (const d of options) {
    const dd = dist2(tx + DX[d], ty + DY[d], target.x, target.y);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best;
}
