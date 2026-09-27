import { DOWN, LEFT, RIGHT, UP } from '../sim/types';
import { drawGhost, drawPac, drawShadowPac, text, type Ctx } from './draw';
import { VH, VW } from './renderer';

/** Game++ cutscenes. Each is a pure function of time, like cutscenes.ts. */

/** After the first win: the Glitch has copied Pac. */
export function sting(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  c.save();
  c.strokeStyle = '#2d7bff'; c.globalAlpha = 0.5; c.lineWidth = 2; c.shadowColor = '#2d7bff'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(0, y + 30); c.lineTo(VW, y + 30); c.stroke();
  c.restore();

  if (t < 1.8) {
    c.save(); c.globalAlpha = Math.min(1, t / 0.6);
    text(c, 'PEACE AT LAST...', VW / 2, 240, 16, '#ffe600', 'center', 12);
    c.restore();
  }
  // the shadow slides out from behind Pac, then Pac turns to face it
  if (t > 2.6) drawShadowPac(c, Math.min(VW / 2 + 90, VW / 2 + (t - 2.6) * 160), y, 18, LEFT, 0.18 + 0.04 * Math.sin(t * 20));
  const turned = t > 3;
  drawPac(c, VW / 2 - (t > 2.6 ? 40 : 0), y, 18, turned ? RIGHT : LEFT, turned ? 0.35 : 0.04 + 0.26 * Math.abs(Math.sin(t * 3)), '#ffe600');

  if (t > 1.8 && t < 2.6) glitchBars(c, t, y);
  if (t > 3.2) text(c, '...OR IS IT?', VW / 2, 240, 18, Math.floor(t * 3) % 2 ? '#ff2d55' : '#b45cff', 'center', 16);
  if (t > 4) text(c, 'REINCARNATION UNLOCKED', VW / 2, 300, 11, '#5ce1ff', 'center', 10);
}

/** Slice the frame drawn so far into offset bars with a red/cyan tint. One bar always cuts through Pac. */
function glitchBars(c: Ctx, t: number, pacY: number) {
  const seed = Math.floor(t * 30);
  const src = c.canvas, k = src.height / VH;
  for (let i = 0; i < 7; i++) {
    const h = i === 0 ? 14 : 3 + ((seed * 13 + i * 29) % 14);
    const yy = i === 0 ? pacY - 10 + ((seed * 7) % 12) : (seed * 71 + i * 113) % VH;
    const dx = (((seed + i) * 37) % 48) - 24;
    c.drawImage(src, 0, yy * k, src.width, h * k, dx, yy, VW, h);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.14;
    c.fillStyle = i % 2 ? '#ff2d55' : '#2de2ff'; c.fillRect(0, yy, VW, h);
    c.restore();
  }
}

function street(c: Ctx, y: number) {
  c.save(); c.strokeStyle = '#2d7bff'; c.globalAlpha = 0.5; c.lineWidth = 2; c.shadowColor = '#2d7bff'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(0, y); c.lineTo(VW, y); c.stroke(); c.restore();
}

/** Neon skyline along the bottom; returns the y of the tallest rooftop (on the right). */
function skyline(c: Ctx, floorY: number, color = '#2d7bff') {
  const blocks = [[20, 90], [110, 60], [180, 120], [300, 70], [380, 100], [470, 150], [560, 80]];
  c.save(); c.strokeStyle = color; c.lineWidth = 2; c.shadowColor = color; c.shadowBlur = 10; c.fillStyle = 'rgba(20,10,50,0.9)';
  for (const [x, h] of blocks) { c.fillRect(x, floorY - h, 80, h); c.strokeRect(x, floorY - h, 80, h); }
  c.globalAlpha = 0.5; c.fillStyle = '#ffe9b0';
  for (const [x, h] of blocks) for (let wy = floorY - h + 14; wy < floorY - 10; wy += 22) for (let wx = x + 12; wx < x + 70; wx += 22) if ((wx + wy) % 3) c.fillRect(wx, wy, 6, 8);
  c.restore();
  return floorY - 150;
}

