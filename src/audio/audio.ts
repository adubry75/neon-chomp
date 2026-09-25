import type { GameEvent } from '../sim/entities';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type TrackId = 'title' | 'play' | 'fright' | 'boss' | 'stand' | 'none';

interface TrackDef {
  bpm: number;
  roots: number[];       // midi root per bar
  quality: ('M' | 'm')[];
  arp: number[];         // chord-tone index pattern for 16 steps
  kick: number[]; snare: number[]; hat: number[];
  bassOct: number;
  lead?: number[];       // optional melody (semitone offsets from root, -99 = rest) 16 per bar
  arpWave: OscillatorType;
  arpOct: number;
}

const P = (s: string) => s.split('').map((c, i) => (c === 'x' ? i : -1)).filter(i => i >= 0);

const TRACKS: Record<Exclude<TrackId, 'none'>, TrackDef> = {
  title: { bpm: 108, roots: [48, 45, 41, 43], quality: ['M', 'm', 'M', 'M'], arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3],
    kick: P('x.......x.......'), snare: P('....x.......x...'), hat: P('..x...x...x...x.'), bassOct: 0, arpWave: 'triangle', arpOct: 12 },
  play: { bpm: 124, roots: [45, 41, 48, 43], quality: ['m', 'M', 'M', 'M'], arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2],
    kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('..x...x...x...xx'), bassOct: -12, arpWave: 'square', arpOct: 12,
    lead: [0, -99, 3, -99, 7, -99, 10, 7, -99, 5, -99, 3, 2, -99, 0, -99] },
  fright: { bpm: 150, roots: [45, 46, 45, 44], quality: ['m', 'm', 'm', 'm'], arp: [0, 3, 1, 3, 2, 3, 1, 3, 0, 3, 1, 3, 2, 3, 1, 3],
    kick: P('x.x...x.x.x...x.'), snare: P('....x.......x...'), hat: P('xxxxxxxxxxxxxxxx'), bassOct: -12, arpWave: 'square', arpOct: 12 },
  boss: { bpm: 138, roots: [38, 46, 48, 45], quality: ['m', 'M', 'M', 'M'], arp: [0, 0, 2, 0, 1, 0, 2, 3, 0, 0, 2, 0, 1, 3, 2, 1],
    kick: P('x..x..x.x..x..x.'), snare: P('....x.......x..x'), hat: P('.x.x.x.x.x.x.x.x'), bassOct: -12, arpWave: 'sawtooth', arpOct: 12,
    lead: [12, -99, -99, 10, -99, -99, 7, -99, 8, -99, 7, -99, 5, -99, 3, -99] },
  stand: { bpm: 96, roots: [41, 43, 40, 45], quality: ['M', 'M', 'm', 'm'], arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 1, 2, 3, 2],
    kick: P('x.......x.......'), snare: P('........x.......'), hat: P('..x...x...x...x.'), bassOct: -12, arpWave: 'triangle', arpOct: 24 },
};

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private track: TrackId = 'none';
  private wanted: TrackId = 'none';
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  intensity = 0;
  musicVol = 0.6;
  sfxVol = 0.8;
  muted = false;
  private waka = false;
  private lastWaka = 0;
  private siren: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  sirenOn = false;
  sirenFright = false;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.timer = window.setInterval(() => this.schedule(), 25);
    // siren
    this.siren = c.createOscillator(); this.siren.type = 'triangle';
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.sfxBus);
    this.siren.start();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.musicBus.gain.value = this.musicVol * 0.55;
    this.sfxBus.gain.value = this.sfxVol * 0.8;
  }

  toggleMute() { this.muted = !this.muted; this.applyVolumes(); }

  play(t: TrackId) { this.wanted = t; }

  // ───────────── music scheduler ─────────────
  private schedule() {
    const c = this.ctx; if (!c) return;
    if (this.wanted !== this.track) {
      this.track = this.wanted; this.step = 0; this.nextTime = c.currentTime + 0.05;
    }
    this.updateSiren();
    if (this.track === 'none') return;
    const def = TRACKS[this.track];
    const bpm = def.bpm + (this.track === 'play' ? this.intensity * 30 : 0);
    const stepDur = 60 / bpm / 4;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.02;
    while (this.nextTime < c.currentTime + 0.14) {
      this.playStep(def, this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
  }

  private playStep(def: TrackDef, step: number, t: number, sd: number) {
    const bar = Math.floor(step / 16), s = step % 16;
    const root = def.roots[bar];
    const tones = def.quality[bar] === 'm' ? [0, 3, 7, 12] : [0, 4, 7, 12];
    const inten = this.track === 'play' ? this.intensity : 0.6;
    // bass: eighths, octave bounce
    if (s % 2 === 0) this.note(mtof(root + def.bassOct + (s % 4 === 2 ? 12 : 0)), t, sd * 1.6, 'square', 0.11, 700);
    // arp
    const tone = tones[def.arp[s]];
    this.note(mtof(root + def.arpOct + tone), t, sd * 0.9, def.arpWave, 0.05 + inten * 0.02, 2600);
    // lead
    if (def.lead && inten > 0.35) {
      const l = def.lead[s];
      if (l > -99) this.note(mtof(root + 24 + l), t, sd * 1.8, 'square', 0.035, 3500);
    }
    if (def.kick.includes(s)) this.kick(t);
    if (def.snare.includes(s) && (this.track !== 'play' || inten > 0.15)) this.noiseHit(t, 0.12, 0.12, 1800, 'bandpass');
    if (def.hat.includes(s)) this.noiseHit(t, 0.03, 0.035, 8000, 'highpass');
  }

  private note(f: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(lp).connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.2);
  }

  private noiseHit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, bus?: GainNode) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(bus ?? this.musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  private updateSiren() {
    const c = this.ctx; if (!c || !this.siren || !this.sirenGain) return;
    const t = c.currentTime;
    const on = this.sirenOn && this.track !== 'none';
    this.sirenGain.gain.setTargetAtTime(on ? (this.sirenFright ? 0.035 : 0.022) : 0, t, 0.05);
    if (!on) return;
    const period = this.sirenFright ? 0.13 : 0.4 - this.intensity * 0.15;
    const phase = (t % period) / period;
    const lo = this.sirenFright ? 180 : 380 + this.intensity * 180, hi = this.sirenFright ? 260 : 640 + this.intensity * 260;
    const f = phase < 0.5 ? lo + (hi - lo) * phase * 2 : hi - (hi - lo) * (phase - 0.5) * 2;
    this.siren.frequency.setTargetAtTime(f, t, 0.02);
  }

  // ───────────── sfx ─────────────
  private tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.2, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    const c = this.ctx; if (!c) return;
    this.noiseHit(c.currentTime + delay, dur, vol, freq, type, this.sfxBus);
  }
  private arp(notes: number[], gap: number, dur: number, type: OscillatorType = 'square', vol = 0.12) {
    notes.forEach((n, i) => this.tone(mtof(n), mtof(n), dur, type, vol, i * gap));
  }

  ui(kind: 'move' | 'select' | 'back' | 'buy' | 'deny') {
    if (!this.ctx) return;
    if (kind === 'move') this.tone(660, 700, 0.05, 'square', 0.06);
    if (kind === 'select') this.arp([72, 79, 84], 0.05, 0.1, 'square', 0.1);
    if (kind === 'back') this.tone(500, 300, 0.1, 'square', 0.08);
    if (kind === 'buy') this.arp([84, 88, 91, 96], 0.04, 0.12, 'triangle', 0.14);
    if (kind === 'deny') this.tone(160, 120, 0.18, 'sawtooth', 0.1);
  }

  handle(e: GameEvent) {
    if (!this.ctx) return;
    const c = this.ctx;
    switch (e.t) {
      case 'pellet': {
        if (c.currentTime - this.lastWaka < 0.06) return;
        this.lastWaka = c.currentTime;
        this.waka = !this.waka;
        this.waka ? this.tone(520, 260, 0.075, 'triangle', 0.22) : this.tone(260, 500, 0.075, 'triangle', 0.22);
        break;
      }
      case 'power': this.arp([60, 67, 72, 79], 0.035, 0.12, 'square', 0.12); this.tone(90, 40, 0.35, 'sine', 0.4); break;
      case 'eatGhost': {
        const k = Math.min(+(e.s ?? 1), 8);
        this.tone(200 + k * 60, 1400 + k * 150, 0.28, 'square', 0.16);
        this.tone(100, 50, 0.2, 'sine', 0.35);
        break;
      }
      case 'death': {
        const t0 = c.currentTime;
        for (let i = 0; i < 10; i++) this.tone(900 - i * 70, 700 - i * 70, 0.11, 'square', 0.13, i * 0.11);
        void t0;
        this.tone(220, 40, 1.4, 'sawtooth', 0.08, 0.1);
        break;
      }
      case 'fruit': this.arp([76, 80, 83, 88, 92], 0.045, 0.12, 'square', 0.12); break;
      case 'fxStart': this.arp([72, 76, 79], 0.05, 0.1, 'triangle', 0.1); break;
      case 'fruitSpawn': this.arp([96, 100, 103], 0.04, 0.08, 'triangle', 0.07); break;
      case 'extraLife': this.arp([72, 76, 79, 84, 79, 84], 0.08, 0.12, 'square', 0.14); break;
      case 'coin': this.tone(1320, 1320, 0.06, 'square', 0.07); this.tone(1760, 1760, 0.12, 'square', 0.07, 0.05); break;
      case 'coinDrop': break;
      case 'vault': this.arp([84, 88, 91, 96, 100, 103], 0.05, 0.14, 'triangle', 0.12); break;
      case 'shatter': this.noise(0.25, 0.3, 6000, 'highpass'); this.tone(2400, 1800, 0.15, 'triangle', 0.1); break;
      case 'shock': this.tone(70, 30, 0.6, 'sine', 0.5); this.noise(0.5, 0.25, 900); this.arp([84, 91, 96], 0.03, 0.2, 'triangle', 0.08); break;
      case 'dash': this.noise(0.22, 0.25, 2500, 'bandpass'); this.tone(300, 900, 0.15, 'sawtooth', 0.06); break;
      case 'peel': this.tone(700, 500, 0.06, 'triangle', 0.08); break;
      case 'slip': this.tone(300, 1500, 0.35, 'sine', 0.18); break;
      case 'revive': case 'respawn': this.arp([67, 71, 74, 79], 0.05, 0.1, 'triangle', 0.12); break;
      case 'down': this.tone(600, 200, 0.4, 'square', 0.12); break;
      case 'pvp': this.tone(120, 60, 0.3, 'square', 0.3); this.noise(0.3, 0.3, 1500); break;
      case 'wake': this.tone(180, 240, 0.2, 'triangle', 0.12); break;
      case 'burn': this.noise(0.4, 0.3, 1200, 'bandpass'); this.tone(400, 100, 0.3, 'sawtooth', 0.08); break;
      case 'bomb': this.tone(80, 30, 0.5, 'sine', 0.5); this.noise(0.4, 0.3, 700); break;
      case 'bossHit': this.tone(90, 30, 0.6, 'sine', 0.6); this.noise(0.5, 0.4, 1500); this.tone(900, 200, 0.4, 'sawtooth', 0.12); break;
      case 'bossDown':
        this.tone(60, 20, 1.5, 'sine', 0.6); this.noise(1.2, 0.45, 900);
        this.arp([60, 64, 67, 72, 76, 79, 84], 0.09, 0.3, 'square', 0.12);
        break;
      case 'core': this.arp([48, 55, 60, 67, 72], 0.04, 0.4, 'sawtooth', 0.1); this.tone(70, 35, 0.6, 'sine', 0.5); break;
      case 'coreSpawn': this.arp([91, 95, 98], 0.05, 0.1, 'triangle', 0.06); break;
      case 'clear': this.arp([72, 76, 79, 84, 88, 91, 96], 0.07, 0.18, 'square', 0.12); break;
      case 'go': this.arp([79, 84], 0.1, 0.15, 'square', 0.12); break;
      case 'teleport': this.tone(1500, 200, 0.2, 'sawtooth', 0.08); break;
      case 'gateClose': this.tone(140, 90, 0.15, 'square', 0.1); break;
      case 'gateOpen': this.tone(90, 140, 0.15, 'square', 0.06); break;
      case 'shield': case 'shieldBreak': this.tone(1800, 900, 0.2, 'triangle', 0.14); this.noise(0.15, 0.15, 5000, 'highpass'); break;
      case 'splinter': case 'pop': this.tone(900, 1400, 0.06, 'square', 0.06); break;
      case 'clank': this.tone(220, 200, 0.08, 'square', 0.1); break;
      case 'trainBreak': this.arp([72, 67, 64, 60], 0.05, 0.1, 'triangle', 0.08); break;
      case 'refill': this.arp([60, 72, 84], 0.05, 0.1, 'square', 0.08); break;
      case 'powerBack': this.tone(600, 900, 0.1, 'triangle', 0.06); break;
      case 'gameOver': this.arp([67, 63, 60, 55], 0.22, 0.3, 'square', 0.12); break;
    }
  }

  dispose() { clearInterval(this.timer); }
}
