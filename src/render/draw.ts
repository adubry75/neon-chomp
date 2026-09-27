import type { FruitId } from '../data/fruits';
import { FRUITS } from '../data/fruits';
import { DOWN, LEFT, RIGHT, UP, type Dir } from '../sim/types';

export const T = 24; // logical pixels per tile
export const FONT = '"Press Start 2P", ui-monospace, monospace';

export type Ctx = CanvasRenderingContext2D;

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', glow = 10) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Word-wrapped text. Returns height used. */
export function wrapText(ctx: Ctx, s: string, x: number, y: number, maxW: number, size: number, color: string, lineH = size * 1.6, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  ctx.restore();
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, size, color, align, 0));
  return lines.length * lineH;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, fill = 'rgba(8,4,24,0.88)', lw = 2) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = fill; ctx.fill();
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
}

export const dirAngle = (d: Dir) => (d === RIGHT ? 0 : d === DOWN ? Math.PI / 2 : d === LEFT ? Math.PI : d === UP ? -Math.PI / 2 : Math.PI);

export function drawPac(ctx: Ctx, x: number, y: number, r: number, dir: Dir, mouth: number, color: string, glow = 16, alpha = 1) {
  const open = mouth; // 0..1 fraction of PI
  const a = dirAngle(dir);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y); ctx.rotate(a);
  ctx.shadowColor = color; ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (open >= 0.999) { ctx.restore(); return; }
  ctx.moveTo(-r * 0.15, 0);
  ctx.arc(0, 0, r, open * Math.PI, -open * Math.PI + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  // tiny highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.45, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Evil Pac: a dark Pac with a glowing rim and one red eye. */
export function drawShadowPac(ctx: Ctx, x: number, y: number, r: number, dir: Dir, mouth: number, rim = '#b45cff', fill = '#1a0830', eye = '#ff2d55', alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (dir === LEFT) ctx.scale(-1, 1);
  else if (dir === UP) ctx.rotate(-Math.PI / 2);
  else if (dir === DOWN) ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, 0);
  ctx.arc(0, 0, r, mouth * Math.PI, -mouth * Math.PI + Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.shadowColor = rim; ctx.shadowBlur = 12; ctx.stroke();
  ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.5, Math.max(2, r * 0.17), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export interface GhostLook {
  fright?: boolean; flash?: boolean; frozen?: boolean; eyesOnly?: boolean; stunned?: boolean;
  elite?: 'speedy' | 'shielded' | 'splitter' | null; shield?: number; king?: boolean; t: number; alpha?: number; sleeping?: boolean;
}

export function drawGhost(ctx: Ctx, x: number, y: number, r: number, color: string, dir: Dir, look: GhostLook) {
  const t = look.t;
  ctx.save();
  ctx.globalAlpha = look.alpha ?? 1;
  ctx.translate(x, y);
  if (!look.eyesOnly) {
    let body = color;
    if (look.fright) body = look.flash ? '#f4f4ff' : '#2a3bff';
    if (look.frozen) body = '#aef6ff';
    ctx.shadowColor = body; ctx.shadowBlur = look.frozen ? 22 : 16;
    ctx.fillStyle = body;
    ctx.beginPath();
    const top = -r * 0.15;
    ctx.arc(0, top, r, Math.PI, 0);
    const bottom = r * 0.92;
    ctx.lineTo(r, bottom);
    const waves = 3, ph = look.frozen || look.sleeping ? 0 : t * 12;
    for (let i = 0; i < waves * 2; i++) {
      const x0 = r - (i / (waves * 2)) * 2 * r;
      const x1 = r - ((i + 1) / (waves * 2)) * 2 * r;
      const dy = (i % 2 === 0 ? -1 : 1) * r * 0.22 * (0.7 + 0.3 * Math.sin(ph + i));
      ctx.quadraticCurveTo((x0 + x1) / 2, bottom + dy, x1, bottom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    if (look.frozen) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.6); ctx.lineTo(-r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.3, r * 0.4);
      ctx.moveTo(r * 0.3, -r * 0.7); ctx.lineTo(r * 0.5, 0); ctx.stroke();
    }
    if (look.elite === 'splitter') {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.12, -r * 0.5); ctx.lineTo(-r * 0.1, 0); ctx.lineTo(r * 0.08, r * 0.8); ctx.stroke();
    }
  }
  // face
  if (look.fright && !look.eyesOnly && !look.frozen) {
    ctx.fillStyle = look.flash ? '#ff2d55' : '#ffd0e0';
    ctx.fillRect(-r * 0.42, -r * 0.35, r * 0.24, r * 0.24);
    ctx.fillRect(r * 0.18, -r * 0.35, r * 0.24, r * 0.24);
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const px = -r * 0.6 + i * r * 0.2, py = r * 0.3 + (i % 2 ? -r * 0.12 : r * 0.05); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  } else if (look.sleeping) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.2); ctx.lineTo(-r * 0.15, -r * 0.2); ctx.moveTo(r * 0.15, -r * 0.2); ctx.lineTo(r * 0.55, -r * 0.2); ctx.stroke();
  } else {
    const ex = r * 0.38, ey = -r * 0.2;
    const px = dir === LEFT ? -1 : dir === RIGHT ? 1 : 0, py = dir === UP ? -1 : dir === DOWN ? 1 : 0;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(s * ex + px * r * 0.08, ey + py * r * 0.08, r * 0.27, r * 0.33, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = look.frozen ? '#3d8bff' : '#1a2bff';
      ctx.beginPath(); ctx.arc(s * ex + px * r * 0.18, ey + py * r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    if (look.king || look.elite === 'speedy') {
      // angry brows
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.62); ctx.lineTo(-r * 0.18, -r * 0.45); ctx.moveTo(r * 0.62, -r * 0.62); ctx.lineTo(r * 0.18, -r * 0.45); ctx.stroke();
    }
  }
  if (look.king) {
    ctx.fillStyle = '#ffd23d'; ctx.shadowColor = '#ffd23d'; ctx.shadowBlur = 12;
    ctx.beginPath();
    const cy = -r * 1.15;
    ctx.moveTo(-r * 0.6, cy + r * 0.35); ctx.lineTo(-r * 0.6, cy - r * 0.1); ctx.lineTo(-r * 0.3, cy + r * 0.12);
    ctx.lineTo(0, cy - r * 0.3); ctx.lineTo(r * 0.3, cy + r * 0.12); ctx.lineTo(r * 0.6, cy - r * 0.1); ctx.lineTo(r * 0.6, cy + r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (look.elite === 'shielded' && (look.shield ?? 0) > 0) {
    ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 2; ctx.shadowColor = '#7fd8ff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + t; const px = Math.cos(a) * r * 1.35, py = Math.sin(a) * r * 1.35; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  if (look.stunned) {
    ctx.fillStyle = '#ffe45c';
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3;
      star(ctx, Math.cos(a) * r * 0.9, -r * 1.2 + Math.sin(a) * r * 0.25, r * 0.22);
    }
  }
  ctx.restore();
}

export function star(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

export function drawFruit(ctx: Ctx, id: FruitId, x: number, y: number, s: number, t = 0) {
  const f = FRUITS[id];
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = f.color; ctx.shadowBlur = 14;
  ctx.fillStyle = f.color;
  ctx.strokeStyle = f.leaf; ctx.lineWidth = Math.max(1.5, s * 0.1);
  const circ = (cx: number, cy: number, r: number, col = f.color) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
  const leaf = (cx: number, cy: number, w: number, a = -0.6) => {
    ctx.save(); ctx.fillStyle = f.leaf; ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  switch (id) {
    case 'cherry':
      ctx.beginPath(); ctx.moveTo(-s * 0.35, s * 0.1); ctx.quadraticCurveTo(-s * 0.1, -s * 0.5, s * 0.25, -s * 0.6);
      ctx.moveTo(s * 0.3, s * 0.2); ctx.quadraticCurveTo(s * 0.3, -s * 0.3, s * 0.25, -s * 0.6); ctx.stroke();
      circ(-s * 0.35, s * 0.3, s * 0.3); circ(s * 0.3, s * 0.38, s * 0.3);
      break;
    case 'strawberry':
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.25); ctx.quadraticCurveTo(0, -s * 0.55, s * 0.5, -s * 0.25);
      ctx.quadraticCurveTo(s * 0.4, s * 0.45, 0, s * 0.6); ctx.quadraticCurveTo(-s * 0.4, s * 0.45, -s * 0.5, -s * 0.25); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff6a0';
      for (const [a, b] of [[-0.2, 0], [0.2, 0.05], [0, 0.3], [-0.25, 0.25], [0.22, 0.28], [0, -0.15]]) ctx.fillRect(a * s, b * s, s * 0.07, s * 0.1);
      leaf(-s * 0.15, -s * 0.42, s * 0.2, -0.3); leaf(s * 0.15, -s * 0.42, s * 0.2, 0.3);
      break;
    case 'orange':
      circ(0, s * 0.05, s * 0.52);
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.12, s * 0.12, 0, Math.PI * 2); ctx.fill();
      leaf(s * 0.18, -s * 0.5, s * 0.22);
      break;
    case 'apple':
      circ(-s * 0.2, s * 0.08, s * 0.42); circ(s * 0.2, s * 0.08, s * 0.42);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 0.05, -s * 0.6); ctx.strokeStyle = '#8a5a2b'; ctx.stroke();
      leaf(s * 0.22, -s * 0.52, s * 0.18);
      break;
    case 'melon':
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.58, s * 0.48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#1c8f3c'; ctx.lineWidth = s * 0.08;
      for (const k of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.ellipse(k * s, 0, s * 0.08, s * 0.44, 0, 0, Math.PI * 2); ctx.stroke(); }
      break;
    case 'bell': {
      const sw = Math.sin(t * 8) * 0.15;
      ctx.rotate(sw);
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.35); ctx.quadraticCurveTo(-s * 0.45, -s * 0.55, 0, -s * 0.55);
      ctx.quadraticCurveTo(s * 0.45, -s * 0.55, s * 0.5, s * 0.35); ctx.closePath(); ctx.fill();
      circ(0, s * 0.45, s * 0.14, '#5ce1ff');
      break;
    }
    case 'key':
      ctx.lineWidth = s * 0.16; ctx.strokeStyle = f.color;
      ctx.beginPath(); ctx.arc(-s * 0.25, -s * 0.2, s * 0.25, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.08, 0); ctx.lineTo(s * 0.5, s * 0.5); ctx.moveTo(s * 0.3, s * 0.3); ctx.lineTo(s * 0.45, s * 0.15);
      ctx.moveTo(s * 0.45, s * 0.45); ctx.lineTo(s * 0.6, s * 0.3); ctx.stroke();
      break;
    case 'pineapple':
      ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.36, s * 0.46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#a8761a'; ctx.lineWidth = 1.2;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath(); ctx.moveTo(k * s * 0.18 - s * 0.3, -s * 0.2); ctx.lineTo(k * s * 0.18 + s * 0.3, s * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(k * s * 0.18 + s * 0.3, -s * 0.2); ctx.lineTo(k * s * 0.18 - s * 0.3, s * 0.55); ctx.stroke();
      }
      for (const a of [-0.5, 0, 0.5]) leaf(a * s * 0.3, -s * 0.45, s * 0.22, a * 2 - Math.PI / 2);
      break;
    case 'banana':
      ctx.lineWidth = s * 0.28; ctx.lineCap = 'round'; ctx.strokeStyle = f.color;
      ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.6, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
      ctx.lineWidth = s * 0.1; ctx.strokeStyle = '#8a6d1c';
      ctx.beginPath(); ctx.moveTo(s * 0.48, 0); ctx.lineTo(s * 0.58, -s * 0.12); ctx.stroke();
      break;
    case 'grapes':
      for (const [a, b] of [[-0.3, -0.2], [0, -0.2], [0.3, -0.2], [-0.15, 0.08], [0.15, 0.08], [0, 0.35]]) circ(a * s, b * s, s * 0.17);
      leaf(s * 0.1, -s * 0.5, s * 0.2);
      break;
    case 'chili':
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.3);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.4, s * 0.45, s * 0.55);
      ctx.quadraticCurveTo(-s * 0.05, s * 0.05, -s * 0.45, -s * 0.05); ctx.closePath(); ctx.fill();
      leaf(-s * 0.5, -s * 0.2, s * 0.16, 1.2);
      break;
    case 'rainbow': {
      const cols = ['#ff2d55', '#ff9a1f', '#ffe45c', '#5cff8a', '#5ce1ff', '#b45cff'];
      cols.forEach((c, i) => { ctx.shadowColor = c; circ(0, 0, s * (0.6 - i * 0.09), c); });
      ctx.shadowBlur = 0; circ(0, 0, s * 0.08, '#fff');
      ctx.rotate(t * 2); ctx.fillStyle = '#fff'; star(ctx, s * 0.55, 0, s * 0.14);
      break;
    }
  }
  ctx.restore();
}
