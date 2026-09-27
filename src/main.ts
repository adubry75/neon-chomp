import { Renderer, VW, VH, type HudInfo } from './render/renderer';
import { T, drawFruit, drawGhost, drawPac, panel, text, wrapText } from './render/draw';
import { Input, type DeviceId } from './input/input';
import { GameAudio } from './audio/audio';
import { World, type PlayerInfo } from './sim/world';
import { Run, ACTS, BOSS_INFO, STAGES_PER_ACT, actPips } from './game/run';
import { CUTSCENE_LEN, drawCutscene, type CutsceneId } from './render/cutscenes';
import { drawUpgradeChips, drawUpgradeList } from './render/upgrades';
import { runCheat } from './game/cheats';
import { META_ITEMS, defaultMeta, loadMeta, perkLevel, recordWin, saveMeta, soulsForRun, type MetaSave } from './game/meta';
import { TIERS, actColor, gagFor, tierLabel, tierSouls } from './data/tiers';
import { HEAT_BY_ID, HEAT_RULES, HEAT_SKINS, MAX_HEAT, heatPoints, heatSoulMult } from './data/heat';
import { RARITY_COLOR, type UpgradeDef } from './data/upgrades';
import { FRUITS, FRUIT_IDS } from './data/fruits';
import { MODIFIERS } from './sim/modifiers';
import { generateMaze } from './sim/mazegen';
import { defaultMods } from './sim/mods';
import { DOWN, LEFT, NONE, RIGHT, TICK, UP, type Dir } from './sim/types';

type Scene = 'title' | 'lobby' | 'play' | 'pause' | 'stand' | 'results' | 'meta' | 'settings' | 'help' | 'versus' | 'cutscene' | 'heat';
type LobbyMode = 'coop' | 'royale' | 'squad';

const PLAYER_COLORS = ['#ffe600', '#5cff8a', '#ff5cf0', '#f4f4ff'];
const DEVICES: DeviceId[] = ['kbL', 'kbR', 'pad0', 'pad1', 'pad2', 'pad3'];
const DEVICE_LABEL: Record<DeviceId, string> = { kb: 'KEYBOARD', kbL: 'WASD + SPACE', kbR: 'ARROWS + ENTER', pad0: 'GAMEPAD 1', pad1: 'GAMEPAD 2', pad2: 'GAMEPAD 3', pad3: 'GAMEPAD 4' };

interface Player { slot: number; device: DeviceId | 'solo'; color: string }

class Game {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  r = new Renderer(this.canvas);
  input = new Input(window);
  audio = new GameAudio();
  meta: MetaSave = loadMeta();
  scene: Scene = 'title';
  cursor = 0;
  cursor2 = 0;
  last = performance.now();
  acc = 0;
  world: World | null = null;
  run: Run | null = null;
  players: Player[] = [];
  lobbyMode: LobbyMode = 'coop';
  mode: 'run' | 'royale' | 'squad' = 'run';
  squadRound = 0;
  squadTotals: Record<number, number> = {};
  lastRound: { title: string; lines: [string, string][] } | null = null;
  resultInfo: { won: boolean; souls: number; newBest: boolean; cheated: boolean; unlocked: number | null } | null = null;
  /** Reincarnation tier the next Solo/Co-op run starts on (picked on the title screen). */
  tier = 0;
  toast = '';
  toastT = 0;
  sceneT = 0;
  standMsg = '';
  /** Stage intro card is up; the world doesn't tick until a key is pressed. */
  introHold = false;
  /** Fruit Stand: full-screen owned-upgrades overlay is open. */
  standOverlay = false;
  /** Backtick cheat console. */
  cheat = { open: false, text: '', log: [] as string[] };
  slowmo = false;
  cutQueue: CutsceneId[] = [];
  cutThen: (() => void) | null = null;

  constructor() {
    this.applySettings();
    this.tier = this.meta.tierUnlocked;
    this.input.onFirstGesture = () => { this.audio.init(); this.audio.play(this.trackFor()); };
    (window as unknown as { __game: Game }).__game = this;
    window.addEventListener('keydown', e => this.consoleKey(e));
    const q = new URLSearchParams(location.search);
    if (q.get('auto') === 'run') this.startSolo(Number(q.get('seed')) || undefined, Number(q.get('stage')) || 0, Math.min(5, Math.max(0, Number(q.get('tier')) || 0)));
    if (q.get('auto') === 'evil') this.startEvilPrototype();
    if (q.get('auto') === 'royale') { this.players = [0, 1, 2, 3].map(i => ({ slot: i, device: DEVICES[i], color: PLAYER_COLORS[i] })); this.startRoyale(); }
    if (q.get('auto') === 'squad') { this.players = [0, 1, 2].map(i => ({ slot: i, device: DEVICES[i], color: PLAYER_COLORS[i] })); this.startSquad(); }
    requestAnimationFrame(t => this.frame(t));
  }

  applySettings() {
    const s = this.meta.settings;
    this.r.settings.bloom = s.bloom; this.r.settings.crt = s.crt; this.r.settings.shake = s.shake;
    this.audio.musicVol = s.music; this.audio.sfxVol = s.sfx; this.audio.applyVolumes();
  }

  go(s: Scene) { this.scene = s; this.cursor = 0; this.cursor2 = 0; this.sceneT = 0; this.audio.play(this.trackFor()); }

  trackFor() {
    switch (this.scene) {
      case 'title': case 'meta': case 'heat': case 'settings': case 'help': case 'lobby': case 'results': case 'versus': return 'title';
      case 'stand': case 'cutscene': return 'stand';
      case 'pause': return 'none';
      case 'play': return this.world?.cfg.boss ? 'boss' : 'play';
    }
  }

  say(msg: string) { this.toast = msg; this.toastT = 2; }

  // ───────────────────────── frame ─────────────────────────

  frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.poll(dt);
    this.sceneT += dt;
    if (this.input.key('KeyM')) { this.audio.toggleMute(); this.say(this.audio.muted ? 'SOUND OFF' : 'SOUND ON'); }
    this.r.begin();
    switch (this.scene) {
      case 'title': this.title(dt); break;
      case 'lobby': this.lobby(); break;
      case 'play': this.play(dt); break;
      case 'pause': this.pause(); break;
      case 'stand': this.stand(); break;
      case 'results': this.results(); break;
      case 'meta': this.metaShop(); break;
      case 'settings': this.settingsScene(); break;
      case 'help': this.help(); break;
      case 'heat': this.heatScene(); break;
      case 'versus': this.versusResults(); break;
      case 'cutscene': this.cutscene(dt); break;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      text(this.r.ctx, this.toast, VW / 2, VH - 14, 9, '#fff', 'center', 6);
    }
    if (this.cheat.open) this.drawConsole();
    this.r.post();
    this.input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  }

  menuNav(n: number, horizontal = false) {
    const d = this.input.menuDirEdge;
    const prev = horizontal ? LEFT : UP, next = horizontal ? RIGHT : DOWN;
    if (d === prev) { this.cursor = (this.cursor + n - 1) % n; this.audio.ui('move'); }
    if (d === next) { this.cursor = (this.cursor + 1) % n; this.audio.ui('move'); }
  }

  // ───────────────────────── title ─────────────────────────

  title(dt: number) {
    const c = this.r.ctx;
    this.r.time += dt;
    const t = this.r.time;
    // logo
    const bob = Math.sin(t * 2) * 4;
    text(c, 'NEON', VW / 2, 130 + bob, 54, '#ff2df0', 'center', 30);
    text(c, 'CHOMP', VW / 2, 200 + bob, 54, '#ffe600', 'center', 30);
    text(c, 'A PAC-MAN ROGUELITE REMIX', VW / 2, 252, 10, '#5ce1ff', 'center', 8);
    // attract: pac chased by ghosts, then turning the tables
    const cyc = (t % 10) / 10;
    const y = 300;
    const chase = cyc < 0.5;
    const px = chase ? -60 + cyc * 2 * (VW + 200) : VW + 140 - (cyc - 0.5) * 2 * (VW + 260);
    const dir: Dir = chase ? RIGHT : LEFT;
    drawPac(c, px, y, 16, dir, 0.04 + 0.26 * Math.abs(Math.sin(t * 14)), '#ffe600');
    const cols = ['#ff2d55', '#ff8cf0', '#2de2ff', '#ffab2d'];
    for (let i = 0; i < 4; i++) {
      const gx = chase ? px - 70 - i * 40 : px + 60 + i * 40;
      drawGhost(c, gx, y, 16, cols[i], dir, { t: t + i, fright: !chase, flash: !chase && cyc > 0.85 && Math.floor(t * 6) % 2 === 0 });
    }
    if (chase) { c.save(); c.fillStyle = '#fff4e0'; c.shadowColor = '#fff'; c.shadowBlur = 14; c.beginPath(); c.arc(VW - 40, y, 7, 0, Math.PI * 2); c.fill(); c.restore(); }

    const entries: [string, () => void][] = [
      ['SOLO RUN', () => this.startSolo()],
      ['CO-OP RUN  (1-4P)', () => this.openLobby('coop')],
      ...(this.meta.tierUnlocked >= 2 ? [[`HEAT  ${this.activeHeat().length ? heatPoints(this.activeHeat()) : 'OFF'}`, () => this.go('heat')] as [string, () => void]] : []),
      ['CHOMP ROYALE  (2-4P)', () => this.openLobby('royale')],
      ['GHOST SQUAD  (2-4P)', () => this.openLobby('squad')],
      ['SOUL SHOP', () => this.go('meta')],
      ['HOW TO PLAY', () => this.go('help')],
      ['SETTINGS', () => this.go('settings')],
    ];
    const items = entries.map(e => e[0]);
    this.menuNav(items.length);
    if (this.meta.tierUnlocked > 0 && this.cursor <= 1) {
      const d = this.input.menuDirEdge, n = this.meta.tierUnlocked + 1;
      if (d === LEFT) { this.tier = (this.tier + n - 1) % n; this.audio.ui('move'); }
      if (d === RIGHT) { this.tier = (this.tier + 1) % n; this.audio.ui('move'); }
      text(c, `◀  ${tierLabel(this.tier)}  ▶`, VW / 2, 345, 11, TIERS[this.tier].color, 'center', 10);
    }
    items.forEach((s, i) => {
      const sel = i === this.cursor;
      const yy = 380 + i * 46;
      if (sel) { panel(c, VW / 2 - 200, yy - 18, 400, 36, '#ffe600', 'rgba(40,20,60,0.7)'); drawPac(c, VW / 2 - 175, yy, 9, RIGHT, 0.05 + 0.25 * Math.abs(Math.sin(t * 10)), '#ffe600', 8); }
      text(c, s, VW / 2, yy, 13, sel ? '#fff' : '#8f86c9', 'center', sel ? 10 : 0);
    });
    const tierTxt = this.meta.tierUnlocked ? `   ·   R${this.meta.tierUnlocked}` : '';
    text(c, `BEST ${this.meta.best}   ·   SOULS ${this.meta.souls}   ·   RUNS ${this.meta.runs}   ·   WINS ${this.meta.wins}${tierTxt}`, VW / 2, VH - 64, 8, '#b45cff', 'center', 6);
    text(c, 'ENTER / SPACE / (A) TO SELECT   ·   M TO MUTE', VW / 2, VH - 40, 7, '#5a5290', 'center', 0);
    if (this.input.confirm()) {
      this.audio.ui('select');
      entries[this.cursor]?.[1]();
    }
  }

  /** Heat rules picked and still unlocked (a progress reset can lock them again). */
  activeHeat() { return this.meta.heatPicked.filter(id => (HEAT_BY_ID[id]?.tier ?? 99) <= this.meta.tierUnlocked); }

  // ───────────────────────── heat ─────────────────────────

  heatScene() {
    const c = this.r.ctx, m = this.meta;
    text(c, 'HEAT', VW / 2, 80, 26, '#ff6a3d', 'center', 16);
    text(c, 'OPTIONAL RULES FOR BRAGGING RIGHTS  ·  +10% SOULS PER POINT', VW / 2, 120, 7, '#8f86c9', 'center', 0);
    this.menuNav(HEAT_RULES.length + 1);
    HEAT_RULES.forEach((r, i) => {
      const y = 170 + i * 64, sel = i === this.cursor;
      const locked = r.tier > m.tierUnlocked, on = m.heatPicked.includes(r.id) && !locked;
      if (sel) panel(c, 30, y - 22, VW - 60, 52, '#ff6a3d', 'rgba(50,20,10,0.8)');
      text(c, locked ? `R${r.tier}` : on ? '■' : '□', 62, y + 2, locked ? 9 : 16, locked ? '#5a5290' : on ? '#ff6a3d' : '#8f86c9', 'center', on ? 8 : 0);
      text(c, locked ? '???' : r.name.toUpperCase(), 92, y - 6, 10, locked ? '#5a5290' : on ? '#fff' : '#b8b0e8', 'left', 0);
      text(c, locked ? `UNLOCKS AT REINCARNATION ${r.tier}` : r.desc, 92, y + 12, 6, '#8f86c9', 'left', 0);
      text(c, `+${r.points}`, VW - 54, y + 2, 12, locked ? '#5a5290' : '#ff6a3d', 'right', 0);
    });
    const pts = heatPoints(this.activeHeat());
    const y0 = 170 + HEAT_RULES.length * 64;
    text(c, `HEAT ${pts}/${MAX_HEAT}   ·   SOULS x${heatSoulMult(pts).toFixed(1)}   ·   BEST CLEAR ${m.heatBest}`, VW / 2, y0 + 4, 9, '#ffd23d', 'center', 6);
    text(c, HEAT_SKINS.map(s => `${m.heatBest >= s.heat ? '✓' : '·'} HEAT ${s.heat}: ${s.name.replace('Skin: ', '').toUpperCase()}`).join('   '), VW / 2, y0 + 34, 6, '#8f86c9', 'center', 0);
    const backSel = this.cursor === HEAT_RULES.length;
    text(c, (backSel ? '> ' : '') + 'BACK', VW / 2, y0 + 80, 12, backSel ? '#fff' : '#8f86c9', 'center', 0);
    if (this.input.back() || (this.input.confirm() && backSel)) { this.audio.ui('back'); this.go('title'); return; }
    if (!this.input.confirm()) return;
    const r = HEAT_RULES[this.cursor];
    if (r.tier > m.tierUnlocked) { this.audio.ui('deny'); return; }
    m.heatPicked = m.heatPicked.includes(r.id) ? m.heatPicked.filter(id => id !== r.id) : [...m.heatPicked, r.id];
    saveMeta(m);
    this.audio.ui('select');
  }

  // ───────────────────────── lobby ─────────────────────────

  openLobby(m: LobbyMode) { this.lobbyMode = m; this.players = []; this.go('lobby'); }

  lobby() {
    const c = this.r.ctx;
    const names = { coop: 'CO-OP RUN', royale: 'CHOMP ROYALE', squad: 'GHOST SQUAD' };
    const blurbs = {
      coop: 'Clear the full roguelite together. Shared lives. If a friend goes down, touch their bubble to revive them.',
      royale: 'Everyone is a Pac. Eat a power pellet, then eat your friends. Last Pac standing wins (2:30 limit).',
      squad: 'One Pac vs. ghosts driven by players. Roles rotate every round. Ghosts earn points for each catch.',
    };
    const min = this.lobbyMode === 'coop' ? 1 : 2;
    text(c, names[this.lobbyMode], VW / 2, 90, 22, '#ffe600', 'center', 16);
    wrapText(c, blurbs[this.lobbyMode], VW / 2, 140, VW - 120, 8, '#8fa0ff', 16);
    if (this.lobbyMode === 'coop' && this.meta.tierUnlocked > 0) text(c, tierLabel(this.tier), VW / 2, 198, 9, TIERS[this.tier].color, 'center', 8);
    for (let i = 0; i < 4; i++) {
      const p = this.players[i];
      const x = 40 + (i % 2) * 306, y = 220 + Math.floor(i / 2) * 200;
      panel(c, x, y, 286, 170, p ? p.color : '#3a3070');
      if (p) {
        drawPac(c, x + 143, y + 70, 28, RIGHT, 0.05 + 0.25 * Math.abs(Math.sin(this.r.time * 8 + i)), p.color, 20);
        text(c, `P${i + 1}`, x + 143, y + 24, 14, p.color, 'center', 8);
        text(c, DEVICE_LABEL[p.device as DeviceId], x + 143, y + 130, 8, '#fff', 'center', 0);
      } else {
        text(c, `P${i + 1}`, x + 143, y + 24, 14, '#3a3070', 'center', 0);
        text(c, 'PRESS ACTION', x + 143, y + 80, 9, Math.floor(this.r.time * 2) % 2 ? '#8f86c9' : '#5a5290', 'center', 0);
        text(c, 'TO JOIN', x + 143, y + 100, 9, '#5a5290', 'center', 0);
      }
    }
    this.r.time += 1 / 60;
    text(c, 'JOIN:  SPACE (WASD)  ·  ENTER (ARROWS)  ·  (A) ON ANY GAMEPAD', VW / 2, 650, 7, '#8f86c9', 'center', 0);
    const ready = this.players.length >= min;
    text(c, ready ? 'P1: PRESS ACTION AGAIN TO START' : `NEED ${min}+ PLAYERS`, VW / 2, 700, 11, ready ? '#5cff8a' : '#ff2d55', 'center', 8);
    text(c, 'ESC / (B) TO GO BACK', VW / 2, 740, 7, '#5a5290', 'center', 0);
    for (const d of DEVICES) {
      if (!this.input.joinPressed(d)) continue;
      const existing = this.players.find(p => p.device === d);
      if (existing) {
        if (existing.slot === 0 && ready) { this.audio.ui('select'); this.launchLobby(); return; }
      } else if (this.players.length < 4) {
        this.players.push({ slot: this.players.length, device: d, color: PLAYER_COLORS[this.players.length] });
        this.audio.ui('buy');
      }
    }
    if (this.input.back()) { this.audio.ui('back'); this.go('title'); }
  }

  launchLobby() {
    if (this.lobbyMode === 'coop') this.startRun(this.players, undefined, 0, this.tier);
    else if (this.lobbyMode === 'royale') this.startRoyale();
    else { this.squadRound = 0; this.squadTotals = {}; this.startSquad(); }
  }

  // ───────────────────────── run flow ─────────────────────────

  startSolo(seed?: number, stage = 0, tier = this.tier) {
    this.players = [{ slot: 0, device: 'solo', color: this.meta.skin }];
    this.startRun(this.players, seed, stage, tier);
  }

  startRun(players: Player[], seed?: number, stage = 0, tier = 0) {
    this.mode = 'run';
    const infos: PlayerInfo[] = players.map(p => ({ slot: p.slot, color: p.color }));
    this.run = new Run(seed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0), infos, this.meta, tier, this.activeHeat());
    this.run.stage = stage;
    this.world = null;
    this.meta.runs++; saveMeta(this.meta);
    if (stage === 0) this.playCutscenes(['intro', 'title0'], () => this.startStage());
    else this.startStage();
  }

  /** Debug: the Evil Pac fight on its own. Marked cheated, so it never touches the save. */
  startEvilPrototype() {
    this.mode = 'run';
    this.players = [{ slot: 0, device: 'solo', color: this.meta.skin }];
    this.run = new Run(Math.floor(Math.random() * 2 ** 31) >>> 0, [{ slot: 0, color: this.meta.skin }], this.meta, 5);
    this.run.cheated = true;
    this.run.plan = [{ act: 4, index: 0, level: 17, boss: 'evil', modifiers: [], mazeSeed: 4242 }];
    this.world = null;
    this.startStage();
  }

  /** Start the run's current stage, with the intermission + title card first when a new act begins. */
  nextStage() {
    const p = this.run!.current;
    if (p.index === 0 && this.run!.stage > 0) {
      const ids = [gagFor(p.act, this.run!.tier), `title${p.act}`].filter((id): id is CutsceneId => !!id && id in CUTSCENE_LEN);
      this.playCutscenes(ids, () => this.startStage());
    }
    else this.startStage();
  }

  playCutscenes(ids: CutsceneId[], then: () => void) {
    this.cutQueue = [...ids];
    this.cutThen = then;
    this.go('cutscene');
  }

  cutscene(dt: number) {
    this.r.time += dt;
    const id = this.cutQueue[0];
    if (id) drawCutscene(this.r.ctx, id, this.sceneT);
    const skip = this.sceneT > 0.3 && this.input.anyPressed();
    if (id && this.sceneT < CUTSCENE_LEN[id] && !skip) return;
    this.cutQueue.shift();
    this.sceneT = 0;
    if (!this.cutQueue.length) { const then = this.cutThen; this.cutThen = null; then?.(); }
  }

  startStage() {
    const god = this.world?.god ?? false; // cheat survives stage changes within a run
    this.world = this.run!.makeWorld();
    this.world.god = god;
    this.r.particles = []; this.r.popups = [];
    this.introHold = true;
    this.go('play');
  }

  startRoyale() {
    this.mode = 'royale';
    const infos = this.players.map(p => ({ slot: p.slot, color: p.color }));
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.world = new World({
      mode: 'royale', maze: generateMaze(seed), level: 3, mods: defaultMods(), modifiers: [], boss: null,
      players: infos, seed, fruitPool: FRUIT_IDS.filter(f => f !== 'key'), lives: 3, scoreBase: 0, royaleTime: 150,
    });
    this.introHold = true;
    this.go('play');
  }

  startSquad() {
    this.mode = 'squad';
    const n = this.players.length;
    const pac = this.players[this.squadRound % n];
    const ghostsP = this.players.filter(p => p !== pac).map(p => p.slot);
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.world = new World({
      mode: 'squad', maze: generateMaze(seed), level: 3, mods: defaultMods(), modifiers: [], boss: null,
      players: this.players.map(p => ({ slot: p.slot, color: p.color })), seed,
      fruitPool: ['cherry', 'orange', 'apple', 'melon', 'bell', 'pineapple', 'banana'], lives: 2, scoreBase: 0,
      squadPac: pac.slot, ghostPlayers: ghostsP,
    });
    this.introHold = true;
    this.go('play');
  }

  deviceDir(p: Player): Dir {
    if (p.device === 'solo') {
      const k = this.input.dirOf('kb');
      if (k !== NONE) return k;
      for (let i = 0; i < 4; i++) { const d = this.input.dirOf(`pad${i}` as DeviceId); if (d !== NONE) return d; }
      return NONE;
    }
    return this.input.dirOf(p.device);
  }
  deviceAct(p: Player): boolean {
    if (p.device === 'solo') return this.input.actionOf('kb') || [0, 1, 2, 3].some(i => this.input.actionOf(`pad${i}` as DeviceId));
    return this.input.actionOf(p.device);
  }

  hudInfo(): HudInfo {
    const w = this.world!;
    if (this.mode === 'run' && this.run) {
      const p = this.run.current;
      const boss = p.boss ? BOSS_INFO[p.boss] : null;
      return {
        mode: 'run', best: this.meta.best, coins: this.run.coins,
        stageLabel: `${this.run.tier ? `R${this.run.tier} · ` : ''}${ACTS[p.act].split(' · ')[0]}`, pips: actPips(this.run.plan, this.run.stage),
        wallColor: boss ? boss.color : actColor(this.run.tier, p.act),
        bannerTitle: boss ? boss.name : `${ACTS[p.act].split(' · ')[0]} · STAGE ${p.index + 1}`,
        bannerSub: boss ? boss.sub : w.maze.name.toUpperCase(),
        playerNames: [], showControlsHint: this.run.stage === 0 && w.deathsThisStage === 0,
        introHold: this.introHold,
        boss: boss ? { name: boss.name, rules: boss.rules, color: boss.color } : undefined,
      };
    }
    return {
      mode: this.mode, best: 0, coins: 0, stageLabel: '', wallColor: this.mode === 'royale' ? '#00e5ff' : '#ff8c1f',
      bannerTitle: this.mode === 'royale' ? 'CHOMP ROYALE' : `GHOST SQUAD · ROUND ${this.squadRound + 1}`,
      bannerSub: this.mode === 'royale' ? 'POWER UP, THEN EAT YOUR FRIENDS' : `P${(w.cfg.squadPac ?? 0) + 1} IS PAC. GHOSTS: CATCH THEM!`,
      playerNames: [], squadGhostScores: this.mode === 'squad' ? this.squadTotals : undefined,
      introHold: this.introHold,
    };
  }

  play(dt: number) {
    const w = this.world!;
    if (this.cheat.open) { this.r.drawWorld(w, this.hudInfo(), 0); return; }
    if (this.input.pause()) { this.audio.ui('back'); this.scene = 'pause'; this.cursor = 0; this.audio.play('none'); this.audio.sirenOn = false; return; }
    if (this.introHold) {
      this.r.drawWorld(w, this.hudInfo(), dt);
      if (this.sceneT > 0.25 && this.input.anyPressed()) { this.introHold = false; this.acc = 0; this.audio.ui('select'); }
      return;
    }
    for (const p of this.players) w.setInput(p.slot, this.deviceDir(p), this.deviceAct(p));
    this.acc += this.slowmo ? dt / 2 : dt;
    let steps = 0;
    while (this.acc >= TICK && steps < 6) {
      w.update();
      for (const e of w.events) { this.r.handle(e); this.audio.handle(e); }
      w.events.length = 0;
      this.acc -= TICK; steps++;
    }
    if (steps >= 6) this.acc = 0;
    // music state
    this.audio.intensity = w.maze.pelletsTotal ? 1 - w.maze.pelletsLeft / w.maze.pelletsTotal : 0.5;
    this.audio.sirenOn = w.phase === 'play' && !w.cfg.boss;
    this.audio.sirenFright = w.powerT > 0;
    const want = w.phase === 'dying' || w.phase === 'over' ? 'none' : w.powerT > 0 ? 'fright' : w.cfg.boss ? 'boss' : w.phase === 'clear' ? 'none' : 'play';
    this.audio.play(want);
    this.r.drawWorld(w, this.hudInfo(), dt);
    if (w.done) this.finishWorld();
  }

  finishWorld() {
    const w = this.world!;
    if (this.mode === 'run') {
      const run = this.run!;
      run.absorb(w);
      if (w.done === 'clear') {
        if (!run.advance()) {
          const ids: CutsceneId[] = run.twists.evilPac ? ['trueEnding', 'credits'] : ['ending'];
          if (!run.cheated && !this.meta.seenCutscenes.includes('sting')) ids.push('sting');
          this.playCutscenes(ids, () => this.endRun(true));
          return;
        }
        run.openStand();
        this.standMsg = '';
        this.go('stand');
      } else this.endRun(false);
    } else if (this.mode === 'royale') {
      const ranked = [...w.mainPacs].sort((a, b) => (a.state === 'out' ? 1 : 0) - (b.state === 'out' ? 1 : 0) || b.score - a.score);
      this.lastRound = {
        title: `P${ranked[0].player + 1} WINS!`,
        lines: ranked.map((p, i) => [`${i + 1}. P${p.player + 1}${p.state === 'out' ? '  (OUT)' : ''}`, String(p.score)]),
      };
      this.go('versus');
    } else {
      const pac = w.mainPacs[0];
      const pacWon = w.done === 'clear';
      this.squadTotals[pac.player] = (this.squadTotals[pac.player] ?? 0) + pac.score + (pacWon ? 5000 : 0);
      for (const [slot, v] of Object.entries(w.ghostScores)) this.squadTotals[+slot] = (this.squadTotals[+slot] ?? 0) + v;
      this.squadRound++;
      const final = this.squadRound >= this.players.length;
      const ranked = [...this.players].sort((a, b) => (this.squadTotals[b.slot] ?? 0) - (this.squadTotals[a.slot] ?? 0));
      this.lastRound = {
        title: final ? `P${ranked[0].slot + 1} WINS THE SQUAD!` : pacWon ? `PAC P${pac.player + 1} CLEARED IT!` : 'GHOSTS WIN THE ROUND!',
        lines: ranked.map(p => [`P${p.slot + 1}`, String(this.squadTotals[p.slot] ?? 0)]),
      };
      this.go('versus');
    }
  }

  endRun(won: boolean) {
    const run = this.run!;
    run.won = won;
    // cheated runs never touch the save
    const bonus = heatSoulMult(run.heatPoints) * run.mods.soulMult * (1 + 0.15 * perkLevel(this.meta, 'gp_souls'));
    const souls = run.cheated ? 0 : Math.floor(tierSouls(soulsForRun(run.score, run.stagesCleared, run.bossesBeaten, won), run.tier) * bonus);
    const newBest = !run.cheated && run.score > this.meta.best;
    let unlocked: number | null = null;
    if (!run.cheated) {
      this.meta.souls += souls;
      this.meta.best = Math.max(this.meta.best, run.score);
      this.meta.bossesBeaten += run.bossesBeaten;
      if (won) {
        unlocked = recordWin(this.meta, run.tier);
        this.meta.heatBest = Math.max(this.meta.heatBest, run.heatPoints);
        if (!this.meta.seenCutscenes.includes('sting')) this.meta.seenCutscenes.push('sting');
        if (unlocked !== null) this.tier = unlocked;
      }
      saveMeta(this.meta);
    }
    this.resultInfo = { won, souls, newBest, cheated: run.cheated, unlocked };
    this.go('results');
  }

  // ───────────────────────── cheat console ─────────────────────────

  consoleKey(e: KeyboardEvent) {
    const con = this.cheat;
    if (e.code === 'Backquote') {
      e.preventDefault();
      con.open = !con.open; con.text = '';
      this.input.suspended = con.open;
      if (con.open && !con.log.length) con.log.push('TYPE HELP FOR CODES. ` OR ESC TO CLOSE.');
      return;
    }
    if (!con.open) return;
    e.preventDefault();
    if (e.key === 'Escape') { con.open = false; this.input.suspended = false; }
    else if (e.key === 'Enter') {
      if (con.text.trim()) {
        const reply = this.execCheat(con.text);
        // wrap long replies (e.g. id lists) to the panel width, keeping the ? / OK prefix color
        const lines = reply.match(/.{1,78}(\s|$)/g)?.map(l => l.trim()) ?? [reply];
        con.log.push('> ' + con.text.toUpperCase(), ...lines.map((l, i) => (i && reply.startsWith('?') ? '? ' + l : l)));
        con.log = con.log.slice(-6);
      }
      con.text = '';
    } else if (e.key === 'Backspace') con.text = con.text.slice(0, -1);
    else if (e.key.length === 1 && con.text.length < 32) con.text += e.key;
  }

  execCheat(cmd: string): string {
    const inRun = this.mode === 'run' && this.run && ['play', 'pause', 'stand'].includes(this.scene);
    return runCheat(cmd, {
      run: inRun ? this.run : null,
      world: ['play', 'pause'].includes(this.scene) ? this.world : null,
      jumpToStage: i => { this.run!.stage = i; this.startStage(); },
      rebuildStage: () => this.startStage(),
      toggleSlowmo: () => (this.slowmo = !this.slowmo),
      restartAtTier: t => { this.startRun(this.players, undefined, 0, t); this.run!.cheated = true; },
    });
  }

  drawConsole() {
    const c = this.r.ctx, con = this.cheat;
    const h = 150, y0 = VH - h - 10;
    panel(c, 16, y0, VW - 32, h, '#5cff8a', 'rgba(0,10,4,0.94)');
    con.log.forEach((line, i) => text(c, line, 30, y0 + 20 + i * 18, 7, line.startsWith('?') ? '#ff5c7a' : line.startsWith('>') ? '#8f86c9' : '#5cff8a', 'left', 0));
    const cursor = Math.floor(performance.now() / 400) % 2 ? '_' : ' ';
    text(c, '] ' + con.text.toUpperCase() + cursor, 30, y0 + h - 20, 9, '#fff', 'left', 4);
  }

  // ───────────────────────── pause ─────────────────────────

  pause() {
    const c = this.r.ctx;
    if (this.world) this.r.drawWorld(this.world, this.hudInfo(), 0);
    c.save(); c.fillStyle = 'rgba(4,0,14,0.75)'; c.fillRect(0, 0, VW, VH); c.restore();
    text(c, 'PAUSED', VW / 2, 190, 28, '#ffe600', 'center', 16);
    const items = ['RESUME', this.mode === 'run' ? 'ABANDON RUN' : 'QUIT TO TITLE'];
    this.menuNav(items.length);
    items.forEach((s, i) => text(c, (i === this.cursor ? '> ' : '  ') + s, VW / 2, 270 + i * 46, 14, i === this.cursor ? '#fff' : '#8f86c9', 'center', i === this.cursor ? 8 : 0));
    if (this.run && this.mode === 'run') {
      text(c, 'YOUR UPGRADES  (LAST ALL RUN)', VW / 2, 385, 9, '#b45cff', 'center', 4);
      drawUpgradeList(c, this.run.upgrades, 50, 410, VW - 100, VH - 90 - 410);
      text(c, `SEED ${this.run.seedCode}`, VW / 2, VH - 60, 8, '#5a5290', 'center', 0);
    }
    if (this.input.pause() || this.input.back()) { this.resume(); return; }
    if (this.input.confirm()) {
      if (this.cursor === 0) this.resume();
      else if (this.mode === 'run') { this.world!.lives = 0; this.run!.absorb(this.world!); this.endRun(false); }
      else this.go('title');
    }
  }
  resume() { this.scene = 'play'; this.acc = 0; this.audio.play(this.trackFor()); }

  // ───────────────────────── fruit stand ─────────────────────────

  stand() {
    const c = this.r.ctx, run = this.run!;
    this.r.time += 1 / 60;
    const plan = run.current;
    text(c, 'FRUIT STAND', VW / 2, 60, 26, '#5cff8a', 'center', 18);
    text(c, `SCORE ${run.score}   ·   LIVES ${run.lives}`, VW / 2, 105, 10, '#fff', 'center', 4);
    // coins
    c.save(); c.fillStyle = '#ffd23d'; c.shadowColor = '#ffd23d'; c.shadowBlur = 10; c.beginPath(); c.arc(VW / 2 - 40, 132, 7, 0, Math.PI * 2); c.fill(); c.restore();
    text(c, String(run.coins), VW / 2 - 26, 133, 13, '#ffd23d', 'left', 8);
    // next stage preview
    const boss = plan.boss ? BOSS_INFO[plan.boss] : null;
    panel(c, 40, 160, VW - 80, 70, boss ? boss.color : actColor(run.tier, plan.act));
    text(c, `NEXT: ${ACTS[plan.act]} · ${boss ? 'BOSS' : 'STAGE ' + (plan.index + 1) + '/' + (STAGES_PER_ACT - 1)}`, VW / 2, 182, 9, '#fff', 'center', 4);
    const modsTxt = boss ? boss.name : plan.modifiers.length ? plan.modifiers.map(m => MODIFIERS[m].name).join(' + ') : 'NO MODIFIERS';
    text(c, modsTxt, VW / 2, 208, 10, boss ? boss.color : plan.modifiers.length ? MODIFIERS[plan.modifiers[0]].color : '#8fa0ff', 'center', 8);

    const offers = run.offers;
    const n = offers.length;
    const rowShop = this.cursor2 === 1;
    const d = this.input.menuDirEdge;
    if (d === DOWN && !rowShop) { this.cursor2 = 1; this.cursor = 0; this.audio.ui('move'); }
    else if (d === UP && rowShop) { this.cursor2 = 0; this.cursor = 0; this.audio.ui('move'); }
    else this.menuNav(rowShop ? 3 : n, true);

    const cw = Math.min(180, (VW - 60) / n - 12), gap = 12;
    const x0 = (VW - (cw * n + gap * (n - 1))) / 2;
    offers.forEach((u, i) => {
      const x = x0 + i * (cw + gap), y = 260;
      const sel = !rowShop && i === this.cursor;
      const col = RARITY_COLOR[u.rarity];
      const lift = sel ? -8 + Math.sin(this.r.time * 4) * 2 : 0;
      panel(c, x, y + lift, cw, 300, col, sel ? 'rgba(40,20,70,0.95)' : 'rgba(10,6,28,0.9)', sel ? 3 : 1.5);
      text(c, u.rarity.toUpperCase(), x + cw / 2, y + 22 + lift, 7, col, 'center', 4);
      text(c, u.glyph, x + cw / 2, y + 80 + lift, 36, col, 'center', 18);
      wrapText(c, u.name.toUpperCase(), x + cw / 2, y + 140 + lift, cw - 16, 9, '#fff', 15);
      wrapText(c, u.desc, x + cw / 2, y + 190 + lift, cw - 20, 8, '#b8b0e8', 15);
      const owned = run.upgrades[u.id] ?? 0;
      if (owned) text(c, `OWNED ${owned}/${u.max}`, x + cw / 2, y + 280 + lift, 6, '#8fa0ff', 'center', 0);
    });
    const shop = [run.mods.noLives ? 'NO LIVES (HEAT)' : `+1 LIFE  (${run.lifeCost}c)`, run.freeRerollReady ? 'REROLL  (FREE)' : `REROLL  (${run.rerollCost}c)`, 'SKIP  (+15c)'];
    shop.forEach((s, i) => {
      const x = 40 + i * ((VW - 80) / 3), w = (VW - 80) / 3 - 10;
      const sel = rowShop && i === this.cursor;
      panel(c, x, 600, w, 50, sel ? '#ffd23d' : '#5a5290', sel ? 'rgba(60,40,10,0.9)' : 'rgba(10,6,28,0.9)', sel ? 3 : 1.5);
      text(c, s, x + w / 2, 625, 8, sel ? '#ffd23d' : '#8f86c9', 'center', sel ? 6 : 0);
    });
    text(c, this.standMsg || 'PICK ONE UPGRADE TO CONTINUE', VW / 2, 690, 8, this.standMsg ? '#ffd23d' : '#8f86c9', 'center', 0);
    // owned upgrades
    if (Object.keys(run.upgrades).length) {
      drawUpgradeChips(c, run.upgrades, VW / 2, 730);
      text(c, 'TAB / (Y): VIEW YOUR UPGRADES', VW / 2, 758, 6, '#8f86c9', 'center', 0);
    }
    text(c, `SEED ${run.seedCode}`, VW / 2, VH - 30, 7, '#3a3070', 'center', 0);
    if (this.input.upgradesToggle()) { this.standOverlay = !this.standOverlay; this.audio.ui('move'); }
    if (this.standOverlay) {
      c.save(); c.fillStyle = 'rgba(4,0,14,0.97)'; c.fillRect(0, 0, VW, VH); c.restore();
      text(c, 'YOUR UPGRADES', VW / 2, 90, 18, '#b45cff', 'center', 12);
      text(c, 'EVERY UPGRADE LASTS FOR THE REST OF THE RUN', VW / 2, 125, 7, '#8f86c9', 'center', 0);
      drawUpgradeList(c, run.upgrades, 50, 165, VW - 100, VH - 165 - 90);
      text(c, 'TAB / (Y) / ESC TO CLOSE', VW / 2, VH - 50, 8, '#8f86c9', 'center', 0);
      if (this.input.back() || this.input.confirm()) this.standOverlay = false;
      return;
    }

    if (this.input.confirm()) {
      if (!rowShop) {
        const u: UpgradeDef = offers[this.cursor];
        if (!u) return;
        run.take(u);
        this.audio.ui('buy');
        this.nextStage();
      } else if (this.cursor === 0) {
        if (run.buyLife()) { this.audio.ui('buy'); this.standMsg = '+1 LIFE!'; } else { this.audio.ui('deny'); this.standMsg = run.mods.noLives ? 'NO REFUNDS: HEAT RULE' : 'NOT ENOUGH COINS'; }
      } else if (this.cursor === 1) {
        if (run.reroll()) { this.audio.ui('buy'); this.standMsg = 'FRESH FRUIT!'; } else { this.audio.ui('deny'); this.standMsg = 'NOT ENOUGH COINS'; }
      } else {
        run.coins += 15; this.audio.ui('select'); this.nextStage();
      }
    }
  }

  // ───────────────────────── results ─────────────────────────

  results() {
    const c = this.r.ctx, run = this.run!, info = this.resultInfo!;
    this.r.time += 1 / 60;
    const finale = info.won && run.twists.evilPac;
    text(c, finale ? 'YOU BEAT YOURSELF!' : info.won ? 'YOU BEAT THE GLITCH!' : 'GAME OVER', VW / 2, 110, info.won ? 22 : 30, info.won ? '#5cff8a' : '#ff2d55', 'center', 20);
    if (info.won) text(c, finale ? 'THE GLITCH IS GONE. FOR REAL THIS TIME.' : 'NEON CITY IS SAFE... FOR NOW', VW / 2, 150, 9, '#ffe600', 'center', 8);
    if (info.unlocked !== null) text(c, `${tierLabel(info.unlocked)} UNLOCKED`, VW / 2, 180, 10, Math.floor(this.r.time * 3) % 2 ? TIERS[info.unlocked].color : '#fff', 'center', 12);
    const p = run.plan[Math.min(run.stage, run.plan.length - 1)];
    const rows: [string, string][] = [
      ['SCORE', String(run.score) + (info.newBest ? '  NEW BEST!' : '')],
      ['REACHED', info.won ? 'THE END' : `${ACTS[p.act].split(' · ')[0]} · ${p.boss ? 'BOSS' : 'STAGE ' + (p.index + 1)}`],
      ['STAGES CLEARED', String(run.stagesCleared)],
      ['BOSSES BEATEN', String(run.bossesBeaten)],
      ['GHOSTS EATEN', String(run.ghostsEaten)],
      ['FRUITS EATEN', String(run.fruitsEaten)],
      ['BEST COMBO', `x${run.bestCombo}`],
      ['UPGRADES', String(Object.values(run.upgrades).reduce((a, b) => a + b, 0))],
      ['SEED', run.seedCode],
    ];
    panel(c, 70, 200, VW - 140, rows.length * 38 + 30, '#b45cff');
    rows.forEach(([k, v], i) => {
      text(c, k, 100, 232 + i * 38, 10, '#8fa0ff', 'left', 0);
      text(c, v, VW - 100, 232 + i * 38, 10, i === 0 && info.newBest ? '#ffe600' : '#fff', 'right', 4);
    });
    const glow = 0.6 + 0.4 * Math.sin(this.r.time * 4);
    c.save(); c.globalAlpha = glow;
    if (info.cheated) text(c, 'CHEATED · NOT SAVED', VW / 2, 620, 16, '#ff5c7a', 'center', 16);
    else text(c, `+${info.souls} GHOST SOULS`, VW / 2, 620, 16, '#b45cff', 'center', 16);
    c.restore();
    text(c, `TOTAL SOULS: ${this.meta.souls}  ·  SPEND THEM IN THE SOUL SHOP`, VW / 2, 660, 8, '#8f86c9', 'center', 0);
    if (this.sceneT > 1) text(c, 'PRESS ENTER / (A)', VW / 2, 740, 10, Math.floor(this.r.time * 2) % 2 ? '#fff' : '#5a5290', 'center', 0);
    if (this.sceneT > 1 && (this.input.confirm() || this.input.back())) { this.audio.ui('select'); this.go('title'); }
  }

  versusResults() {
    const c = this.r.ctx, info = this.lastRound!;
    this.r.time += 1 / 60;
    const finalSquad = this.mode === 'squad' && this.squadRound >= this.players.length;
    text(c, info.title, VW / 2, 140, 18, '#ffe600', 'center', 16);
    text(c, this.mode === 'royale' ? 'CHOMP ROYALE RESULTS' : finalSquad ? 'FINAL STANDINGS' : `AFTER ROUND ${this.squadRound} OF ${this.players.length}`, VW / 2, 190, 9, '#8fa0ff', 'center', 4);
    panel(c, 100, 230, VW - 200, info.lines.length * 50 + 30, '#5ce1ff');
    info.lines.forEach(([k, v], i) => {
      text(c, k, 130, 265 + i * 50, 13, '#fff', 'left', 4);
      text(c, v, VW - 130, 265 + i * 50, 13, '#ffe600', 'right', 4);
    });
    const next = this.mode === 'squad' && !finalSquad ? 'ENTER: NEXT ROUND' : 'ENTER: REMATCH   ·   ESC: TITLE';
    if (this.sceneT > 1) text(c, next, VW / 2, 640, 10, Math.floor(this.r.time * 2) % 2 ? '#fff' : '#5a5290', 'center', 0);
    if (this.sceneT < 1) return;
    if (this.input.confirm()) {
      this.audio.ui('select');
      if (this.mode === 'royale') this.startRoyale();
      else if (!finalSquad) this.startSquad();
      else { this.squadRound = 0; this.squadTotals = {}; this.startSquad(); }
    } else if (this.input.back()) { this.audio.ui('back'); this.go('title'); }
  }

  // ───────────────────────── soul shop ─────────────────────────

  metaShop() {
    const c = this.r.ctx, m = this.meta;
    text(c, 'SOUL SHOP', VW / 2, 70, 24, '#b45cff', 'center', 16);
    text(c, `GHOST SOULS: ${m.souls}`, VW / 2, 112, 11, '#fff', 'center', 6);
    const items = META_ITEMS.filter(it => (it.minTier ?? 0) <= m.tierUnlocked);
    this.menuNav(items.length + 1);
    const ROWS = 13, top = Math.max(0, Math.min(this.cursor - 6, items.length - ROWS));
    if (top > 0) text(c, '▲', VW / 2, 134, 8, '#8f86c9', 'center', 0);
    if (top + ROWS < items.length) text(c, '▼', VW / 2, 150 + ROWS * 44 - 14, 8, '#8f86c9', 'center', 0);
    items.forEach((it, i) => {
      if (i < top || i >= top + ROWS) return;
      const lvl = it.kind === 'fruit' ? (m.unlockedFruits.includes(it.fruit!) ? 1 : 0) : it.kind === 'skin' ? (m.perks[it.id] ?? 0) : perkLevel(m, it.id);
      const maxed = lvl >= it.max;
      const heatLocked = !lvl && (it.minHeat ?? 0) > m.heatBest;
      const sel = i === this.cursor;
      const y = 150 + (i - top) * 44;
      if (sel) panel(c, 30, y - 18, VW - 60, 38, '#b45cff', 'rgba(40,20,70,0.8)');
      if (it.kind === 'fruit') drawFruit(c, it.fruit!, 58, y, 10, this.r.time);
      else if (it.kind === 'skin') drawPac(c, 58, y, 10, RIGHT, 0.2, it.color!, 8);
      else text(c, '✦', 58, y, 12, '#b45cff', 'center', 6);
      text(c, it.name.toUpperCase() + (it.max > 1 ? ` ${lvl}/${it.max}` : ''), 80, y - 6, 9, maxed ? '#5cff8a' : '#fff', 'left', 0);
      text(c, it.desc, 80, y + 9, 6, '#8f86c9', 'left', 0);
      const equipped = it.kind === 'skin' && m.skin === it.color;
      const label = it.kind === 'skin' && lvl ? (equipped ? 'EQUIPPED' : 'EQUIP') : maxed ? 'OWNED' : heatLocked ? `HEAT ${it.minHeat}` : it.cost(lvl) ? `${it.cost(lvl)} SOULS` : 'FREE';
      text(c, label, VW - 50, y, 9, maxed && !(it.kind === 'skin') ? '#5cff8a' : m.souls >= it.cost(lvl) || (it.kind === 'skin' && lvl) ? '#ffe600' : '#5a5290', 'right', 0);
    });
    const backSel = this.cursor === items.length;
    text(c, (backSel ? '> ' : '') + 'BACK', VW / 2, 150 + Math.min(items.length, ROWS) * 44 + 10, 12, backSel ? '#fff' : '#8f86c9', 'center', 0);
    if (this.input.back()) { this.audio.ui('back'); this.go('title'); return; }
    if (!this.input.confirm()) return;
    if (backSel) { this.audio.ui('back'); this.go('title'); return; }
    const it = items[this.cursor];
    const lvl = it.kind === 'fruit' ? (m.unlockedFruits.includes(it.fruit!) ? 1 : 0) : (m.perks[it.id] ?? 0);
    if (it.kind === 'skin' && lvl) { m.skin = it.color!; saveMeta(m); this.audio.ui('select'); return; }
    if (lvl >= it.max) { this.audio.ui('deny'); return; }
    if ((it.minHeat ?? 0) > m.heatBest) { this.audio.ui('deny'); this.say(`CLEAR A RUN AT HEAT ${it.minHeat}`); return; }
    const cost = it.cost(lvl);
    if (m.souls < cost) { this.audio.ui('deny'); this.say('NOT ENOUGH SOULS'); return; }
    m.souls -= cost;
    if (it.kind === 'fruit') m.unlockedFruits.push(it.fruit!);
    else m.perks[it.id] = lvl + 1;
    if (it.kind === 'skin') m.skin = it.color!;
    saveMeta(m);
    this.audio.ui('buy');
    this.say('UNLOCKED!');
  }

  // ───────────────────────── settings ─────────────────────────

  settingsScene() {
    const c = this.r.ctx, s = this.meta.settings;
    text(c, 'SETTINGS', VW / 2, 90, 24, '#5ce1ff', 'center', 16);
    const rows: [string, string][] = [
      ['BLOOM', ['OFF', 'LOW', 'HIGH'][s.bloom]],
      ['CRT SCANLINES', s.crt ? 'ON' : 'OFF'],
      ['SCREEN SHAKE', s.shake ? 'ON' : 'OFF'],
      ['MUSIC', `${Math.round(s.music * 10)}`],
      ['SOUND FX', `${Math.round(s.sfx * 10)}`],
      ['RESET PROGRESS', this.cursor2 ? 'PRESS AGAIN!' : '...'],
      ['BACK', ''],
    ];
    this.menuNav(rows.length);
    rows.forEach(([k, v], i) => {
      const sel = i === this.cursor, y = 200 + i * 56;
      if (sel) panel(c, 80, y - 20, VW - 160, 40, '#5ce1ff', 'rgba(20,40,70,0.7)');
      text(c, k, 110, y, 11, sel ? '#fff' : '#8f86c9', 'left', 0);
      text(c, v ? `< ${v} >` : '', VW - 110, y, 11, i === 5 && this.cursor2 ? '#ff2d55' : '#ffe600', 'right', 4);
    });
    text(c, 'LEFT / RIGHT TO CHANGE', VW / 2, 640, 8, '#5a5290', 'center', 0);
    const d = this.input.menuDirEdge;
    const delta = d === LEFT ? -1 : d === RIGHT ? 1 : this.input.confirm() ? 1 : 0;
    if (this.cursor !== 5) this.cursor2 = 0;
    if (delta) {
      switch (this.cursor) {
        case 0: s.bloom = (s.bloom + delta + 3) % 3; break;
        case 1: s.crt = !s.crt; break;
        case 2: s.shake = !s.shake; break;
        case 3: s.music = Math.max(0, Math.min(1, Math.round((s.music + delta * 0.1) * 10) / 10)); break;
        case 4: s.sfx = Math.max(0, Math.min(1, Math.round((s.sfx + delta * 0.1) * 10) / 10)); break;
        case 5:
          if (this.input.confirm()) {
            if (this.cursor2) { const keep = this.meta.settings; this.meta = { ...defaultMeta(), settings: keep }; this.tier = 0; this.cursor2 = 0; this.say('PROGRESS RESET'); }
            else this.cursor2 = 1;
          }
          break;
        case 6: if (this.input.confirm()) { saveMeta(this.meta); this.go('title'); return; } break;
      }
      if (this.cursor < 5) this.audio.ui('move');
      this.applySettings(); saveMeta(this.meta);
    }
    if (this.input.back()) { saveMeta(this.meta); this.audio.ui('back'); this.go('title'); }
  }

  // ───────────────────────── help ─────────────────────────

  help() {
    const c = this.r.ctx;
    this.r.time += 1 / 60;
    const pages = 2;
    const d = this.input.menuDirEdge;
    if (d === RIGHT || d === DOWN) this.cursor = Math.min(pages - 1, this.cursor + 1);
    if (d === LEFT || d === UP) this.cursor = Math.max(0, this.cursor - 1);
    if (this.cursor === 0) {
      text(c, 'HOW TO PLAY', VW / 2, 60, 20, '#ffe600', 'center', 14);
      const lines: [string, string][] = [
        ['MOVE', 'ARROWS / WASD / D-PAD / STICK'],
        ['ACTION', 'SPACE / ENTER / (A)  (DASH)'],
        ['PAUSE', 'ESC / P / START'],
        ['MUTE', 'M'],
      ];
      lines.forEach(([k, v], i) => { text(c, k, 80, 120 + i * 30, 10, '#5ce1ff', 'left', 0); text(c, v, VW - 80, 120 + i * 30, 8, '#fff', 'right', 0); });
      const para = [
        'Eat every pellet to clear a maze. Power pellets let you eat ghosts. Chain them for huge combos.',
        'A run is 3 acts of 4 mazes and a boss. After each maze, pick one upgrade at the Fruit Stand. Curses are risky but pay out big.',
        'Coins come from ghosts, fruit and clears. Spend them at the Fruit Stand on lives and rerolls.',
        'Ghost Souls come from every run, win or lose. Spend them in the Soul Shop to unlock fruits, perks and skins.',
        'Later mazes add modifiers and elite ghosts: SPEEDY (streaks), SHIELDED (needs 2 hits), SPLITTER (cracks in two).',
      ];
      let y = 270;
      for (const p of para) y += wrapText(c, p, VW / 2, y, VW - 100, 8, '#c8c0f0', 16) + 16;
      const gy = 690;
      [['BLINKY', '#ff2d55', 'CHASES YOU'], ['PINKY', '#ff8cf0', 'AMBUSHES'], ['INKY', '#2de2ff', 'FLANKS'], ['CLYDE', '#ffab2d', 'IS... CLYDE']].forEach(([n, col, d2], i) => {
        const x = 90 + i * 165;
        drawGhost(c, x, gy, 14, col, DOWN, { t: this.r.time + i });
        text(c, n, x, gy + 30, 8, col, 'center', 4);
        text(c, d2, x, gy + 46, 6, '#8f86c9', 'center', 0);
      });
    } else {
      text(c, 'FRUIT POWERS', VW / 2, 60, 20, '#ff2a55', 'center', 14);
      FRUIT_IDS.forEach((id, i) => {
        const f = FRUITS[id];
        const y = 115 + i * 54;
        drawFruit(c, id, 60, y, 14, this.r.time);
        const locked = f.locked && !this.meta.unlockedFruits.includes(id);
        text(c, `${f.name.toUpperCase()} · ${f.power}${locked ? '  (LOCKED)' : ''}`, 95, y - 8, 9, locked ? '#5a5290' : f.color, 'left', 4);
        text(c, f.desc, 95, y + 10, 6, '#c8c0f0', 'left', 0);
      });
    }
    text(c, `PAGE ${this.cursor + 1}/${pages}  ·  LEFT/RIGHT  ·  ESC TO GO BACK`, VW / 2, VH - 26, 7, '#5a5290', 'center', 0);
    if (this.input.back() || (this.input.confirm() && this.cursor === pages - 1)) { this.audio.ui('back'); this.go('title'); }
    else if (this.input.confirm()) this.cursor++;
  }
}

void T;
const start = () => new Game();
if (document.fonts?.load) document.fonts.load('16px "Press Start 2P"').finally(start);
else start();
