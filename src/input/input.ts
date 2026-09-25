import { DOWN, LEFT, NONE, RIGHT, UP, type Dir } from '../sim/types';

/** Physical input devices. 'kb' = both keyboard halves merged (solo play). */
export type DeviceId = 'kb' | 'kbL' | 'kbR' | 'pad0' | 'pad1' | 'pad2' | 'pad3';

const KB_L: Record<string, Dir> = { KeyW: UP, KeyA: LEFT, KeyS: DOWN, KeyD: RIGHT };
const KB_R: Record<string, Dir> = { ArrowUp: UP, ArrowLeft: LEFT, ArrowDown: DOWN, ArrowRight: RIGHT };
const ACT_L = ['Space', 'KeyE', 'ShiftLeft'];
const ACT_R = ['Enter', 'ShiftRight', 'Slash', 'NumpadEnter', 'ControlRight'];
const CONFIRM = ['Enter', 'Space', 'NumpadEnter'];
const BACK = ['Escape', 'Backspace'];

interface PadState { dir: Dir; a: boolean; b: boolean; y: boolean; start: boolean; connected: boolean }

export class Input {
  private held = new Map<string, number>(); // code -> press order
  private order = 0;
  private pressedThisFrame = new Set<string>();
  private pads: PadState[] = [0, 1, 2, 3].map(() => ({ dir: NONE, a: false, b: false, y: false, start: false, connected: false }));
  private prevPads: PadState[] = this.pads.map(p => ({ ...p }));
  private prevMenuDir: Dir = NONE;
  menuDirEdge: Dir = NONE;
  private repeatT = 0;
  anyKeyThisFrame = false;
  /** While true (cheat console open), key presses don't reach the game. */
  suspended = false;
  onFirstGesture: (() => void) | null = null;

  constructor(target: Window) {
    target.addEventListener('keydown', e => {
      if (this.suspended) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) { this.held.set(e.code, ++this.order); this.pressedThisFrame.add(e.code); }
      this.anyKeyThisFrame = true;
      this.gesture();
    });
    target.addEventListener('keyup', e => { this.held.delete(e.code); });
    target.addEventListener('blur', () => this.held.clear());
    target.addEventListener('pointerdown', () => this.gesture());
  }

  private gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }

  /** Call once per rendered frame, before reading. */
  poll(dt: number) {
    this.prevPads = this.pads.map(p => ({ ...p }));
    const gps = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const gp = gps[i];
      const s = this.pads[i];
      if (!gp || !gp.connected) { Object.assign(s, { dir: NONE, a: false, b: false, y: false, start: false, connected: false }); continue; }
      s.connected = true;
      const btn = (n: number) => !!gp.buttons[n]?.pressed;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      let d: Dir = NONE;
      if (btn(12)) d = UP; else if (btn(13)) d = DOWN; else if (btn(14)) d = LEFT; else if (btn(15)) d = RIGHT;
      else if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.5) d = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? LEFT : RIGHT) : (ay < 0 ? UP : DOWN);
      s.dir = d; s.a = btn(0) || btn(2); s.b = btn(1); s.y = btn(3); s.start = btn(9);
      if ((s.a && !this.prevPads[i].a) || (s.start && !this.prevPads[i].start)) this.gesture();
    }
    // menu direction with key-repeat
    const md = this.dirOf('kb') !== NONE ? this.dirOf('kb') : this.pads.map(p => p.dir).find(d => d !== NONE) ?? NONE;
    this.menuDirEdge = NONE;
    const tapped = Object.entries({ ...KB_L, ...KB_R }).find(([code]) => this.pressedThisFrame.has(code));
    if (tapped) { this.menuDirEdge = tapped[1]; this.repeatT = 0.35; }
    else if (md !== NONE && md !== this.prevMenuDir) { this.menuDirEdge = md; this.repeatT = 0.35; }
    else if (md !== NONE) { this.repeatT -= dt; if (this.repeatT <= 0) { this.menuDirEdge = md; this.repeatT = 0.1; } }
    this.prevMenuDir = md;
  }

  /** Clear per-frame edges. Call at end of frame. */
  endFrame() { this.pressedThisFrame.clear(); this.anyKeyThisFrame = false; }

  private latest(map: Record<string, Dir>): Dir {
    let best: Dir = NONE, bo = -1;
    for (const [code, d] of Object.entries(map)) { const o = this.held.get(code); if (o !== undefined && o > bo) { bo = o; best = d; } }
    if (best !== NONE) return best;
    // a quick tap that started and ended between frames still counts for this frame
    for (const [code, d] of Object.entries(map)) if (this.pressedThisFrame.has(code)) return d;
    return best;
  }

  dirOf(dev: DeviceId): Dir {
    switch (dev) {
      case 'kb': return this.latest({ ...KB_L, ...KB_R });
      case 'kbL': return this.latest(KB_L);
      case 'kbR': return this.latest(KB_R);
      default: return this.pads[+dev.slice(3)].dir;
    }
  }

  actionOf(dev: DeviceId): boolean {
    const h = (codes: string[]) => codes.some(c => this.held.has(c));
    switch (dev) {
      case 'kb': return h(ACT_L) || h(ACT_R);
      case 'kbL': return h(ACT_L);
      case 'kbR': return h(ACT_R);
      default: return this.pads[+dev.slice(3)].a;
    }
  }

  /** Edge-triggered "join" press for a device (lobby). */
  joinPressed(dev: DeviceId): boolean {
    const p = (codes: string[]) => codes.some(c => this.pressedThisFrame.has(c));
    switch (dev) {
      case 'kbL': return p(['Space', 'KeyE']);
      case 'kbR': return p(['Enter', 'ShiftRight', 'NumpadEnter']);
      case 'kb': return p(CONFIRM);
      default: { const i = +dev.slice(3); return this.pads[i].a && !this.prevPads[i].a; }
    }
  }

  padConnected(i: number) { return this.pads[i].connected; }

  confirm(): boolean {
    return CONFIRM.some(c => this.pressedThisFrame.has(c)) || this.pads.some((p, i) => p.a && !this.prevPads[i].a);
  }
  back(): boolean {
    return BACK.some(c => this.pressedThisFrame.has(c)) || this.pads.some((p, i) => p.b && !this.prevPads[i].b);
  }
  pause(): boolean {
    return ['Escape', 'KeyP'].some(c => this.pressedThisFrame.has(c)) || this.pads.some((p, i) => p.start && !this.prevPads[i].start);
  }
  key(code: string): boolean { return this.pressedThisFrame.has(code); }
  /** Tab or gamepad Y: show/hide the owned-upgrades overlay. */
  upgradesToggle(): boolean {
    return this.pressedThisFrame.has('Tab') || this.pads.some((p, i) => p.y && !this.prevPads[i].y);
  }
  /** Any key or any gamepad button/direction pressed this frame. */
  anyPressed(): boolean {
    return this.anyKeyThisFrame || this.pads.some((p, i) => {
      const q = this.prevPads[i];
      return (p.a && !q.a) || (p.b && !q.b) || (p.start && !q.start) || (p.dir !== NONE && q.dir === NONE);
    });
  }
  startPressed(): boolean {
    return this.pressedThisFrame.has('Enter') || this.pads.some((p, i) => p.start && !this.prevPads[i].start);
  }
}
