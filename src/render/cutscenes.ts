import { ACTS, ACT_COLORS } from '../game/run';
import { LEFT, RIGHT } from '../sim/types';
import { drawGhost, drawPac, text, type Ctx } from './draw';
import { VH, VW } from './renderer';

/** Act title cards, the two between-act chase gags, and the ending. */
export type CutsceneId = 'title0' | 'title1' | 'title2' | 'gag1' | 'gag2' | 'ending';

export const CUTSCENE_LEN: Record<CutsceneId, number> = {
  title0: 2.8, title1: 2.8, title2: 2.8, gag1: 8.2, gag2: 9, ending: 9,
};

const GHOST_COLORS = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
const chomp = (t: number) => 0.04 + 0.26 * Math.abs(Math.sin(t * 14));

/** Draw cutscene `id` at `t` seconds in. Pure function of time. */
export function drawCutscene(c: Ctx, id: CutsceneId, t: number) {
  switch (id) {
    case 'title0': case 'title1': case 'title2': titleCard(c, +id.slice(5), t); break;
    case 'gag1': gagChase(c, t); break;
    case 'gag2': gagTrain(c, t); break;
    case 'ending': ending(c, t); break;
  }
  if (t > 0.3 && !id.startsWith('title')) text(c, 'ANY KEY TO SKIP', VW / 2, VH - 30, 7, '#5a5290', 'center', 0);
}

function titleCard(c: Ctx, act: number, t: number) {
  const [head, name] = ACTS[act].split(' · ');
  const color = ACT_COLORS[act];
  const len = CUTSCENE_LEN.title0;
  const fade = Math.min(1, t / 0.25, (len - t) / 0.3);
  // wipe-in bar
  const wipe = Math.min(1, t / 0.5);
  c.save();
  c.globalAlpha = Math.max(0, fade);
  c.fillStyle = color;
  c.shadowColor = color; c.shadowBlur = 16;
  const bw = VW * 0.7 * wipe;
  c.fillRect(VW / 2 - bw / 2, VH / 2 - 78, bw, 3);
  c.fillRect(VW / 2 - bw / 2, VH / 2 + 62, bw, 3);
  c.restore();
  c.save();
  c.globalAlpha = Math.max(0, fade) * Math.min(1, Math.max(0, (t - 0.3) / 0.3));
  text(c, head, VW / 2, VH / 2 - 26, 40, '#ffe600', 'center', 24);
  text(c, name, VW / 2, VH / 2 + 30, 18, color, 'center', 14);
  c.restore();
}

/** Blinky chases Pac off screen; a giant Pac chases a blue Blinky back. */
function gagChase(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  text(c, 'INTERMISSION', VW / 2, 140, 10, '#8f86c9', 'center', 0);
  floor(c, y + 30);
  if (t < 4) {
    const px = VW + 40 - t * 250;
    drawPac(c, px, y, 16, LEFT, chomp(t), '#ffe600');
    drawGhost(c, px + 90, y, 16, GHOST_COLORS[0], LEFT, { t });
  } else if (t >= 4.3) {
    const k = t - 4.3;
    const bx = -40 + k * 260;
    const px = bx - 230;
    drawGhost(c, bx, y, 16, '#2d2dff', RIGHT, { t, fright: true, flash: Math.floor(t * 6) % 2 === 0 });
    drawPac(c, px, y - 60, 80, RIGHT, chomp(t * 0.7), '#ffe600', 30);
  }
}

