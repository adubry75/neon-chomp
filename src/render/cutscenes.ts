import { ACTS, ACT_COLORS } from '../game/run';
import { LEFT, RIGHT } from '../sim/types';
import { drawGhost, drawPac, text, type Ctx } from './draw';
import { VH, VW } from './renderer';
import { gagR1, gagR2, gagR3, sting } from './cutscenesGP';

/** The opening gag, act title cards, the two between-act chase gags, and the ending. */
export type CutsceneId = 'intro' | 'title0' | 'title1' | 'title2' | 'title3' | 'gag1' | 'gag2' | 'ending' | 'sting' | 'gagR1' | 'gagR2' | 'gagR3';

export const CUTSCENE_LEN: Record<CutsceneId, number> = {
  intro: 6.8, title0: 2.8, title1: 2.8, title2: 2.8, title3: 2.8, gag1: 8.2, gag2: 9, ending: 9, sting: 5.2, gagR1: 7.4, gagR2: 9, gagR3: 6.8,
};

const GHOST_COLORS = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
const chomp = (t: number) => 0.04 + 0.26 * Math.abs(Math.sin(t * 14));

/** Draw cutscene `id` at `t` seconds in. Pure function of time. */
export function drawCutscene(c: Ctx, id: CutsceneId, t: number) {
  switch (id) {
    case 'title0': case 'title1': case 'title2': case 'title3': titleCard(c, +id.slice(5), t); break;
    case 'intro': gagWakeUp(c, t); break;
    case 'gag1': gagChase(c, t); break;
    case 'gag2': gagTrain(c, t); break;
    case 'ending': ending(c, t); break;
    case 'sting': sting(c, t); break;
    case 'gagR1': gagR1(c, t); break;
    case 'gagR2': gagR2(c, t); break;
    case 'gagR3': gagR3(c, t); break;
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

/** Opening: Pac naps, gets bonked by a pellet, chomps a trail, powers up and scares off the ghosts. */
function gagWakeUp(c: Ctx, t: number) {
  const y = VH / 2 + 40;
  const sleepX = 90, trail0 = 160, trailStep = 40, trailN = 7;
  const powerX = trail0 + trailN * trailStep;
  floor(c, y + 30);
  // Pac: asleep until the bonk, then chomps along the trail and on past the power pellet
  const wake = 1.9, go = 2.5, speed = 170;
  const px = t < go ? sleepX : sleepX + (t - go) * speed;
  const hop = t >= go ? -Math.abs(Math.sin((t - go) * 9)) * 5 : 0;
  // pellets vanish once Pac reaches them
  if (t > 2.1) {
    for (let i = 0; i < trailN; i++) {
      const x = trail0 + i * trailStep;
      if (x < px + 4 || t < 2.1 + i * 0.06) continue;
      c.save(); c.fillStyle = '#ffe9b0'; c.shadowColor = '#fff'; c.shadowBlur = 8;
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
  const powered = px >= powerX;
  if (!powered && t > 2.1) {
    const r = 10 + Math.sin(t * 8) * 1.5;
    c.save(); c.fillStyle = '#fff4e0'; c.shadowColor = '#fff'; c.shadowBlur = 16;
    c.beginPath(); c.arc(powerX, y, r, 0, Math.PI * 2); c.fill(); c.restore();
  }
  // the bonk pellet bounces in from the right and lands on Pac's head
  if (t > 0.9 && t < wake) {
    const k = (t - 0.9) / (wake - 0.9);
    const bx = VW + 20 - k * (VW + 20 - sleepX);
    const by = y - 20 - Math.abs(Math.sin(k * Math.PI * 3)) * 90 * (1 - k * 0.6);
    c.save(); c.fillStyle = '#ffe9b0'; c.shadowColor = '#fff'; c.shadowBlur = 8;
    c.beginPath(); c.arc(bx, by, 4, 0, Math.PI * 2); c.fill(); c.restore();
  }
  if (t < wake) {
    drawPac(c, sleepX, y + Math.sin(t * 2) * 1.5, 16, RIGHT, 0, '#ffe600', 10);
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.6 + i / 3) % 1);
      c.save(); c.globalAlpha = 1 - k;
      text(c, i % 2 ? 'Z' : 'z', sleepX + 14 + k * 26 + i * 4, y - 24 - k * 50, 8 + i * 3, '#8fa0ff', 'center', 0);
      c.restore();
    }
  } else {
    if (t < go + 0.2) text(c, '!', sleepX, y - 42 - Math.min(1, (t - wake) * 8) * 6, 20, '#ff2d55', 'center', 10);
    drawPac(c, px, y + hop, 16, RIGHT, t < go ? 0.2 : chomp(t), '#ffe600');
  }
  // the ghosts peek in from the right and creep toward Pac, then flee once he powers up
  const peek = Math.min(1, Math.max(0, (t - 3.2) / 0.6));
  const poweredAt = go + (powerX - sleepX) / speed;
  const creep = Math.max(0, Math.min(t, poweredAt) - 3.8) * 40;
  GHOST_COLORS.forEach((col, i) => {
    const baseX = VW + 30 - peek * (90 + i * 30) - creep;
    const flee = powered ? (t - poweredAt) * 190 : 0;
    const gy = y + Math.sin(t * 5 + i) * 3;
    if (powered) drawGhost(c, baseX + flee, gy, 16, '#2d2dff', RIGHT, { t: t + i, fright: true, flash: Math.floor(t * 8) % 2 === 0 });
    else drawGhost(c, baseX, gy, 16, col, LEFT, { t: t + i });
  });
  if (powered && t - poweredAt < 0.25) { c.save(); c.globalAlpha = 0.3 * (1 - (t - poweredAt) / 0.25); c.fillStyle = '#5c7bff'; c.fillRect(0, 0, VW, VH); c.restore(); }
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
