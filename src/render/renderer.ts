import { I_COIN, I_CORE, I_PELLET, I_POWER, T_DOOR, type Maze } from '../sim/maze';
import type { World } from '../sim/world';
import type { GameEvent, Pac } from '../sim/entities';
import { FRUITS, type FruitId } from '../data/fruits';
import { MODIFIERS } from '../sim/modifiers';
import { DOWN, LEFT, RIGHT, UP, NONE } from '../sim/types';
import { T, drawFruit, drawGhost, drawPac, panel, star, text, type Ctx } from './draw';

export const VW = 28 * T;           // 672
export const HUD_TOP = 3 * T;       // 72
export const VH = 36 * T;           // 864
const MAZE_H = 31 * T;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: 'dot' | 'spark' | 'ring' | 'square' | 'star'; grav: number }
interface Popup { x: number; y: number; text: string; color: string; life: number; max: number; size: number }

export interface HudInfo {
  mode: 'run' | 'royale' | 'squad';
  best: number;
  stageLabel: string;
  coins: number;
  wallColor: string;
  bannerTitle: string;
  bannerSub: string;
  playerNames: string[];
  squadGhostScores?: Record<number, number>;
  showControlsHint?: boolean;
  /** Intro card is waiting for a key press. */
  introHold?: boolean;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  scale = 1;
  dpr = 1;
  time = 0;
  private layerKey: Maze | null = null;
  private layerColor = '';
  private wallLayer: HTMLCanvasElement | null = null;
  private wallGlow: HTMLCanvasElement | null = null;
  private pelletSprite: HTMLCanvasElement;
  private bloomCanvas = document.createElement('canvas');
  private darkCanvas = document.createElement('canvas');
  private scanlines: CanvasPattern | null = null;
  particles: Particle[] = [];
  popups: Popup[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#fff';
  mazeFlash = 0;
  settings = { bloom: 2, crt: false, shake: true };
  private trails = new Map<number, { x: number; y: number }[]>();
  private bgStars: { x: number; y: number; z: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.pelletSprite = this.makePellet();
    for (let i = 0; i < 70; i++) this.bgStars.push({ x: Math.random() * VW, y: Math.random() * VH, z: Math.random() });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    const cw = Math.floor(VW * this.scale), ch = Math.floor(VH * this.scale);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.canvas.width = Math.floor(cw * this.dpr);
    this.canvas.height = Math.floor(ch * this.dpr);
    this.bloomCanvas.width = Math.max(1, Math.floor(this.canvas.width / 3));
    this.bloomCanvas.height = Math.max(1, Math.floor(this.canvas.height / 3));
    this.darkCanvas.width = VW; this.darkCanvas.height = MAZE_H;
    const sl = document.createElement('canvas'); sl.width = 2; sl.height = 3;
    const sc = sl.getContext('2d')!; sc.fillStyle = 'rgba(0,0,0,0.28)'; sc.fillRect(0, 0, 2, 1);
    this.scanlines = this.ctx.createPattern(sl, 'repeat');
  }

  begin() {
    const c = this.ctx;
    c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
    // background
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#07031a'); g.addColorStop(1, '#0b0220');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    for (const s of this.bgStars) {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(this.time * (0.5 + s.z) + s.x));
      c.fillStyle = `rgba(160,140,255,${0.08 + 0.18 * tw * s.z})`;
      c.fillRect(s.x, (s.y + this.time * 6 * s.z) % VH, 2, 2);
    }
  }

  /** Bloom + CRT. Call after everything is drawn. */
  post() {
    const c = this.ctx;
    if (this.settings.bloom > 0) {
      const b = this.bloomCanvas.getContext('2d')!;
      b.globalCompositeOperation = 'copy';
      b.filter = `blur(${this.settings.bloom >= 2 ? 5 : 3}px)`;
      b.drawImage(this.canvas, 0, 0, this.bloomCanvas.width, this.bloomCanvas.height);
      b.filter = 'none';
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = this.settings.bloom >= 2 ? 0.55 : 0.32;
      c.drawImage(this.bloomCanvas, 0, 0, this.canvas.width, this.canvas.height);
      c.restore();
    }
    if (this.settings.crt && this.scanlines) {
      c.save();
      c.fillStyle = this.scanlines; c.fillRect(0, 0, VW, VH);
      const v = c.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = v; c.fillRect(0, 0, VW, VH);
      c.restore();
    }
  }

  // ───────────────────────── particles ─────────────────────────

