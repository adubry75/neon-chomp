import { DOWN, LEFT, RIGHT, UP } from '../sim/types';
import { drawPac, drawShadowPac, text, type Ctx } from './draw';
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