/** The ghost train rolls by with an empty car; Pac hops on; then the maze glitches. */
function gagTrain(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  const stopX = VW * 0.62;
  const gap = 42, cars = 6, empty = 3, speed = 190;
  const head = -40 + t * speed;
  text(c, 'INTERMISSION', VW / 2, 140, 10, '#8f86c9', 'center', 0);
  floor(c, y + 30);
  // rails
  c.save(); c.strokeStyle = '#5a5290'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, y + 22); c.lineTo(VW, y + 22); c.stroke(); c.restore();
  const emptyX = head - (empty + 1) * gap;
  const boarded = emptyX >= stopX;
  // cars (the king leads)
  drawGhost(c, head, y, 18, '#ffd23d', RIGHT, { t, king: true });
  for (let i = 0; i < cars; i++) {
    const x = head - (i + 1) * gap;
    if (i === empty) {
      c.save(); c.strokeStyle = '#8f86c9'; c.setLineDash([4, 4]); c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.stroke(); c.restore();
    } else drawGhost(c, x, y, 14, GHOST_COLORS[i % 4], RIGHT, { t: t + i });
  }
  // Pac waits, bounces, then rides in the empty car
  if (!boarded) {
    const wait = emptyX > stopX - 120;
    drawPac(c, stopX, y - (wait ? Math.abs(Math.sin(t * 10)) * 18 : 0), 13, LEFT, chomp(t), '#ffe600');
  } else drawPac(c, emptyX, y, 13, RIGHT, chomp(t), '#ffe600');
  // glitch and rising void once the train is gone
  if (t > 5.6) {
    const k = Math.min(1, (t - 5.6) / 3);
    c.save();
    for (let i = 0; i < 6; i++) {
      c.globalAlpha = 0.35 * Math.random();
      c.fillStyle = ['#ff2d55', '#2de2ff', '#b45cff'][i % 3];
      c.fillRect(0, Math.random() * VH, VW, 2 + Math.random() * 10);
    }
    c.restore();
    const top = VH - k * VH * 0.45;
    c.save();
    c.fillStyle = '#12001f'; c.strokeStyle = '#b45cff'; c.lineWidth = 3; c.shadowColor = '#b45cff'; c.shadowBlur = 18;
    c.beginPath(); c.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 12) c.lineTo(x, top + Math.sin(x * 0.04 + t * 6) * 8);
    c.lineTo(VW, VH); c.closePath(); c.fill(); c.stroke();
    c.restore();
    if (t > 6.6) text(c, 'SOMETHING IS EATING THE MAZE...', VW / 2, 220, 10, '#e0b0ff', 'center', 8);
  }
}

/** The void collapses; the ghosts wave a white flag. */
function ending(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  if (t < 2.6) {
    const r = 340 * (1 - t / 2.6);
    c.save(); c.fillStyle = '#12001f'; c.strokeStyle = '#b45cff'; c.lineWidth = 4; c.shadowColor = '#b45cff'; c.shadowBlur = 24;
    c.beginPath(); c.arc(VW / 2, VH / 2, Math.max(0, r), 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
    return;
  }
  if (t < 2.9) { c.save(); c.globalAlpha = (2.9 - t) / 0.3; c.fillStyle = '#fff'; c.fillRect(0, 0, VW, VH); c.restore(); }
  floor(c, y + 30);
  GHOST_COLORS.forEach((col, i) => {
    const gx = VW / 2 + 40 + i * 44;
    drawGhost(c, gx, y + Math.sin(t * 4 + i) * 3, 16, col, LEFT, { t: t + i });
  });
  // Blinky's white flag
  const fx = VW / 2 + 40, wave = Math.sin(t * 6) * 6;
  c.save(); c.strokeStyle = '#ccc'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(fx - 10, y - 4); c.lineTo(fx - 18, y - 60); c.stroke();
  c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 8;
  c.beginPath(); c.moveTo(fx - 18, y - 60); c.quadraticCurveTo(fx - 4, y - 66 + wave, fx + 12, y - 58); c.lineTo(fx + 12, y - 40); c.quadraticCurveTo(fx - 4, y - 46 + wave, fx - 18, y - 42); c.closePath(); c.fill();
  c.restore();
  const px = Math.min(VW / 2 - 60, -40 + (t - 3) * 260);
  drawPac(c, px, y, 18, RIGHT, px < VW / 2 - 60 ? chomp(t) : 0.2, '#ffe600');
  if (t > 5.5) text(c, 'THE END?', VW / 2, 240, 30, Math.floor(t * 2) % 2 ? '#ffe600' : '#ff2df0', 'center', 20);
}

function floor(c: Ctx, y: number) {
  c.save(); c.strokeStyle = '#2d7bff'; c.globalAlpha = 0.5; c.lineWidth = 2; c.shadowColor = '#2d7bff'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(0, y); c.lineTo(VW, y); c.stroke(); c.restore();
}
