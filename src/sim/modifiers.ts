import { I_NONE, T_OPEN, type Maze } from './maze';
import type { Rng } from './rng';
import type { Dozer, Gate, Teleporter } from './entities';
import { DIRS, DX, DY, type Vec } from './types';

export type ModifierId = 'blackout' | 'ice' | 'conveyor' | 'teleport' | 'gates' | 'mirror' | 'ghostTrain';

/** Ice: tiles Pac slides after pressing a new turn before the turn can happen. */
export const ICE_SLIDE = 0.5;

export const MODIFIERS: Record<ModifierId, { name: string; desc: string; color: string }> = {
  blackout:   { name: 'BLACKOUT', desc: 'Lights out. You only see near yourself.', color: '#8a7dff' },
  ice:        { name: 'ICE RINK', desc: 'Slippery! Press turns early.', color: '#9ff3ff' },
  conveyor:   { name: 'CONVEYORS', desc: 'Belts speed you up... or slow you down.', color: '#ffcf4d' },
  teleport:   { name: 'TELEPORTERS', desc: 'Paired portals zap anything that enters.', color: '#ff5cf0' },
  gates:      { name: 'SHIFTING WALLS', desc: 'Neon gates open and close every few seconds.', color: '#ff6a3d' },
  mirror:     { name: 'MIRROR WORLD', desc: 'Left is right. Right is left. Good luck.', color: '#5cffc8' },
  ghostTrain: { name: 'GHOST TRAIN', desc: 'Sleeping ghosts wake and join a conga line.', color: '#ff2d55' },
};

const isNode = (m: Maze, x: number, y: number) => {
  let n = 0, horiz = false, vert = false;
  for (const d of DIRS) if (m.walkable(x + DX[d], y + DY[d], 'pac')) { n++; if (d % 2) horiz = true; else vert = true; }
  return n !== 2 || (horiz && vert);
};

const protectedTile = (m: Maze, x: number, y: number) =>
  (y >= 10 && y <= 18 && x >= 8 && x <= 19) || (Math.abs(y + 0.5 - m.pacStart.y) < 1 && Math.abs(x + 0.5 - m.pacStart.x) < 3) || m.isTunnel(x, y);

/** Straight runs of corridor become belts. Returns a per-tile direction array (-1 = none). */
export function setupConveyors(m: Maze, rng: Rng): Int8Array {
  const conv = new Int8Array(m.w * m.h).fill(-1);
  const runs: Vec[][] = [];
  for (const horiz of [true, false]) {
    const outer = horiz ? m.h : m.w, inner = horiz ? m.w : m.h;
    for (let a = 0; a < outer; a++) {
      let run: Vec[] = [];
      for (let b = 0; b <= inner; b++) {
        const x = horiz ? b : a, y = horiz ? a : b;
        const ok = b < inner && m.terrainAt(x, y) === T_OPEN && !protectedTile(m, x, y) && !isNode(m, x, y);
        if (ok) run.push({ x, y }); else { if (run.length >= 4) runs.push(run); run = []; }
      }
    }
  }
  rng.shuffle(runs);
  let used = 0;
  for (const run of runs) {
    if (used >= 6) break;
    const mirror = run.map(p => ({ x: m.w - 1 - p.x, y: p.y }));
    if (run.some(p => conv[p.y * m.w + p.x] >= 0) || mirror.some(p => conv[p.y * m.w + p.x] >= 0)) continue;
    const horiz = run[0].y === run[run.length - 1].y;
    const d = horiz ? (rng.chance(0.5) ? 1 : 3) : (rng.chance(0.5) ? 0 : 2);
    const md = horiz ? (d === 1 ? 3 : 1) : d;
    for (const p of run) conv[p.y * m.w + p.x] = d;
    for (const p of mirror) conv[p.y * m.w + p.x] = md;
    used += 2;
  }
  return conv;
}

export function setupTeleporters(m: Maze, rng: Rng): Teleporter[] {
  const cands = m.openTiles().filter(p => !protectedTile(m, p.x, p.y) && !isNode(m, p.x, p.y) && p.x < m.w / 2 - 1);
  const out: Teleporter[] = [];
  const far = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 14;
  for (let tries = 0; tries < 200 && out.length < 2; tries++) {
    const a = rng.pick(cands);
    // pair a left-half tile with a right-half tile far away
    const bl = rng.pick(cands);
    const b = { x: m.w - 1 - bl.x, y: bl.y };
    if (!far(a, b)) continue;
    if (out.some(t => Math.abs(t.a.x - a.x) + Math.abs(t.a.y - a.y) < 5 || Math.abs(t.b.x - b.x) + Math.abs(t.b.y - b.y) < 5)) continue;
    out.push({ a: { ...a }, b, hue: out.length ? 190 : 300 });
  }
  return out;
}

/** Corridor tiles that toggle into walls. Only mid-corridor tiles whose closure keeps the maze connected. */
export function setupGates(m: Maze, rng: Rng): Gate[] {
  const cands = m.openTiles().filter(p => p.x < m.w / 2 && !protectedTile(m, p.x, p.y) && !isNode(m, p.x, p.y));
  rng.shuffle(cands);
  const gates: Gate[] = [];
  for (const c of cands) {
    if (gates.length >= 6) break;
    const pair = [c, { x: m.w - 1 - c.x, y: c.y }];
    if (gates.some(g => Math.abs(g.tx - c.x) + Math.abs(g.ty - c.y) < 4)) continue;
    // test connectivity with all current gates + this pair closed
    const closed = new Set([...gates.map(g => g.ty * m.w + g.tx), ...pair.map(p => p.y * m.w + p.x)]);
    if (!connectedWithout(m, closed)) continue;
    for (const p of pair) gates.push({ tx: p.x, ty: p.y, open: true });
  }
  return gates;
}

function connectedWithout(m: Maze, closed: Set<number>): boolean {
  const start = Math.floor(m.pacStart.y) * m.w + Math.floor(m.pacStart.x);
  const seen = new Uint8Array(m.w * m.h);
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const i = q.pop()!; const x = i % m.w, y = (i / m.w) | 0;
    for (const d of DIRS) {
      const nx = m.wrapX(x + DX[d]), ny = y + DY[d];
      if (ny < 0 || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (seen[j] || closed.has(j) || m.terrain[j] !== T_OPEN) continue;
      seen[j] = 1; q.push(j);
    }
  }
  for (let i = 0; i < m.terrain.length; i++) if (m.terrain[i] === T_OPEN && !closed.has(i) && !seen[i]) return false;
  return true;
}

export function setupDozers(m: Maze, rng: Rng, count: number): Dozer[] {
  const cands = m.openTiles().filter(p => !protectedTile(m, p.x, p.y) && Math.abs(p.y + 0.5 - m.pacStart.y) > 4);
  rng.shuffle(cands);
  const out: Dozer[] = [];
  const colors = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.some(d => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 6)) continue;
    out.push({ x: c.x + 0.5, y: c.y + 0.5, color: rng.pick(colors), z: rng.next() * 6 });
  }
  return out;
}

export const clearItem = (m: Maze, p: Vec) => m.setItem(p.x, p.y, I_NONE);