/** R1 (Act I→II): Pac chomps along; the shadow watches from a rooftop and is gone when Pac looks up. */
export function gagR1(c: Ctx, t: number) {
  const floorY = VH / 2 + 110, y = floorY + 22;
  const roof = skyline(c, floorY, '#ff8a3d');
  street(c, y + 26);
  const stopX = 510;
  const px = t < 4.3 ? Math.min(stopX, -40 + t * 140) : t < 5.8 ? stopX : stopX + (t - 5.8) * 150;
  // pellets ahead of Pac
  c.save(); c.fillStyle = '#ffe9c4'; c.shadowColor = '#ffd9a0'; c.shadowBlur = 8;
  for (let x = 30; x < VW; x += 32) if (x > px + 10) { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
  c.restore();
  const looking = t > 4.3 && t < 5.8;
  if (t < 4.5) drawShadowPac(c, 510, roof - 18, 16, LEFT, 0.12);
  else if (t < 4.9) {
    c.save(); c.fillStyle = '#b45cff';
    for (let i = 0; i < 12; i++) { const a = i * 0.52 + t * 9; c.globalAlpha = 1 - (t - 4.5) / 0.4; c.fillRect(510 + Math.cos(a) * (t - 4.5) * 90, roof - 18 + Math.sin(a) * (t - 4.5) * 60, 5, 5); }
    c.restore();
  }
  drawPac(c, px, y, 18, looking ? UP : RIGHT, looking ? 0.1 : 0.04 + 0.26 * Math.abs(Math.sin(t * 14)), '#ffe600');
  if (t > 4.6 && t < 5.8) text(c, '?', px, y - 42, 18, '#ffe600', 'center', 10);
  if (t > 1 && t < 4.3) {
    // the red eye tracks Pac
    c.save(); c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); text(c, '. . .', 510, roof - 52, 8, '#ff2d55', 'center', 6); c.restore();
  }
}

const hop = (t: number, t0: number, h: number, len = 0.6) => (t >= t0 && t <= t0 + len ? -Math.sin((Math.PI * (t - t0)) / len) * h : 0);

/** R2 (Act II→III): Pac does a little routine; the shadow copies it half a beat late, and badly. */
export function gagR2(c: Ctx, t: number) {
  const y = VH / 2 + 60;
  street(c, y + 26);
  // Pac: hop, turn around and back, step-chomp, hop
  const pTurn = t > 1.8 && t < 2.2 ? LEFT : RIGHT;
  const pStep = t > 3 && t < 3.6 ? Math.sin(((t - 3) / 0.6) * Math.PI) * 30 : 0;
  const py = y + hop(t, 0.6, 50) + hop(t, 4.2, 50);
  const pMouth = t > 6.4 ? 0.3 + 0.1 * Math.sin(t * 20) : 0.04 + 0.26 * Math.abs(Math.sin(t * 8));
  drawPac(c, 220 + pStep, py, 18, pTurn, pMouth, '#ffe600');
  // Shadow, 0.5s late: hops way too high, spins until dizzy, steps the wrong way, then flops
  const sx = 450 - (t > 3.5 && t < 4.1 ? -Math.sin(((t - 3.5) / 0.6) * Math.PI) * 30 : 0);
  let sy = y + hop(t, 1.1, 240, 1.1);
  const spinning = t > 2.3 && t < 3.4;
  const dirs = [LEFT, UP, RIGHT, DOWN] as const;
  const sDir = spinning ? dirs[Math.floor(t * 12) % 4] : LEFT;
  if (t > 4.7 && t < 5.3) sy += hop(t, 4.7, 60);
  if (t >= 5.3) {
    // splat: a flattened shadow that slowly puffs back up
    const k = Math.min(1, Math.max(0, (t - 6.2) / 1.2));
    c.save(); c.translate(sx, y + 18 - 18 * k); c.scale(1.6 - 0.6 * k, 0.25 + 0.75 * k);
    drawShadowPac(c, 0, 0, 18, LEFT, 0.12);
    c.restore();
    if (t < 6.4) text(c, 'x x', sx, y - 6, 8, '#ff2d55', 'center', 4);
  } else drawShadowPac(c, sx, sy, 18, sDir, 0.12 + 0.05 * Math.sin(t * 20));
  if (spinning || (t > 3.4 && t < 4)) text(c, '@', sx + 20, y - 34, 10, '#b45cff', 'center', 6);
  if (t > 6.4 && t < 8) text(c, 'HA!', 220, py - 44, 14, '#ffe600', 'center', 10);
  if (t > 7) text(c, 'PRACTICE MAKES PERFECT...', VW / 2, 240, 12, Math.floor(t * 3) % 2 ? '#ff2d55' : '#b45cff', 'center', 12);
}

