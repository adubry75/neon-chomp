import { LEFT, RIGHT } from '../sim/types';
import { drawPac, text, type Ctx } from './draw';
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
  if (t > 2.6) shadowPac(c, Math.min(VW / 2 + 90, VW / 2 + (t - 2.6) * 160), y, t);
  const turned = t > 3;
  drawPac(c, VW / 2 - (t > 2.6 ? 40 : 0), y, 18, turned ? RIGHT : LEFT, turned ? 0.35 : 0.04 + 0.26 * Math.abs(Math.sin(t * 3)), '#ffe600');

  if (t > 1.8 && t < 2.6) glitchBars(c, t, y);
  if (t > 3.2) text(c, '...OR IS IT?', VW / 2, 240, 18, Math.floor(t * 3) % 2 ? '#ff2d55' : '#b45cff', 'center', 16);
  if (t > 4) text(c, 'REINCARNATION UNLOCKED', VW / 2, 300, 11, '#5ce1ff', 'center', 10);
}

function shadowPac(c: Ctx, x: number, y: number, t: number) {
  const r = 18, open = 0.18 + 0.04 * Math.sin(t * 20);
  c.save();
  c.translate(x, y); c.rotate(Math.PI); // faces left, towards Pac
  c.beginPath();
  c.moveTo(-r * 0.15, 0);
  c.arc(0, 0, r, open * Math.PI, -open * Math.PI + Math.PI * 2);
  c.closePath();
  c.fillStyle = '#1a0830'; c.fill();
  c.strokeStyle = '#b45cff'; c.lineWidth = 2; c.shadowColor = '#b45cff'; c.shadowBlur = 12; c.stroke();
  c.restore();
  c.save();
  c.fillStyle = '#ff2d55'; c.shadowColor = '#ff2d55'; c.shadowBlur = 10;
  c.beginPath(); c.arc(x - 3, y - 9, 3, 0, Math.PI * 2); c.fill();
  c.restore();
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
