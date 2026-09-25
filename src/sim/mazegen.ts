import { Maze, T_DOOR, T_HOUSE, T_OPEN, T_WALL, I_PELLET, I_POWER } from './maze';
import { Rng } from './rng';
import { DIRS, DX, DY } from './types';

/**
 * Procedural maze generator.
 * The left half is a random graph on a lattice of corridor "nodes" (columns/rows
 * borrowed from the arcade layout), then mirrored. Guarantees: symmetric,
 * fully connected, no dead ends, 1-wide corridors, fixed ghost house, a wrap tunnel.
 */
const COLS = [1, 6, 9, 12];
const ROWS = [1, 5, 8, 11, 14, 17, 20, 23, 26, 29];
const W = 28, H = 31;

interface Edge { a: number; b: number; cross?: boolean; tunnel?: boolean }

const NAMES = ['Neon Alley', 'Pixel Plaza', 'Byte Bazaar', 'Glow Grid', 'Circuit Park', 'Laser Loop', 'Vapor Vault',
  'Chrome Canal', 'Synth City', 'Arcade Abyss', 'Disco Docks', 'Static Stadium', 'Voltage Village', 'Plasma Pier', 'Retro Reef'];

export function generateMaze(seed: number): Maze {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const m = tryGenerate(rng);
    if (validateMaze(m).ok) {
      m.name = `${rng.pick(NAMES)} ${String.fromCharCode(65 + rng.int(26))}-${1 + rng.int(9)}`;
      return m;
    }
  }
  throw new Error('maze generation failed');
}

function tryGenerate(rng: Rng): Maze {
  const nodes: { x: number; y: number }[] = [];
  const nodeId = new Map<string, number>();
  const disabled = (x: number, y: number) => x === 12 && y === 14;
  for (const y of ROWS) for (const x of COLS) {
    if (disabled(x, y)) continue;
    nodeId.set(`${x},${y}`, nodes.length); nodes.push({ x, y });
  }
  const id = (x: number, y: number) => nodeId.get(`${x},${y}`);
  const edges: Edge[] = [];
  for (let ri = 0; ri < ROWS.length; ri++) for (let ci = 0; ci < COLS.length; ci++) {
    const a = id(COLS[ci], ROWS[ri]);
    if (a === undefined) continue;
    if (ci + 1 < COLS.length) { const b = id(COLS[ci + 1], ROWS[ri]); if (b !== undefined) edges.push({ a, b }); }
    if (ri + 1 < ROWS.length) { const b = id(COLS[ci], ROWS[ri + 1]); if (b !== undefined) edges.push({ a, b }); }
    if (COLS[ci] === 12) edges.push({ a, b: a, cross: true });
  }
  const tunnelRow = rng.pick([8, 14, 14, 20]);
  const find = (x1: number, y1: number, x2: number, y2: number) =>
    edges.find(e => !e.cross && ((nodes[e.a].x === x1 && nodes[e.a].y === y1 && nodes[e.b].x === x2 && nodes[e.b].y === y2) ||
      (nodes[e.b].x === x1 && nodes[e.b].y === y1 && nodes[e.a].x === x2 && nodes[e.a].y === y2)))!;
  const crossAt = (y: number) => edges.find(e => e.cross && nodes[e.a].y === y)!;

  const chosen = new Set<Edge>([
    find(9, 11, 12, 11), crossAt(11), find(9, 11, 9, 14), find(9, 14, 9, 17), find(9, 17, 12, 17), crossAt(17),
    crossAt(23), find(1, tunnelRow, 6, tunnelRow),
  ]);
  // Avoid long straight "hallways" along the inner ring by sometimes opening the tunnel link to the ring.
  if (tunnelRow === 14) chosen.add(find(6, 14, 9, 14));

  // Kruskal spanning tree on left-half nodes
  const parent = nodes.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const join = (a: number, b: number) => { const ra = root(a), rb = root(b); if (ra === rb) return false; parent[ra] = rb; return true; };
  for (const e of chosen) if (!e.cross) join(e.a, e.b);
  for (const e of rng.shuffle(edges.filter(e => !e.cross && !chosen.has(e)))) if (join(e.a, e.b)) chosen.add(e);
  // loops & extra crossings for flow
  for (const e of edges) if (!chosen.has(e) && rng.chance(e.cross ? 0.35 : 0.22)) chosen.add(e);

  const degree = () => {
    const deg = nodes.map(() => 0);
    for (const e of chosen) { deg[e.a]++; if (!e.cross) deg[e.b]++; }
    return deg;
  };
  // Fix dead ends
  for (let pass = 0; pass < 4; pass++) {
    const deg = degree();
    let fixed = true;
    nodes.forEach((_, i) => {
      if (deg[i] >= 2) return;
      fixed = false;
      const opts = edges.filter(e => !chosen.has(e) && (e.a === i || e.b === i));
      opts.sort((p, q) => (deg[p.a] + deg[p.b]) - (deg[q.a] + deg[q.b]));
      if (opts.length) chosen.add(opts[rng.int(Math.min(2, opts.length))]);
    });
    if (fixed) break;
  }

  // Rasterize
  const m = new Maze(W, H);
  const open = (x: number, y: number) => { m.terrain[y * W + x] = T_OPEN; m.terrain[y * W + (W - 1 - x)] = T_OPEN; };
  for (const e of chosen) {
    const a = nodes[e.a], b = nodes[e.b];
    if (e.cross) { for (let x = a.x; x <= W - 1 - a.x; x++) m.terrain[a.y * W + x] = T_OPEN; continue; }
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) open(x, y);
  }
  open(0, tunnelRow);

  // Ghost house
  for (let y = 12; y <= 16; y++) for (let x = 10; x <= 17; x++) m.terrain[y * W + x] = T_WALL;
  for (let y = 13; y <= 15; y++) for (let x = 11; x <= 16; x++) m.terrain[y * W + x] = T_HOUSE;
  m.terrain[12 * W + 13] = T_DOOR; m.terrain[12 * W + 14] = T_DOOR;

  m.markTunnels(6);

  // Pellets
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (m.terrain[i] !== T_OPEN) continue;
    const center = x >= 8 && x <= 19 && y >= 9 && y <= 19;
    if (center || m.tunnel[i] || (y === 23 && (x === 13 || x === 14))) continue;
    m.items[i] = I_PELLET;
  }
  // Power pellets: nearest open tiles to the arcade spots, left side then mirrored
  for (const [px, py] of [[1, 3], [1, 23]]) {
    let best = -1, bd = Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) {
      const i = y * W + x;
      if (m.items[i] !== I_PELLET) continue;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      const x = best % W, y = (best / W) | 0;
      m.items[best] = I_POWER; m.items[y * W + (W - 1 - x)] = I_POWER;
      m.powerSpots.push({ x, y }, { x: W - 1 - x, y });
    }
  }
  m.countPellets();
  return m;
}

