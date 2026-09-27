import { advance, centerOf } from '../movement';
import { chooseDir, type GhostKind } from '../ghostAI';
import { BASE_SPEED, DOWN, LEFT, RIGHT, TICK, UP, dist2, type Dir, type Vec } from '../types';
import type { EvilBoss } from '../entities';
import type { World } from '../world';

/** Per phase: starting delay (s), how far it can shrink, and which ghosts join. */
export const EVIL_PHASES: { delay: number; min: number; ghosts: GhostKind[] }[] = [
  { delay: 3.0, min: 1.6, ghosts: [] },
  { delay: 2.4, min: 1.2, ghosts: ['blinky'] },
  { delay: 1.8, min: 0.9, ghosts: ['blinky', 'pinky'] },
];
/** Delay lost per second while P1 is unpowered: he slowly catches up. */
export const EVIL_SHRINK = 0.04;
const GONE_T = 1.2;
const TOUCH = 0.6;

/** Where P1 was `delay` seconds ago, or null if the trail isn't that long yet. */
export function trailPoint(w: World, delay: number): Vec | null {
  const i = w.trail.length - 1 - Math.round(delay * 60);
  return i >= 0 ? w.trail[i] : null;
}

export function setupEvil(w: World): EvilBoss {
  const b: EvilBoss = { x: 14, y: 1.5, dir: LEFT, hp: 3, maxHp: 3, phase: 0, delay: EVIL_PHASES[0].delay, mode: 'gone', goneT: GONE_T, spent: false, mouth: 0 };
  let best = Infinity;
  for (const t of w.maze.openTiles()) {
    const d = dist2(t.x + 0.5, t.y + 0.5, 14, 1.5);
    if (d < best) { best = d; b.x = t.x + 0.5; b.y = t.y + 0.5; }
  }
  return b;
}

/** After P1 dies the trail is gone: he waits to glitch back in. */
export function resetEvil(w: World) {
  const b = w.evil!;
  if (b.hp <= 0) return;
  b.mode = 'gone'; b.goneT = GONE_T; b.delay = EVIL_PHASES[b.phase].delay; b.spent = false;
}

function vanish(w: World, b: EvilBoss) {
  w.emit({ t: 'evilGone', x: b.x, y: b.y });
  b.mode = 'gone'; b.goneT = GONE_T;
}

function hit(w: World, b: EvilBoss, px: number, py: number) {
  const p = w.nearestPac(px, py);
  b.hp--;
  w.addScore(p, 2500);
  w.hitStop = 0.3;
  w.emit({ t: 'bossHit', x: b.x, y: b.y, v: 2500, s: `${b.hp}` });
  if (b.hp <= 0) { b.mode = 'gone'; b.goneT = Infinity; w.bossDown(b.x, b.y); return; }
  b.phase++;
  b.delay = EVIL_PHASES[b.phase].delay;
  b.spent = true;
  vanish(w, b);
  const exit = w.maze.houseExit;
  for (const k of EVIL_PHASES[b.phase].ghosts) {
    if (w.ghosts.some(g => g.kind === k)) continue;
    const g = w.newGhost(k, exit.x, exit.y);
    g.state = 'active'; g.fright = w.powerT > 0;
    w.ghosts.push(g);
    w.emit({ t: 'spawn', x: g.x, y: g.y, c: g.color });
  }
}

const touching = (w: World, b: EvilBoss) =>
  w.mainPacs.find(p => p.state === 'alive' && dist2(p.x, p.y, b.x, b.y) < TOUCH * TOUCH);

export function updateEvil(w: World) {
  const b = w.evil;
  if (!b || b.hp <= 0) return;
  if (w.powerT <= 0) b.spent = false;
  const phase = EVIL_PHASES[b.phase];
  switch (b.mode) {
    case 'gone': {
      b.goneT -= TICK;
      const pt = trailPoint(w, b.delay);
      if (b.goneT <= 0 && pt) {
        b.x = pt.x; b.y = pt.y; b.mode = 'follow';
        w.emit({ t: 'evilBack', x: b.x, y: b.y });
      }
      return;
    }
    case 'follow': {
      if (w.powerT > 0 && !b.spent) {
        b.mode = 'flee';
        b.x = centerOf(b.x); b.y = centerOf(b.y);
        w.emit({ t: 'evilFlee', x: b.x, y: b.y });
        return;
      }
      if (w.powerT <= 0) b.delay = Math.max(phase.min, b.delay - EVIL_SHRINK * TICK);
      const pt = trailPoint(w, b.delay);
      if (!pt) return;
      const dx = pt.x - b.x, dy = pt.y - b.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-6) {
        b.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
        b.mouth += TICK * 14;
      }
      b.x = pt.x; b.y = pt.y;
      // while P1 is powered (but he's already been hit this pellet) he's glitch-shielded: no contact either way
      if (w.powerT > 0) return;
      const p = touching(w, b);
      if (p && p.invulnT <= 0 && p.dashT <= 0) w.hurtPac(p, -1);
      return;
    }
    case 'flee': {
      if (w.powerT <= 0) { vanish(w, b); return; }
      const m = w.maze;
      const pac = w.nearestPac(b.x, b.y);
      const away: Vec | null = pac ? { x: Math.floor(2 * b.x - pac.x), y: Math.floor(2 * b.y - pac.y) } : null;
      const ox = b.x, oy = b.y;
      advance(b, w.params.pac * BASE_SPEED * 0.9 * TICK, m.w,
        mv => chooseDir(m, Math.floor(mv.x), Math.floor(mv.y), mv.dir as Dir, away, 'pac', null, false));
      if (b.x !== ox || b.y !== oy) b.mouth += TICK * 14;
      const p = touching(w, b);
      if (p) hit(w, b, p.x, p.y);
      return;
    }
  }
}