/** R3 (Act III→IV): the street glitches out under Pac and he drops into the Null Sector. The shadow peeks down after him. */
export function gagR3(c: Ctx, t: number) {
  const y = VH / 2 + 20, floorY = y + 26;
  const holeX0 = 270, holeX1 = 410;
  const open = t > 2.3;
  // street with a hole
  c.save(); c.strokeStyle = '#39ffb4'; c.globalAlpha = 0.6; c.lineWidth = 2; c.shadowColor = '#39ffb4'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(0, floorY); c.lineTo(open ? holeX0 : VW, floorY); if (open) { c.moveTo(holeX1, floorY); c.lineTo(VW, floorY); } c.stroke();
  c.restore();
  if (t > 1.7 && !open) {
    // crack
    c.save(); c.strokeStyle = '#b45cff'; c.lineWidth = 2; c.shadowColor = '#b45cff'; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(holeX0 + 20, floorY); c.lineTo(330, floorY + 8); c.lineTo(350, floorY - 4); c.lineTo(390, floorY + 6); c.stroke(); c.restore();
  }
  if (open) {
    // the void: a pit with streaks rushing up
    const g = c.createLinearGradient(0, floorY, 0, VH);
    g.addColorStop(0, 'rgba(180,92,255,0.35)'); g.addColorStop(1, 'rgba(10,0,20,1)');
    c.fillStyle = g; c.fillRect(holeX0, floorY, holeX1 - holeX0, VH - floorY);
    c.save(); c.fillStyle = '#b45cff';
    for (let k = 0; k < 14; k++) { c.globalAlpha = 0.4; c.fillRect(holeX0 + ((k * 37) % (holeX1 - holeX0)), VH - ((t * 500 + k * 90) % (VH - floorY)), 2, 20); }
    c.restore();
  }
  // pellets
  c.save(); c.fillStyle = '#ffe9c4'; c.shadowColor = '#ffd9a0'; c.shadowBlur = 8;
  for (let x = 30; x < VW; x += 32) if (x > Math.min(340, -40 + t * 170) + 10 && !(open && x > holeX0 && x < holeX1)) { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // Pac walks to the middle, hangs in the air (cartoon rules), looks down, falls
  const px = Math.min(340, -40 + t * 170);
  if (t < 2.9) {
    drawPac(c, px, y, 18, t > 2.4 ? DOWN : RIGHT, t > 2.4 ? 0.3 : 0.04 + 0.26 * Math.abs(Math.sin(t * 14)), '#ffe600');
    if (t > 2.4) text(c, '!', px, y - 40, 18, '#ffe600', 'center', 10);
  } else {
    const ft = t - 2.9;
    const fy = y + ft * ft * 420;
    const spin = [UP, LEFT, DOWN, RIGHT] as const;
    if (fy < VH + 30) drawPac(c, px, fy, 18 * Math.max(0.35, 1 - ft * 0.3), spin[Math.floor(ft * 12) % 4], 0.3, '#ffe600');
    if (ft < 1.4) text(c, 'WAAAH!', px + 60, Math.min(fy, VH - 60) - 10, 9, '#ffe600', 'center', 6);
  }
  // the shadow peeks over the edge
  if (t > 3.8 && t < 6.2) {
    const peek = Math.min(1, (t - 3.8) / 0.5) * (t > 5.7 ? Math.max(0, 1 - (t - 5.7) / 0.5) : 1);
    c.save(); c.beginPath(); c.rect(0, 0, VW, floorY - 2); c.clip();
    drawShadowPac(c, holeX1 + 26, floorY + 16 - peek * 34, 16, LEFT, 0.35);
    c.restore();
  }
}

/** R4 (Act I→II, replaces R1's): the shadow is nearly solid now. It walks in perfect step with Pac, until its eye gives it away. */
export function gagR4(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  street(c, y + 26);
  const walk = Math.min(t, 3) * 90;
  const px = 150 + walk, sx = px + 110;
  const mouth = t < 3 ? 0.04 + 0.26 * Math.abs(Math.sin(t * 14)) : 0.2;
  // the shadow's colours drift toward Pac's; the red eye only shows once Pac looks
  const reveal = t > 4.6;
  const faceOff = t > 3.6;
  drawPac(c, px, y, 18, RIGHT, t > 5.2 && t < 6.2 ? 0.34 : mouth, '#ffe600');
  if (t < 6.2) {
    const flick = reveal && Math.floor(t * 12) % 3 === 0;
    drawShadowPac(c, sx, y, 18, faceOff ? LEFT : RIGHT, faceOff ? 0.2 : mouth, flick ? '#b45cff' : '#ffe600', flick ? '#1a0830' : '#d9c21a', reveal ? '#ff2d55' : '#d9c21a');
  } else {
    // glitches back to purple and bolts
    const k = t - 6.2;
    drawShadowPac(c, sx + k * 520, y, 18, RIGHT, 0.3, '#b45cff');
    c.save(); c.fillStyle = '#b45cff';
    for (let i = 0; i < 8; i++) { c.globalAlpha = Math.max(0, 1 - k * 2); c.fillRect(sx + i * 9 - 30, y - 16 + ((i * 13) % 32), 6, 4); }
    c.restore();
  }
  if (t > 3.6 && t < 4.6) text(c, '?', px, y - 40, 14, '#ffe600', 'center', 8);
  if (t > 5.2 && t < 6.4) text(c, '!!', px, y - 40, 18, '#ff2d55', 'center', 10);
  if (t > 6.6) text(c, 'IT ALMOST LOOKS LIKE YOU NOW...', VW / 2, 240, 11, Math.floor(t * 3) % 2 ? '#ff2d55' : '#b45cff', 'center', 12);
}

/** R5, before the finale: Pac and Evil Pac face off, mirroring each other move for move. */
export function faceoff(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  // split-screen tint: your side, his side
  c.save();
  c.globalAlpha = Math.min(0.18, t * 0.1);
  c.fillStyle = '#ffe600'; c.fillRect(0, 0, VW / 2, VH);
  c.fillStyle = '#b45cff'; c.fillRect(VW / 2, 0, VW / 2, VH);
  c.restore();
  street(c, y + 26);
  // both step in, in perfect sync
  const step = Math.min(1, t / 1.5) * 90 + (t > 3 && t < 3.4 ? Math.sin(((t - 3) / 0.4) * Math.PI) * 20 : 0);
  const bob = t > 4 && t < 5 ? hop(t, 4, 30) : 0;
  const mouth = t > 5.2 ? 0.34 : 0.04 + 0.26 * Math.abs(Math.sin(t * 6));
  drawPac(c, 150 + step, y + bob, 22, RIGHT, mouth, '#ffe600');
  drawShadowPac(c, VW - 150 - step, y + bob, 22, LEFT, mouth);
  // lightning between them
  if (t > 2 && Math.floor(t * 7) % 5 === 0) {
    c.save(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.shadowColor = '#b45cff'; c.shadowBlur = 16;
    c.beginPath(); let lx = VW / 2 - 60, ly = y - 20; c.moveTo(lx, ly);
    for (let k = 0; k < 6; k++) { lx += 20; ly += (k % 2 ? 1 : -1) * (8 + ((Math.floor(t * 7) * 13 + k * 7) % 10)); c.lineTo(lx, ly); }
    c.stroke(); c.restore();
  }
  if (t > 1.6) text(c, 'YOU', 150 + step, y - 60, 12, '#ffe600', 'center', 8);
  if (t > 1.6) text(c, 'ALSO YOU', VW - 150 - step, y - 60, 12, '#b45cff', 'center', 8);
  if (t > 2.4) text(c, 'VS', VW / 2, y - 120, 30, Math.floor(t * 4) % 2 ? '#ff2d55' : '#fff', 'center', 20);
  if (t > 6.6) { c.save(); c.globalAlpha = Math.min(1, (t - 6.6) / 0.6); c.fillStyle = '#fff'; c.fillRect(0, 0, VW, VH); c.restore(); }
}

/** After Evil Pac falls: the glitch shatters, its pixels rain down as pellets, and everyone (ghosts too) celebrates. */
export function trueEnding(c: Ctx, t: number) {
  const y = VH / 2 + 80;
  street(c, y + 26);
  if (t < 2.2) {
    // the shadow shatters into drifting squares
    const k = t / 2.2;
    if (t < 0.5) drawShadowPac(c, VW / 2, y - 120, 30, LEFT, 0.2 + Math.random() * 0.1);
    c.save(); c.fillStyle = '#b45cff'; c.shadowColor = '#b45cff'; c.shadowBlur = 10;
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39, r = k * (60 + (i % 7) * 30);
      c.globalAlpha = 1 - k;
      c.fillRect(VW / 2 + Math.cos(a) * r, y - 120 + Math.sin(a) * r - k * 60, 6, 6);
    }
    c.restore();
    if (t > 0.4) text(c, 'GLITCH DELETED', VW / 2, 200, 16, '#ff2d55', 'center', 14);
    return;
  }
  const t2 = t - 2.2;
  // pellets rain down onto the street
  c.save(); c.fillStyle = '#ffe9c4'; c.shadowColor = '#ffd9a0'; c.shadowBlur = 8;
  for (let i = 0; i < 24; i++) {
    const px = 40 + i * 26, py = Math.min(y, -20 + (t2 * 260 - i * 18));
    if (px < 60 + t2 * 70) continue; // Pac has eaten these
    c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  // Pac chomps along, the ghosts follow, not scared, just happy
  const px = Math.min(VW - 120, 40 + t2 * 70);
  const party = t2 > 5.5;
  drawPac(c, px, y + (party ? hop(t2 % 0.6, 0, 12, 0.6) : 0), 18, RIGHT, 0.04 + 0.26 * Math.abs(Math.sin(t * 12)), '#ffe600');
  const cols = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
  cols.forEach((col, i) => {
    const gx = px - 60 - i * 44;
    if (gx < -30) return;
    drawGhost(c, gx, y + (party ? hop((t2 + i * 0.15) % 0.6, 0, 12, 0.6) : Math.sin(t * 5 + i) * 3), 16, col, RIGHT, { t: t + i });
  });
  if (party) {
    c.save();
    for (let i = 0; i < 30; i++) {
      c.fillStyle = ['#ff2d55', '#ffe600', '#5ce1ff', '#b45cff', '#5cff8a'][i % 5];
      c.fillRect((i * 97 + t * 40) % VW, ((i * 53 + t * 140) % (y - 40)), 5, 8);
    }
    c.restore();
  }
  if (t2 > 1) text(c, 'THE GLITCH IS GONE.', VW / 2, 200, 16, '#5cff8a', 'center', 14);
  if (t2 > 3) text(c, '...FOR REAL THIS TIME.', VW / 2, 240, 11, '#ffe600', 'center', 10);
  if (t2 > 6.5) text(c, 'THE END', VW / 2, 320, 30, Math.floor(t * 2) % 2 ? '#ffe600' : '#ff2df0', 'center', 20);
}

const CREDITS: [string, string][] = [
  ['NEON CHOMP', ''],
  ['A PAC-MAN ROGUELITE REMIX', ''],
  ['', ''],
  ['GAME DESIGN & PLAYTESTING', 'ADUBRY75'],
  ['SENIOR CODE REVIEWER', 'THE CAT'],
  ['CODE, ART & SOUND', 'CLAUDE'],
  ['', ''],
  ['STARRING', 'PAC'],
  ['AND', 'EVIL PAC'],
  ['WITH', 'THE GHOSTS, WHO ARE FINE NOW'],
  ['', ''],
  ['NO GHOSTS WERE HARMED', '(THEY RESPAWN)'],
  ['', ''],
  ['THANKS FOR PLAYING!', ''],
];

/** Scrolling credits, with Pac and the ghosts chasing across the bottom. */
export function credits(c: Ctx, t: number) {
  const top = VH - 100 - t * 88;
  c.save(); c.beginPath(); c.rect(0, 0, VW, VH - 120); c.clip();
  CREDITS.forEach(([a, b], i) => {
    const y = top + i * 64;
    if (y < -40 || y > VH + 40) return;
    const big = i === 0 || i === CREDITS.length - 1;
    text(c, a, VW / 2, y, big ? 20 : 9, big ? '#ffe600' : '#8fa0ff', 'center', big ? 14 : 4);
    if (b) text(c, b, VW / 2, y + 22, 12, '#fff', 'center', 8);
  });
  c.restore();
  const px = ((t * 120) % (VW + 300)) - 100, y = VH - 80;
  drawPac(c, px, y, 12, RIGHT, 0.04 + 0.26 * Math.abs(Math.sin(t * 12)), '#ffe600');
  ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'].forEach((col, i) => drawGhost(c, px - 40 - i * 30, y, 11, col, RIGHT, { t: t + i }));
}