  burst(x: number, y: number, color: string, n: number, speed: number, kind: Particle['kind'] = 'dot', life = 0.6, size = 3, grav = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, color, size, kind, grav });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }
  ring(x: number, y: number, color: string, size: number, life = 0.5) {
    this.particles.push({ x, y, vx: 0, vy: 0, life, max: life, color, size, kind: 'ring', grav: 0 });
  }
  popup(x: number, y: number, s: string, color: string, size = 12, life = 1) {
    this.popups.push({ x, y, text: s, color, life, max: life, size });
  }
  addShake(v: number) { if (this.settings.shake) this.shake = Math.max(this.shake, v); }

  handle(e: GameEvent) {
    const x = e.x ?? 14, y = e.y ?? 15;
    switch (e.t) {
      case 'pellet': if (Math.random() < 0.35) this.burst(x, y, '#ffe9b0', 2, 2.5, 'dot', 0.25, 2); break;
      case 'power': this.ring(x, y, '#ffffff', 5, 0.5); this.burst(x, y, '#fff', 14, 7, 'spark', 0.5); this.addShake(3); this.flash = 0.12; this.flashColor = '#5c7bff'; break;
      case 'eatGhost': {
        this.burst(x, y, e.c ?? '#fff', 26, 9, 'spark', 0.6, 3);
        this.ring(x, y, e.c ?? '#fff', 3, 0.4);
        this.popup(x, y, String(e.v), '#5ce1ff', 13, 1.1);
        const combo = +(e.s ?? 0);
        if (combo >= 3) this.popup(x, y - 1, `${combo}x COMBO!`, '#ffd23d', 11, 1.2);
        this.addShake(4 + Math.min(combo, 5));
        break;
      }
      case 'death': this.addShake(8); this.flash = 0.2; this.flashColor = '#ff2d55'; break;
      case 'down': this.burst(x, y, e.c ?? '#ff0', 20, 6, 'spark', 0.5); this.popup(x, y, 'DOWN!', '#ff2d55', 11); this.addShake(5); break;
      case 'fruit': {
        const f = FRUITS[e.s as FruitId];
        this.burst(x, y, f.color, 30, 8, 'star', 0.8, 5);
        this.ring(x, y, f.color, 4, 0.6);
        this.popup(x, y - 1.2, f.power + '!', f.color, 14, 1.4);
        this.flash = 0.15; this.flashColor = f.color; this.addShake(4);
        break;
      }
      case 'fruitPts': this.popup(x, y + 0.6, String(e.v), e.c ?? '#fff', 10, 1); break;
      case 'fruitSpawn': this.ring(x, y, '#fff', 2, 0.6); this.burst(x, y, '#fff', 10, 4, 'star', 0.6, 3); break;
      case 'extraLife': this.popup(14, 17.5, '1UP!', '#5cff8a', 18, 1.6); this.flash = 0.15; this.flashColor = '#5cff8a'; break;
      case 'coin': this.burst(x, y, '#ffd23d', 6, 4, 'square', 0.4, 2); break;
      case 'coinDrop': this.ring(x, y, '#ffd23d', 1, 0.4); break;
      case 'vault': this.popup(x, y - 1, 'VAULT OPEN!', '#7fd8ff', 13, 1.4); this.flash = 0.2; this.flashColor = '#ffd23d'; break;
      case 'shatter': this.burst(x, y, '#aef6ff', 30, 10, 'square', 0.7, 3, 12); this.popup(x, y, 'SHATTER ' + e.v, '#aef6ff', 10); this.addShake(4); break;
      case 'shock': this.ring(x, y, '#ffe45c', 20, 0.8); this.ring(x, y, '#5ce1ff', 14, 0.6); this.addShake(10); this.flash = 0.25; this.flashColor = '#ffe45c'; break;
      case 'dash': this.burst(x, y, e.c ?? '#fff', 16, 6, 'spark', 0.35); break;
      case 'slip': this.popup(x, y, 'SLIP!', '#fff05c', 10); this.burst(x, y, '#fff05c', 12, 6, 'star', 0.5, 3); break;
      case 'revive': this.ring(x, y, e.c ?? '#fff', 3, 0.6); this.popup(x, y, 'REVIVED!', '#5cff8a', 10); break;
      case 'respawn': this.ring(x, y, e.c ?? '#fff', 3, 0.6); break;
      case 'pvp': this.burst(x, y, e.c ?? '#fff', 40, 10, 'star', 0.8, 4); this.popup(x, y, 'CHOMPED! ' + e.v, e.c ?? '#fff', 12); this.addShake(9); break;
      case 'wake': this.popup(x, y - 0.6, '!', '#ff2d55', 14, 0.7); break;
      case 'burn': this.burst(x, y, '#ff6a1f', 26, 7, 'dot', 0.7, 4, -6); this.popup(x, y, 'TORCHED!', '#ff9a1f', 10); break;
      case 'bomb': this.ring(x, y, '#ff9a1f', 7, 0.6); this.burst(x, y, '#ffcf4d', 30, 9, 'spark', 0.5); this.addShake(6); break;
      case 'bossHit':
        this.burst(x, y, '#ff2d55', 60, 14, 'spark', 0.9, 4); this.ring(x, y, '#fff', 6, 0.5);
        this.popup(x, y - 2, 'HIT! ' + e.v, '#fff', 16, 1.3); this.addShake(14); this.flash = 0.3; this.flashColor = '#fff';
        break;
      case 'bossDown':
        for (let i = 0; i < 5; i++) this.burst(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, ['#ff2d55', '#ffd23d', '#5ce1ff', '#b45cff', '#fff'][i], 40, 14, 'star', 1.4, 5);
        this.popup(x, y - 2, 'BOSS DOWN!', '#ffd23d', 22, 2.2); this.addShake(20); this.flash = 0.5; this.flashColor = '#fff';
        break;
      case 'core': this.ring(x, y, '#e0b0ff', 10, 0.8); this.burst(x, y, '#e0b0ff', 40, 11, 'star', 1, 4); this.popup(x, y - 1, 'CORE! ' + e.v, '#e0b0ff', 13); this.addShake(10); this.flash = 0.3; this.flashColor = '#b45cff'; break;
      case 'coreSpawn': this.ring(x, y, '#e0b0ff', 4, 0.8); break;
      case 'clear': this.mazeFlash = 2.2; break;
      case 'teleport': this.burst(x, y, `hsl(${e.v},100%,65%)`, 14, 6, 'spark', 0.35); if (e.x2 !== undefined) this.burst(e.x2, e.y2!, `hsl(${e.v},100%,65%)`, 14, 6, 'spark', 0.35); break;
      case 'shield': this.ring(x, y, '#7fd8ff', 3, 0.6); this.popup(x, y, 'BLOCKED!', '#7fd8ff', 10); this.addShake(4); break;
      case 'shieldBreak': this.burst(x, y, '#7fd8ff', 24, 8, 'square', 0.5, 3); this.popup(x, y, 'SHIELD BROKEN', '#7fd8ff', 9); break;
      case 'splinter': case 'spawn': this.burst(x, y, e.c ?? '#fff', 12, 5, 'dot', 0.4); break;
      case 'pop': this.burst(x, y, e.c ?? '#fff', 10, 5, 'dot', 0.35); break;
      case 'trail': this.burst(x, y, '#ff2a55', 2, 1.5, 'star', 0.5, 3); break;
      case 'magnet': break;
      case 'trainBreak': this.popup(14, 11, 'TRAIN DERAILED!', '#ff8cf0', 11); break;
      case 'refill': this.popup(14, 17.5, 'REFILL!', '#fff', 14); break;
      case 'powerBack': this.ring(x, y, '#fff', 1.5, 0.5); break;
      case 'clank': this.burst(x, y, '#ffd23d', 5, 4, 'square', 0.3, 2); break;
    }
  }

  private updateFx(dt: number) {
    this.time += dt;
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
      if (p.kind !== 'ring') { p.vx *= 0.94; p.vy *= 0.94; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.popups) { p.life -= dt; p.y -= dt * 1.2; }
    this.popups = this.popups.filter(p => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt);
    this.mazeFlash = Math.max(0, this.mazeFlash - dt);
  }

  // ───────────────────────── maze layer ─────────────────────────

  private makePellet() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d')!;
    x.shadowColor = '#ffd9a0'; x.shadowBlur = 8; x.fillStyle = '#ffe9c4';
    x.beginPath(); x.arc(16, 16, 3.2, 0, Math.PI * 2); x.fill();
    return c;
  }

  private buildLayer(maze: Maze, color: string) {
    const R = 2, w = maze.w * T * R, h = maze.h * T * R, I = T * 0.3 * R, t = T * R;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const mask = mk(), mc = mask.getContext('2d')!;
    mc.fillStyle = '#fff';
    for (let y = 0; y < maze.h; y++) for (let x = 0; x < maze.w; x++) {
      if (!maze.isWallish(x, y)) continue;
      for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
        const hx = x + (qx ? 1 : -1), vy = y + (qy ? 1 : -1);
        const wH = maze.isWallish(hx, y), wV = maze.isWallish(x, vy), wD = maze.isWallish(hx, vy);
        let x0 = x * t + qx * t / 2, x1 = x0 + t / 2, y0 = y * t + qy * t / 2, y1 = y0 + t / 2;
        if (!wH) { if (qx) x1 -= I; else x0 += I; }
        if (!wV) { if (qy) y1 -= I; else y0 += I; }
        const ox = qx ? x1 : x0, oy = qy ? y1 : y0; // outer corner of the quad
        if (!wH && !wV) {
          const r = t * 0.32;
          mc.beginPath();
          const radii = [qx === 0 && qy === 0 ? r : 0, qx === 1 && qy === 0 ? r : 0, qx === 1 && qy === 1 ? r : 0, qx === 0 && qy === 1 ? r : 0];
          mc.roundRect(x0, y0, x1 - x0, y1 - y0, radii);
          mc.fill();
        } else {
          mc.fillRect(x0, y0, x1 - x0, y1 - y0);
          if (wH && wV && !wD) {
            mc.save(); mc.globalCompositeOperation = 'destination-out';
            mc.beginPath(); mc.arc(ox, oy, I, 0, Math.PI * 2); mc.fill(); mc.restore();
          }
        }
      }
    }
    // erode
    const k = 3.2 * R;
    const er = mk(), ec = er.getContext('2d')!;
    ec.drawImage(mask, 0, 0);
    ec.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k], [k * 0.7, k * 0.7], [-k * 0.7, k * 0.7], [k * 0.7, -k * 0.7], [-k * 0.7, -k * 0.7]]) ec.drawImage(mask, dx, dy);
    // outline = mask - eroded
    const ol = mk(), oc = ol.getContext('2d')!;
    oc.drawImage(mask, 0, 0);
    oc.globalCompositeOperation = 'destination-out'; oc.drawImage(er, 0, 0);
    oc.globalCompositeOperation = 'source-in'; oc.fillStyle = color; oc.fillRect(0, 0, w, h);
    // interior tint
    ec.globalCompositeOperation = 'source-in';
    const grad = ec.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, hexA(color, 0.16)); grad.addColorStop(1, hexA(color, 0.06));
    ec.fillStyle = grad; ec.fillRect(0, 0, w, h);
    // door
    const layer = mk(), lc = layer.getContext('2d')!;
    lc.drawImage(er, 0, 0);
    lc.drawImage(ol, 0, 0);
    for (let y = 0; y < maze.h; y++) for (let x = 0; x < maze.w; x++) {
      if (maze.terrainAt(x, y) === T_DOOR) { lc.fillStyle = '#ff8cf0'; lc.fillRect(x * t, y * t + t * 0.4, t, t * 0.2); }
    }
    const glow = mk(), gc = glow.getContext('2d')!;
    gc.filter = `blur(${7 * R}px)`;
    gc.drawImage(ol, 0, 0); gc.drawImage(ol, 0, 0);
    gc.filter = 'none';
    this.wallLayer = layer; this.wallGlow = glow;
  }

  // ───────────────────────── world ─────────────────────────

  drawWorld(w: World, hud: HudInfo, dt: number) {
    this.updateFx(dt);
    const c = this.ctx;
    if (this.layerKey !== w.pristine || this.layerColor !== hud.wallColor) {
      this.buildLayer(w.pristine, hud.wallColor);
      this.layerKey = w.pristine; this.layerColor = hud.wallColor;
    }
    c.save();
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    c.save();
    c.translate(0, HUD_TOP);
    this.drawMaze(w, hud);
    this.drawItems(w);
    this.drawActors(w);
    this.drawFx();
    if (w.has('blackout')) this.drawDarkness(w);
    if (w.voidY < Infinity) this.drawVoid(w);
    this.drawBanner(w, hud);
    c.restore();
    this.drawHud(w, hud);
    c.restore();
    if (this.flash > 0) {
      c.save(); c.globalAlpha = Math.min(0.45, this.flash * 1.8); c.fillStyle = this.flashColor; c.fillRect(0, 0, VW, VH); c.restore();
    }
  }

  private drawMaze(w: World, _hud: HudInfo) {
    const c = this.ctx;
    const flashOn = this.mazeFlash > 0 && Math.floor(this.mazeFlash * 5) % 2 === 0;
    c.save();
    if (flashOn) c.filter = 'brightness(3) saturate(0)';
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 2);
    c.globalAlpha = pulse;
    c.globalCompositeOperation = 'lighter';
    if (this.wallGlow) c.drawImage(this.wallGlow, 0, 0, VW, MAZE_H);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    if (this.wallLayer) c.drawImage(this.wallLayer, 0, 0, VW, MAZE_H);
    c.restore();

    // conveyors
    if (w.conveyor) {
      const m = w.maze;
      c.save();
      for (let i = 0; i < w.conveyor.length; i++) {
        const d = w.conveyor[i]; if (d < 0) continue;
        const x = (i % m.w) * T, y = ((i / m.w) | 0) * T;
        c.fillStyle = 'rgba(255,207,77,0.08)'; c.fillRect(x, y + 2, T, T - 4);
        c.strokeStyle = 'rgba(255,207,77,0.55)'; c.lineWidth = 2;
        const ph = (this.time * 1.6) % 1;
        c.save(); c.translate(x + T / 2, y + T / 2); c.rotate([-Math.PI / 2, Math.PI, Math.PI / 2, 0][d]);
        for (const o of [-0.5, 0]) {
          const px = (o + ph) * T;
          if (px < -T / 2 || px > T / 2) continue;
          c.beginPath(); c.moveTo(px - 4, -5); c.lineTo(px + 2, 0); c.lineTo(px - 4, 5); c.stroke();
        }
        c.restore();
      }
      c.restore();
    }
    // teleporters
    for (const tp of w.teleporters) {
      for (const p of [tp.a, tp.b]) {
        const x = p.x * T + T / 2, y = p.y * T + T / 2;
        c.save();
        c.strokeStyle = `hsl(${tp.hue},100%,65%)`; c.shadowColor = c.strokeStyle; c.shadowBlur = 14; c.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          const r = T * (0.25 + ((this.time * 0.8 + k * 0.5) % 1) * 0.35);
          c.globalAlpha = 1 - ((this.time * 0.8 + k * 0.5) % 1);
          c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); c.stroke();
        }
        c.restore();
      }
    }
    // gates
    for (const g of w.gates) {
      const x = g.tx * T, y = g.ty * T;
      c.save();
      if (!g.open) {
        c.fillStyle = '#ff6a3d'; c.shadowColor = '#ff6a3d'; c.shadowBlur = 16;
        c.fillRect(x + 3, y + 3, T - 6, T - 6);
        c.fillStyle = '#ffd0b0'; c.fillRect(x + 7, y + 7, T - 14, T - 14);
      } else {
        const warn = w.gateT < 1 && w.gates[0]?.open;
        c.strokeStyle = warn && Math.floor(this.time * 8) % 2 ? '#ff6a3d' : 'rgba(255,106,61,0.35)';
        c.setLineDash([3, 3]); c.lineWidth = 1.5; c.strokeRect(x + 3, y + 3, T - 6, T - 6);
      }
      c.restore();
    }
    // fire
    const m = w.maze;
    for (let i = 0; i < w.fire.length; i++) {
      const f = w.fire[i]; if (f <= 0) continue;
      const x = (i % m.w) * T + T / 2, y = ((i / m.w) | 0) * T + T / 2;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const a = Math.min(1, f / 1.2);
      const fl = 0.8 + 0.2 * Math.sin(this.time * 20 + i);
      const gr = c.createRadialGradient(x, y, 0, x, y, T * 0.95 * fl);
      gr.addColorStop(0, `rgba(255,235,150,${0.95 * a})`); gr.addColorStop(0.45, `rgba(255,110,20,${0.75 * a})`); gr.addColorStop(1, 'rgba(255,40,0,0)');
      c.fillStyle = gr; c.fillRect(x - T, y - T, T * 2, T * 2);
      c.restore();
      if (Math.random() < 0.25 * a) this.burst((i % m.w) + 0.5, ((i / m.w) | 0) + 0.5, '#ffb04d', 1, 1, 'dot', 0.5, 2, -3);
    }
  }

  private drawItems(w: World) {
    const c = this.ctx, m = w.maze;
    const pp = 0.7 + 0.3 * Math.sin(this.time * 8);
    for (let i = 0; i < m.items.length; i++) {
      const it = m.items[i]; if (!it) continue;
      const x = (i % m.w) * T + T / 2, y = ((i / m.w) | 0) * T + T / 2;
      if (it === I_PELLET) c.drawImage(this.pelletSprite, x - 16, y - 16);
      else if (it === I_POWER) {
        c.save(); c.fillStyle = '#fff4e0'; c.shadowColor = '#ffd9a0'; c.shadowBlur = 18 * pp;
        c.beginPath(); c.arc(x, y, 7 * (0.85 + 0.15 * pp), 0, Math.PI * 2); c.fill(); c.restore();
      } else if (it === I_COIN) {
        const sx = Math.abs(Math.cos(this.time * 4 + i));
        c.save(); c.fillStyle = '#ffd23d'; c.shadowColor = '#ffd23d'; c.shadowBlur = 10;
        c.beginPath(); c.ellipse(x, y, 6 * sx + 1, 6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff5b0'; c.fillRect(x - 1, y - 3, 2, 6); c.restore();
      } else if (it === I_CORE) {
        c.save(); c.translate(x, y); c.rotate(this.time * 2);
        c.fillStyle = '#f0d0ff'; c.shadowColor = '#b45cff'; c.shadowBlur = 30;
        const s = 10 + 3 * Math.sin(this.time * 6);
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.8, 0); c.lineTo(0, s); c.lineTo(-s * 0.8, 0); c.closePath(); c.fill();
        c.restore();
        c.save(); c.strokeStyle = 'rgba(224,176,255,0.6)'; c.lineWidth = 2;
        const r = T * (0.6 + ((this.time * 1.2) % 1) * 1.2);
        c.globalAlpha = 1 - ((this.time * 1.2) % 1); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    }
    for (const p of w.peels) {
      const x = p.tx * T + T / 2, y = p.ty * T + T / 2;
      c.save(); c.globalAlpha = Math.min(1, p.t); c.translate(x, y); c.scale(0.55, 0.55);
      drawFruit(c, 'banana', 0, 0, T * 0.9); c.restore();
    }
    if (w.fruit) {
      const f = w.fruit;
      const blink = f.t < 2.5 && Math.floor(f.t * 8) % 2 === 0;
      if (!blink) {
        const bob = Math.sin(this.time * 4) * 2;
        drawFruit(c, f.id, f.x * T, f.y * T + bob, T * 0.62, this.time);
      }
    }
  }

  private drawActors(w: World) {
    const c = this.ctx;
    const t = this.time;
    // dozers
    for (const d of w.dozers) {
      const bob = Math.sin(t * 2 + d.z) * 1.5;
      drawGhost(c, d.x * T, d.y * T + bob, T * 0.42, d.color, NONE, { t, sleeping: true, alpha: 0.75 });
      c.save(); c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + d.z);
      text(c, 'z', d.x * T + 10, d.y * T - 14 - ((t * 10 + d.z * 5) % 8), 8, '#fff', 'center', 0);
      c.restore();
    }
    const flashing = w.powerT > 0 && w.powerT < 2 && Math.floor(w.powerT * 5) % 2 === 0;
    // train cars
    for (const car of [...w.cars].reverse()) {
      if (!car.alive) continue;
      const fright = w.powerT > 0;
      drawGhost(c, car.x * T, car.y * T + Math.sin(car.wobble * 8) * 1.5, T * 0.44, car.color, NONE,
        { t: t + car.wobble, fright, flash: flashing, frozen: w.freezeT > 0 });
    }
    // ghosts
    for (const g of w.ghosts) {
      if (g.state === 'gone') continue;
      const r = T * (g.splinter ? 0.32 : 0.46);
      const eyesOnly = g.state === 'eyes' || g.state === 'entering';
      const frozen = w.freezeT > 0 && g.state === 'active';
      const fright = g.fright && !eyesOnly;
      const alpha = g.eatenFlash > 0 ? 0.4 + 0.6 * (Math.floor(g.eatenFlash * 10) % 2) : 1;
      if (g.elite === 'speedy' && g.state === 'active' && !frozen) {
        c.save(); c.globalAlpha = 0.25;
        const dx = g.dir === LEFT ? 1 : g.dir === RIGHT ? -1 : 0, dy = g.dir === UP ? 1 : g.dir === DOWN ? -1 : 0;
        for (let k = 1; k <= 3; k++) drawGhost(c, (g.x + dx * k * 0.3) * T, (g.y + dy * k * 0.3) * T, r, g.color, g.dir, { t, alpha: 0.3 / k });
        c.restore();
      }
      drawGhost(c, g.x * T, g.y * T, r, g.color, g.dir, {
        t: t + g.bob, fright, flash: fright && flashing, frozen, eyesOnly, stunned: g.stunT > 0, elite: g.elite, shield: g.shield, king: g.king, alpha,
      });
      if (g.human >= 0) text(c, `P${g.human + 1}`, g.x * T, g.y * T - T * 0.95, 8, g.color, 'center', 4);
    }
    // mega boss
    const b = w.mega;
    if (b && b.hp > 0) {
      const vuln = w.powerT > 0 || w.freezeT > 0;
      const blink = b.invulnT > 0 && Math.floor(b.invulnT * 12) % 2 === 0;
      if (!blink) {
        drawGhost(c, b.x * T, b.y * T, b.r * T, '#ff2d55', b.vx < 0 ? LEFT : RIGHT,
          { t, fright: vuln && w.powerT > 0, flash: vuln && flashing, frozen: w.freezeT > 0, king: true });
      }
      for (let i = 0; i < b.maxHp; i++) {
        c.save(); c.fillStyle = i < b.hp ? '#ff2d55' : 'rgba(255,45,85,0.2)'; c.shadowColor = '#ff2d55'; c.shadowBlur = i < b.hp ? 8 : 0;
        c.beginPath(); c.arc(b.x * T + (i - (b.maxHp - 1) / 2) * 12, b.y * T - b.r * T - 26, 4, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    // pacs
    for (const p of w.pacs) this.drawPacActor(w, p);
    // dying pac
    if (w.phase === 'dying' && w.dyingPac) {
      const p = w.dyingPac;
      const k = 1 - Math.max(0, (w.phaseT - 0.3) / 1.6);
      if (k < 1) drawPac(c, p.x * T, p.y * T, T * 0.48, UP, 0.08 + k * 0.92, p.color);
      if (k >= 0.98 && Math.random() < 0.4) this.burst(p.x, p.y, p.color, 6, 6, 'spark', 0.4);
    }
  }

  private drawPacActor(w: World, p: Pac) {
    const c = this.ctx, t = this.time;
    if (p.state === 'out' || p.state === 'respawn') return;
    if (w.phase === 'dying' && w.dyingPac === p) return;
    const giant = !!p.fx.melon;
    const r = T * (p.kind === 'mini' ? 0.26 : giant ? 1.35 : 0.48);
    const x = p.x * T, y = p.y * T;
    // trails
    const fast = p.fx.cherry || p.dashT > 0 || giant;
    let tr = this.trails.get(p.id);
    if (!tr) { tr = []; this.trails.set(p.id, tr); }
    tr.push({ x, y });
    if (tr.length > 10) tr.shift();
    if (fast) {
      c.save();
      tr.forEach((q, i) => {
        if (Math.abs(q.x - x) > T * 4) return;
        c.globalAlpha = (i / tr!.length) * 0.35;
        c.fillStyle = p.dashT > 0 ? '#fff' : p.color;
        c.beginPath(); c.arc(q.x, q.y, r * (0.5 + 0.5 * i / tr!.length), 0, Math.PI * 2); c.fill();
      });
      c.restore();
    }
    if (p.state === 'bubble') {
      const bob = Math.sin(t * 3 + p.id) * 3;
      c.save();
      c.strokeStyle = p.color; c.lineWidth = 2; c.shadowColor = p.color; c.shadowBlur = 12; c.globalAlpha = 0.8;
      c.beginPath(); c.arc(x, y + bob, T * 0.62, 0, Math.PI * 2); c.stroke();
      c.restore();
      drawPac(c, x, y + bob, T * 0.34, UP, 0.15, p.color, 6, 0.5);
      text(c, 'HELP!', x, y - T + bob, 7, p.color, 'center', 4);
      return;
    }
    const blink = p.invulnT > 0 && Math.floor(p.invulnT * 12) % 2 === 0;
    const alpha = p.kind === 'clone' ? 0.65 : blink ? 0.35 : 1;
    const mouth = p.moving ? 0.04 + 0.26 * Math.abs(Math.sin(p.mouth)) : 0.18;
    const col = p.powerT > 0 && w.cfg.mode === 'royale' ? (Math.floor(t * 10) % 2 ? '#fff' : p.color) : p.color;
    drawPac(c, x, y, r, p.dir === NONE ? LEFT : p.dir, mouth, col, giant ? 30 : 16, alpha);
    if (p.kind === 'clone') {
      c.save(); c.strokeStyle = p.color; c.globalAlpha = 0.6; c.setLineDash([3, 3]); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    if (p.fx.chili) { if (Math.random() < 0.5) this.burst(p.x, p.y, '#ff6a1f', 1, 2, 'dot', 0.4, 3, -4); }
    if (p.fx.apple) {
      c.save(); c.strokeStyle = 'rgba(255,64,64,0.25)'; c.lineWidth = 1; c.setLineDash([2, 6]);
      c.beginPath(); c.arc(x, y, 4 * T, t, t + Math.PI * 2); c.stroke(); c.restore();
    }
    if (p.dashCharges > 0) {
      for (let i = 0; i < p.dashCharges; i++) {
        c.save(); c.fillStyle = '#ffd23d'; c.beginPath(); c.arc(x - 8 + i * 8, y + r + 7, 2.5, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    if (w.cfg.players.length > 1 && p.kind === 'main') text(c, `P${p.player + 1}`, x, y - r - 9, 7, p.color, 'center', 4);
  }

  private drawFx() {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      const x = p.x * T, y = p.y * T;
      c.globalAlpha = a;
      c.fillStyle = p.color; c.strokeStyle = p.color;
      switch (p.kind) {
        case 'dot': c.beginPath(); c.arc(x, y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); c.fill(); break;
        case 'square': c.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size); break;
        case 'spark': c.lineWidth = p.size * 0.7; c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * 3, y - p.vy * 3); c.stroke(); break;
        case 'star': star(c, x, y, p.size * (0.6 + a * 0.6)); break;
        case 'ring': {
          const k = 1 - a;
          c.lineWidth = 3 * a + 1;
          c.beginPath(); c.arc(x, y, p.size * T * (0.2 + k), 0, Math.PI * 2); c.stroke();
          break;
        }
      }
    }
    c.restore();
    for (const p of this.popups) {
      const a = Math.min(1, p.life / p.max * 2.5);
      c.save(); c.globalAlpha = a;
      const pop = 1 + Math.max(0, (p.life - p.max + 0.15) / 0.15) * 0.4;
      c.translate(p.x * T, p.y * T); c.scale(pop, pop);
      text(c, p.text, 0, 0, p.size, p.color, 'center', 8);
      c.restore();
    }
  }

  private drawDarkness(w: World) {
    const d = this.darkCanvas.getContext('2d')!;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VW, MAZE_H);
    d.fillStyle = 'rgba(2,0,8,0.96)';
    d.fillRect(0, 0, VW, MAZE_H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const g = d.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill();
    };
    for (const p of w.pacs) if (p.state === 'alive' || p.state === 'bubble') hole(p.x * T, p.y * T, T * (p.kind === 'mini' ? 1.5 : 3.6 + (p.fx.melon ? 2 : 0)));
    if (w.fruit) hole(w.fruit.x * T, w.fruit.y * T, T * 1.2, 0.8);
    for (const g of w.ghosts) if (g.state === 'eyes') hole(g.x * T, g.y * T, T * 0.6, 0.7);
    for (const p of this.particles) if (p.kind === 'ring') hole(p.x * T, p.y * T, T * 2, 0.5);
    this.ctx.drawImage(this.darkCanvas, 0, 0);
    // ghost eyes glow through the dark
    for (const g of w.ghosts) {
      if (g.state !== 'active') continue;
      const c = this.ctx;
      c.save(); c.fillStyle = g.fright ? '#8fa0ff' : '#ff3d6e'; c.shadowColor = c.fillStyle; c.shadowBlur = 8;
      c.fillRect(g.x * T - 7, g.y * T - 5, 4, 3); c.fillRect(g.x * T + 3, g.y * T - 5, 4, 3); c.restore();
    }
  }

  private drawVoid(w: World) {
    const c = this.ctx;
    const vy = w.voidY * T;
    if (vy >= MAZE_H) return;
    c.save();
    const g = c.createLinearGradient(0, vy - T * 2, 0, vy + T);
    g.addColorStop(0, 'rgba(180,92,255,0)'); g.addColorStop(1, 'rgba(180,92,255,0.5)');
    c.fillStyle = g; c.fillRect(0, vy - T * 2, VW, T * 3);
    c.fillStyle = '#0a0014'; c.fillRect(0, vy, VW, MAZE_H - vy);
    for (let i = 0; i < 26; i++) {
      const y = vy + Math.random() * (MAZE_H - vy);
      const x = Math.random() * VW;
      c.fillStyle = ['#b45cff', '#ff2df0', '#2de2ff', '#ffffff'][i % 4];
      c.globalAlpha = Math.random() * 0.5;
      c.fillRect(x, y, 10 + Math.random() * 80, 2 + Math.random() * 4);
    }
    c.globalAlpha = 1;
    c.strokeStyle = '#e0b0ff'; c.shadowColor = '#b45cff'; c.shadowBlur = 18; c.lineWidth = 3;
    c.beginPath();
    for (let x = 0; x <= VW; x += 16) c.lineTo(x, vy + Math.sin(x * 0.05 + this.time * 8) * 4 + (Math.random() - 0.5) * 3);
    c.stroke();
    c.restore();
  }

  private drawBanner(w: World, hud: HudInfo) {
    const c = this.ctx;
    if (w.phase === 'ready') {
      const fy = w.maze.fruitSpot.y * T;
      if (hud.introHold && hud.bannerTitle) this.drawIntroCard(w, hud);
      else text(c, 'READY!', VW / 2, fy, 16, '#ffe600', 'center', 14);
      if (hud.showControlsHint) text(c, 'ARROWS / WASD / GAMEPAD TO MOVE', VW / 2, 20.2 * T, 8, '#8fa0ff', 'center', 0);
    }
    if (w.phase === 'clear') text(c, w.cfg.boss ? 'BOSS DEFEATED!' : 'MAZE CLEAR!', VW / 2, w.maze.fruitSpot.y * T, 16, '#5cff8a', 'center', 16);
    if (w.phase === 'over' && w.cfg.mode === 'run') text(c, 'GAME  OVER', VW / 2, w.maze.fruitSpot.y * T, 18, '#ff2d55', 'center', 16);
  }

  /** Stage intro card, held on screen until the player presses a key. */
  private drawIntroCard(w: World, hud: HudInfo) {
    const c = this.ctx;
    const mods = w.cfg.modifiers;
    const y0 = 4.4 * T, h = T * 5.2 + mods.length * T * 0.75;
    panel(c, 56, y0, VW - 112, h, hud.wallColor);
    text(c, hud.bannerTitle, VW / 2, y0 + 1.2 * T, 15, '#fff', 'center', 12);
    text(c, hud.bannerSub, VW / 2, y0 + 2.6 * T, 9, hud.wallColor, 'center', 6);
    mods.forEach((id, i) => {
      const md = MODIFIERS[id];
      text(c, `${md.name}: ${md.desc}`, VW / 2, y0 + 3.7 * T + i * T * 0.75, 7, md.color, 'center', 4);
    });
    const blink = Math.floor(this.time * 2.5) % 2 === 0;
    text(c, 'PRESS ANY KEY', VW / 2, y0 + h - 0.8 * T, 9, blink ? '#ffe600' : '#6a5a20', 'center', blink ? 8 : 0);
  }

  private drawHud(w: World, hud: HudInfo) {
    const c = this.ctx;
    if (hud.mode === 'run') {
      text(c, '1UP', 3 * T, 0.8 * T, 10, '#ff2d55', 'center', 6);
      text(c, String(w.score).padStart(2, '0'), 3 * T + 40, 1.9 * T, 14, '#fff', 'right', 6);
      text(c, 'HIGH SCORE', VW / 2, 0.8 * T, 10, '#ff2d55', 'center', 6);
      text(c, String(Math.max(hud.best, w.score)), VW / 2, 1.9 * T, 14, '#fff', 'center', 6);
      text(c, hud.stageLabel, VW - 1 * T, 0.8 * T, 8, hud.wallColor, 'right', 6);
      // coins
      c.save(); c.fillStyle = '#ffd23d'; c.shadowColor = '#ffd23d'; c.shadowBlur = 8;
      c.beginPath(); c.arc(VW - 4.2 * T, 1.9 * T, 6, 0, Math.PI * 2); c.fill(); c.restore();
      text(c, String(hud.coins + w.coins), VW - 3.7 * T, 1.95 * T, 11, '#ffd23d', 'left', 6);
      // combo
      if (w.powerT > 0 && w.combo > 0) text(c, `COMBO x${w.combo}`, VW - 1 * T, 2.6 * T, 7, '#5ce1ff', 'right', 4);
    } else if (hud.mode === 'royale') {
      const mains = w.mainPacs;
      mains.forEach((p, i) => {
        const x = (i + 0.5) * (VW / mains.length);
        text(c, `P${p.player + 1}`, x, 0.8 * T, 9, p.color, 'center', 6);
        text(c, String(p.score), x, 1.8 * T, 12, p.state === 'out' ? '#555' : '#fff', 'center', 4);
        for (let k = 0; k < p.lives; k++) drawPac(c, x - 12 + k * 12, 2.6 * T, 4, LEFT, 0.2, p.color, 4);
      });
      const tLeft = Math.max(0, Math.ceil(w.royaleT));
      text(c, `${Math.floor(tLeft / 60)}:${String(tLeft % 60).padStart(2, '0')}`, VW / 2, 2.65 * T, 8, tLeft < 20 ? '#ff2d55' : '#8fa0ff', 'center', 4);
    } else {
      const p = w.mainPacs[0];
      text(c, `PAC: P${(p?.player ?? 0) + 1}`, 2 * T, 0.8 * T, 9, p?.color ?? '#ff0', 'left', 6);
      text(c, String(p?.score ?? 0), 2 * T, 1.9 * T, 13, '#fff', 'left', 4);
      const gs = hud.squadGhostScores ?? {};
      let i = 0;
      for (const g of w.ghosts) {
        if (g.human < 0) continue;
        const x = VW - 2 * T - i * 5 * T;
        text(c, `P${g.human + 1}`, x, 0.8 * T, 9, g.color, 'right', 6);
        text(c, String((gs[g.human] ?? 0) + (w.ghostScores[g.human] ?? 0)), x, 1.9 * T, 12, '#fff', 'right', 4);
        i++;
      }
      text(c, `PELLETS LEFT ${w.maze.pelletsLeft}`, VW / 2, 2.65 * T, 7, '#8fa0ff', 'center', 0);
    }

    // bottom bar
    const by = VH - 1 * T;
    if (hud.mode !== 'royale') {
      for (let i = 0; i < Math.min(w.lives, 8); i++) drawPac(c, 1.2 * T + i * 1.3 * T, by, T * 0.38, LEFT, 0.2, w.mainPacs[0]?.color ?? '#ffe600', 6);
      if (w.lives > 8) text(c, `+${w.lives - 8}`, 1.2 * T + 8 * 1.3 * T, by, 8, '#fff', 'left', 0);
    }
    if (w.shieldsLeft > 0 && hud.mode === 'run') text(c, '◈'.repeat(w.shieldsLeft), 1 * T, by - 0.9 * T, 9, '#7fd8ff', 'left', 6);
    // active effects (P1 or each player)
    let ex = VW - 1 * T;
    for (const p of [...w.mainPacs].reverse()) {
      for (const [id, tl] of Object.entries(p.fx) as [FruitId, number][]) {
        const f = FRUITS[id];
        const dur = f.duration * w.mods.fruitDuration;
        c.save();
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(ex - 44, by + 10, 44, 3);
        c.fillStyle = f.color; c.fillRect(ex - 44, by + 10, 44 * Math.max(0, tl / dur), 3);
        c.restore();
        drawFruit(c, id, ex - 22, by - 4, 10, this.time);
        text(c, f.power, ex - 22, by - 18, 5, f.color, 'center', 0);
        ex -= 54;
      }
    }
    if (w.freezeT > 0) { text(c, `FREEZE ${w.freezeT.toFixed(1)}`, ex, by, 8, '#aef6ff', 'right', 6); ex -= 110; }
    if (w.frenzyT > 0) { text(c, `FRENZY ${w.frenzyT.toFixed(1)}`, ex, by, 8, '#ff5cf0', 'right', 6); ex -= 110; }
    if (hud.mode === 'run') {
      const mods = w.cfg.modifiers;
      mods.forEach((id, i) => text(c, MODIFIERS[id].name, VW / 2, VH - 1.55 * T + i * 11, 6, MODIFIERS[id].color, 'center', 0));
      if (w.cfg.boss === 'eater') text(c, `CORES LEFT: ${w.coresLeft}`, VW / 2, by + 6, 8, '#e0b0ff', 'center', 6);
      if (w.cfg.boss === 'train') text(c, `CARS LEFT: ${w.cars.filter(c => c.alive).length}`, VW / 2, by + 6, 8, '#ffd23d', 'center', 6);
      if (w.cfg.boss === 'mega' && w.mega) text(c, `MEGA BLINKY HP ${w.mega.hp}/${w.mega.maxHp}`, VW / 2, by + 6, 8, '#ff2d55', 'center', 6);
    }
  }
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
