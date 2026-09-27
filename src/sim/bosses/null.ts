import { I_CORE, I_NONE } from '../maze';
import { generateMaze } from '../mazegen';
import { TICK, dist2, type Vec } from '../types';
import type { NullBoss, Pac } from '../entities';
import type { World } from '../world';

/** Act IV boss. Eat all key shards to expose it, then touch it. Each hit rewrites the maze. */
export const NULL_KEYS = 4, NULL_EXPOSED = 6;
const R = 1.3;

export function setupNull(w: World): NullBoss {
  const b: NullBoss = { x: 14, y: 3.5, vx: 0, vy: 0, hp: 3, maxHp: 3, keysLeft: NULL_KEYS, exposedT: 0, spin: 0 };
  placeKeys(w, b);
  return b;
}

/** One key per quadrant, as far from the pacs as that quadrant allows. */
function placeKeys(w: World, b: NullBoss) {
  const m = w.maze;
  for (let i = 0; i < m.items.length; i++) if (m.items[i] === I_CORE) m.items[i] = I_NONE;
  const house = (t: Vec) => t.y >= 10 && t.y <= 18 && t.x >= 8 && t.x <= 19;
  const tiles = m.openTiles().filter(t => !house(t) && !m.isTunnel(t.x, t.y));
  for (let q = 0; q < NULL_KEYS; q++) {
    const inQ = tiles.filter(t => (t.x < m.w / 2) === (q % 2 === 0) && (t.y < m.h / 2) === (q < 2));
    const far = inQ.filter(t => w.mainPacs.every(p => dist2(p.x, p.y, t.x, t.y) > 36));
    const pool = far.length ? far : inQ.length ? inQ : tiles;
    const t = w.rng.pick(pool);
    m.setItem(t.x, t.y, I_CORE);
    w.emit({ t: 'coreSpawn', x: t.x + 0.5, y: t.y + 0.5 });
  }
  b.keysLeft = NULL_KEYS;
}

export function resetNull(w: World) {
  const b = w.nullBoss!;
  b.x = 14; b.y = 3.5; b.vx = b.vy = 0;
  if (b.exposedT > 0 || b.keysLeft <= 0) { b.exposedT = 0; placeKeys(w, b); }
}

/** A pac ate a key shard. */
export function eatKey(w: World, p: Pac, x: number, y: number) {
  const b = w.nullBoss!;
  b.keysLeft--;
  w.addScore(p, 1000);
  w.emit({ t: 'nullKey', x, y, v: 1000, s: String(b.keysLeft) });
  if (b.keysLeft <= 0) {
    b.exposedT = NULL_EXPOSED;
    w.hitStop = 0.25;
    w.emit({ t: 'nullExposed', x: b.x, y: b.y });
  }
}

export function updateNull(w: World) {
  const b = w.nullBoss;
  if (!b || b.hp <= 0 || w.bossDefeated) return;
  b.spin += TICK * (b.exposedT > 0 ? 6 : 2);
  const pac = w.nearestPac(b.x, b.y);
  const exposed = b.exposedT > 0;
  if (exposed) {
    b.exposedT -= TICK;
    if (b.exposedT <= 0) { placeKeys(w, b); w.emit({ t: 'nullShield', x: b.x, y: b.y }); }
  }
  if (pac && w.freezeT <= 0) {
    const dx = pac.x - b.x, dy = pac.y - b.y, d = Math.hypot(dx, dy) || 1;
    // hunts you while shielded; runs (a bit slower than you) while exposed
    const speed = exposed ? -3.2 : 1.7 + (b.maxHp - b.hp) * 0.35;
    b.vx += ((dx / d) * speed - b.vx) * 0.04;
    b.vy += ((dy / d) * speed - b.vy) * 0.04;
  } else { b.vx *= 0.9; b.vy *= 0.9; }
  b.x = Math.max(R, Math.min(w.maze.w - R, b.x + b.vx * TICK));
  b.y = Math.max(R, Math.min(w.maze.h - R, b.y + b.vy * TICK));
  for (const p of w.mainPacs) {
    if (p.state !== 'alive') continue;
    const reach = R + (p.fx.melon ? 1.2 : 0.3);
    if (dist2(p.x, p.y, b.x, b.y) > reach * reach) continue;
    if (exposed) { hit(w, b, p); return; }
    if (p.invulnT <= 0 && p.dashT <= 0) w.hurtPac(p, -1);
  }
}

function hit(w: World, b: NullBoss, p: Pac) {
  b.hp--;
  b.exposedT = 0;
  w.addScore(p, 5000);
  w.hitStop = 0.35;
  w.emit({ t: 'bossHit', x: b.x, y: b.y, v: 5000, s: `${b.hp}` });
  if (b.hp <= 0) { w.bossDown(b.x, b.y); return; }
  // the Null rewrites the maze around you
  w.rewriteMaze(generateMaze(Math.floor(w.rng.next() * 2 ** 31)));
  b.x = 14; b.y = 3.5; b.vx = b.vy = 0;
  placeKeys(w, b);
}