export interface Validation { ok: boolean; reason?: string }

export function validateMaze(m: Maze): Validation {
  const W = m.w, H = m.h;
  // symmetry
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m.terrain[y * W + x] !== m.terrain[y * W + (W - 1 - x)]) return { ok: false, reason: `asymmetric at ${x},${y}` };
  }
  const sx = Math.floor(m.pacStart.x), sy = Math.floor(m.pacStart.y);
  if (m.terrainAt(sx, sy) !== T_OPEN || m.terrainAt(sx - 1, sy) !== T_OPEN) return { ok: false, reason: 'pac start blocked' };
  if (m.terrainAt(13, 11) !== T_OPEN || m.terrainAt(14, 11) !== T_OPEN) return { ok: false, reason: 'house exit blocked' };
  if (m.terrainAt(13, 17) !== T_OPEN || m.terrainAt(14, 17) !== T_OPEN) return { ok: false, reason: 'fruit spot blocked' };
  // connectivity
  const seen = new Uint8Array(W * H);
  const q = [sy * W + sx]; seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!, x = i % W, y = (i / W) | 0;
    for (const d of DIRS) {
      const nx = m.wrapX(x + DX[d]), ny = y + DY[d];
      if (ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (!seen[j] && m.terrain[j] === T_OPEN) { seen[j] = 1; q.push(j); }
    }
  }
  let open = 0;
  for (let i = 0; i < W * H; i++) {
    if (m.terrain[i] !== T_OPEN) continue;
    open++;
    if (!seen[i]) return { ok: false, reason: `unreachable tile ${i % W},${(i / W) | 0}` };
    const x = i % W, y = (i / W) | 0;
    let n = 0;
    for (const d of DIRS) if (m.walkable(x + DX[d], y + DY[d], 'pac')) n++;
    if (n < 2) return { ok: false, reason: `dead end at ${x},${y}` };
  }
  // no 2x2 open blocks (corridors stay 1 wide)
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const o = (a: number, b: number) => m.terrain[b * W + a] === T_OPEN;
    if (o(x, y) && o(x + 1, y) && o(x, y + 1) && o(x + 1, y + 1)) return { ok: false, reason: `wide area at ${x},${y}` };
  }
  if (open < 200) return { ok: false, reason: 'too few corridors' };
  if (m.pelletsTotal < 120) return { ok: false, reason: 'too few pellets' };
  return { ok: true };
}
