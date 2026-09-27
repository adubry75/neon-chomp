import { TICK, dist2, type Vec } from '../types';
import type { MegaBoss } from '../entities';
import type { World } from '../world';

/** Remix (R2+): at this many hits left, Mega Blinky splits into two halves with this many hits each. */
export const SPLIT_AT = 2, HALF_HP = 2;

export function setupMega(remix: boolean): MegaBoss[] {
  return [{ x: 14, y: 5.5, hp: 4, maxHp: 4, r: 1.9, invulnT: 2, spawnT: 7, vx: 0, vy: 0, half: false, remix }];
}

export function resetMegas(w: World) {
  w.megas.forEach((b, i) => {
    b.x = 14 + (w.megas.length > 1 ? (i ? 5 : -5) : 0); b.y = 4.5; b.vx = b.vy = 0; b.invulnT = 2;
  });
}

/** Hits left across every body, and the fight's total (for the health bar). */
export function megaHealth(w: World): { left: number; total: number } {
  const remix = w.megas.some(b => b.remix);
  const total = remix ? 4 - SPLIT_AT + SPLIT_AT * HALF_HP : 4;
  const halves = w.megas.filter(b => b.half);
  const left = halves.length ? halves.reduce((a, b) => a + Math.max(0, b.hp), 0) : Math.max(0, w.megas[0]?.hp ?? 0) + (remix ? SPLIT_AT * HALF_HP - SPLIT_AT : 0);
  return { left, total };
}

function split(w: World, b: MegaBoss) {
  w.megas = [-1, 1].map(s => ({
    ...b, half: true, hp: HALF_HP, maxHp: HALF_HP, r: b.r * 0.8, invulnT: 1.6,
    x: b.x + s * 1.5, vx: s * 7, vy: -3, spawnT: 6,
  }));
  w.emit({ t: 'megaSplit', x: b.x, y: b.y });
}

export function updateMegas(w: World) {
  for (const b of [...w.megas]) updateOne(w, b);
}

function updateOne(w: World, b: MegaBoss) {
  if (b.hp <= 0 || w.bossDefeated) return;
  if (b.invulnT > 0) b.invulnT -= TICK;
  const pac = w.nearestPac(b.x, b.y);
  const frozen = w.freezeT > 0;
  if (pac && !frozen) {
    const dx = pac.x - b.x, dy = pac.y - b.y, d = Math.hypot(dx, dy) || 1;
    const flee = w.powerT > 0 ? -0.75 : 1;
    const speed = (1.9 + (b.maxHp - b.hp) * 0.45 + (b.half ? 0.6 : 0)) * flee;
    b.vx += ((dx / d) * speed - b.vx) * 0.035;
    b.vy += ((dy / d) * speed - b.vy) * 0.035;
  } else { b.vx *= 0.9; b.vy *= 0.9; }
  b.x += b.vx * TICK; b.y += b.vy * TICK;
  b.x = Math.max(b.r * 0.6, Math.min(w.maze.w - b.r * 0.6, b.x));
  b.y = Math.max(b.r * 0.6, Math.min(w.maze.h - b.r * 0.6, b.y));
  b.spawnT -= TICK;
  if (b.spawnT <= 0 && !frozen) {
    b.spawnT = 8 - (b.maxHp - b.hp);
    // spit a splinter onto the nearest lane
    let best: Vec | null = null, bd = Infinity;
    for (const t of w.maze.openTiles()) {
      const d = dist2(t.x + 0.5, t.y + 0.5, b.x, b.y);
      if (d < bd && !(t.y >= 12 && t.y <= 16 && t.x >= 10 && t.x <= 17)) { bd = d; best = t; }
    }
    if (best && w.ghosts.filter(g => g.splinter).length < 3) {
      const s = w.newGhost('blinky', best.x + 0.5, best.y + 0.5);
      s.splinter = true; s.lifeT = 10; s.state = 'active'; s.color = '#ff5c7a';
      s.fright = w.powerT > 0;
      w.ghosts.push(s);
      w.emit({ t: 'splinter', x: s.x, y: s.y, c: s.color });
    }
  }
  for (const p of w.mainPacs) {
    if (p.state !== 'alive') continue;
    const reach = b.r + (p.fx.melon ? 1.2 : 0.4);
    if (dist2(p.x, p.y, b.x, b.y) > reach * reach) continue;
    if ((w.powerT > 0 || p.fx.melon || frozen) && b.invulnT <= 0) {
      b.hp--; b.invulnT = 1.4; b.r = Math.max(0.9, b.r - 0.28);
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      b.vx = (dx / d) * 9; b.vy = (dy / d) * 9;
      w.addScore(p, 2500);
      w.hitStop = 0.3;
      if (b.remix && !b.half && b.hp === SPLIT_AT) split(w, b);
      const { left } = megaHealth(w);
      w.emit({ t: 'bossHit', x: b.x, y: b.y, v: 2500, s: `${left}` });
      if (left <= 0) w.bossDown(b.x, b.y);
      return;
    } else if (w.powerT <= 0 && !frozen && p.invulnT <= 0 && p.dashT <= 0) {
      w.hurtPac(p, -1);
    }
  }
}
