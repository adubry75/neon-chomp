import { describe, expect, it } from 'vitest';
import { classicMaze } from '../src/data/mazes';
import { chaseTarget, chooseDir, SCATTER } from '../src/sim/ghostAI';
import { advance, nextCenterAhead, tryCorner } from '../src/sim/movement';
import { DOWN, LEFT, NONE, RIGHT, UP } from '../src/sim/types';
import { generateMaze, validateMaze } from '../src/sim/mazegen';
import { World, type StageConfig } from '../src/sim/world';
import { defaultMods } from '../src/sim/mods';
import { Rng } from '../src/sim/rng';
import { FRUIT_IDS } from '../src/data/fruits';
import { EVIL_PHASES, trailPoint } from '../src/sim/bosses/evil';

describe('classic maze', () => {
  it('parses with arcade pellet count', () => {
    const m = classicMaze();
    expect(m.w).toBe(28); expect(m.h).toBe(31);
    expect(m.pelletsTotal).toBe(244);
    expect(m.powerSpots.length).toBe(4);
  });
  it('passes validation (except symmetry-agnostic rules)', () => {
    const r = validateMaze(classicMaze());
    expect(r.ok, r.reason).toBe(true);
  });
  it('wraps through the tunnel', () => {
    const m = classicMaze();
    expect(m.walkable(-1, 14, 'pac')).toBe(true);
    expect(m.walkable(28, 14, 'pac')).toBe(true);
    expect(m.isTunnel(2, 14)).toBe(true);
  });
});

describe('ghost targeting', () => {
  const pac = { tx: 10, ty: 20, dir: 3 as const };
  it('blinky targets pac tile', () => {
    expect(chaseTarget('blinky', pac, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });
  it('pinky targets 4 ahead', () => {
    expect(chaseTarget('pinky', pac, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 14, y: 20 });
  });
  it('pinky has the arcade up-overflow bug', () => {
    expect(chaseTarget('pinky', { ...pac, dir: UP }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 6, y: 16 });
  });
  it('inky doubles the vector from blinky through 2-ahead', () => {
    // 2 ahead = (12,20); blinky at (8,18) → target (16,22)
    expect(chaseTarget('inky', pac, { x: 0, y: 0 }, { x: 8, y: 18 })).toEqual({ x: 16, y: 22 });
  });
  it('clyde retreats when within 8 tiles', () => {
    expect(chaseTarget('clyde', pac, { x: 12, y: 20 }, { x: 0, y: 0 })).toEqual(SCATTER.clyde);
    expect(chaseTarget('clyde', pac, { x: 25, y: 5 }, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });
  it('never reverses and breaks ties up > left > down > right', () => {
    const m = classicMaze();
    // tile (6,5) is a 4-way junction. Coming from the right (moving LEFT), target straight below-left, equidistant
    const d = chooseDir(m, 6, 5, LEFT, { x: 6, y: 5 }, 'ghost', null, false);
    expect(d).not.toBe(RIGHT);
    expect(d).toBe(UP); // all options at distance 1 → up wins
  });
});

describe('movement', () => {
  it('finds next center strictly ahead', () => {
    expect(nextCenterAhead(13.5, 1)).toBe(14.5);
    expect(nextCenterAhead(14.0, 1)).toBe(14.5);
    expect(nextCenterAhead(14.0, -1)).toBe(13.5);
    expect(nextCenterAhead(13.5, -1)).toBe(12.5);
  });
  it('stops at walls and turns at centers', () => {
    const m = classicMaze();
    const a = { x: 1.5, y: 1.5, dir: RIGHT as 0 | 1 | 2 | 3 | -1 };
    // corridor row 1 runs to x=12; walk far right, should stop at 12.5
    advance(a, 20, m.w, mv => (m.canGo(Math.floor(mv.x), Math.floor(mv.y), mv.dir, 'pac') ? mv.dir : NONE));
    expect(a.x).toBe(12.5);
  });
  it('corners early when input comes just before a junction', () => {
    const m = classicMaze();
    const a = { x: 6.25, y: 5.5, dir: RIGHT as 0 | 1 | 2 | 3 | -1 };
    expect(tryCorner(a, DOWN, m)).toBe(true);
    expect(a.x).toBe(6.5); expect(a.dir).toBe(DOWN);
  });
});

describe('procedural mazes', () => {
  it('1000 generated mazes are all valid', () => {
    for (let s = 1; s <= 1000; s++) {
      const m = generateMaze(s * 7919);
      const r = validateMaze(m);
      expect(r.ok, `seed ${s}: ${r.reason}`).toBe(true);
    }
  });
});

const cfg = (seed: number): StageConfig => ({
  mode: 'run', maze: classicMaze(), level: 3, mods: defaultMods(), modifiers: [], boss: null,
  players: [{ slot: 0, color: '#ffe600' }], seed, fruitPool: [...FRUIT_IDS], lives: 2, scoreBase: 0,
});

function simulate(seed: number, ticks: number, c = cfg(seed)) {
  const w = new World(c);
  const rng = new Rng(seed ^ 0xabc);
  let dir = LEFT as 0 | 1 | 2 | 3;
  for (let i = 0; i < ticks && !w.done; i++) {
    if (i % 20 === 0) dir = rng.int(4) as 0 | 1 | 2 | 3;
    w.setInput(0, dir, i % 90 === 0);
    w.update();
    w.events.length = 0;
  }
  return w;
}

describe('world', () => {
  it('is deterministic for a seed + input stream', () => {
    const a = simulate(42, 5000), b = simulate(42, 5000);
    expect(a.score).toBe(b.score);
    expect(a.pacs[0]?.x).toBe(b.pacs[0]?.x);
    expect(a.lives).toBe(b.lives);
  });
  it('eats pellets and ghosts eventually catch a random walker', () => {
    const w = simulate(7, 8000);
    expect(w.score).toBeGreaterThan(0);
    expect(w.dotsEaten).toBeGreaterThan(10);
  });
  it('runs every modifier and boss without throwing', () => {
    const mods = ['blackout', 'ice', 'conveyor', 'teleport', 'gates', 'mirror', 'ghostTrain'] as const;
    for (const mod of mods) simulate(3, 3000, { ...cfg(3), maze: generateMaze(99), modifiers: [mod] });
    for (const boss of ['mega', 'train', 'eater', 'evil'] as const) simulate(5, 4000, { ...cfg(5), boss });
    simulate(9, 4000, { ...cfg(9), mode: 'royale', players: [0, 1, 2, 3].map(s => ({ slot: s, color: '#fff' })) });
    simulate(9, 4000, { ...cfg(9), mode: 'squad', squadPac: 0, ghostPlayers: [1, 2], players: [0, 1, 2].map(s => ({ slot: s, color: '#fff' })) });
  });
  it('every fruit effect applies cleanly', () => {
    for (const id of FRUIT_IDS) {
      const w = new World(cfg(11));
      w.phase = 'play';
      w.applyFruit(w.pacs[0], id);
      for (let i = 0; i < 900; i++) { w.setInput(0, [UP, LEFT, DOWN, RIGHT][(i / 30 | 0) % 4] as 0, i % 40 === 0); w.update(); }
    }
  });
  it('clears the classic maze when all pellets are gone', () => {
    const w = new World(cfg(1));
    w.phase = 'play';
    for (let i = 0; i < w.maze.items.length; i++) w.maze.items[i] = 0;
    w.maze.pelletsLeft = 0;
    w.update();
    expect(w.phase).toBe('clear');
  });
});

describe('bosses are beatable', () => {
  const boot = (boss: 'mega' | 'train' | 'eater') => {
    const w = new World({ ...cfg(21), boss });
    w.phase = 'play';
    return w;
  };
  it('mega blinky goes down after 4 powered hits', () => {
    const w = boot('mega');
    for (let hit = 0; hit < 4; hit++) {
      for (let i = 0; i < 120; i++) w.update();
      w.mega!.invulnT = 0; w.powerT = 5;
      const p = w.pacs[0]; p.x = w.mega!.x; p.y = w.mega!.y; p.state = 'alive';
      w.update();
    }
    expect(w.bossDefeated).toBe(true);
  });
  it('train king falls after its cars are eaten', () => {
    const w = boot('train');
    for (let i = 0; i < 600; i++) w.update();
    for (let k = 0; k < 60 && w.cars.some(c => c.alive); k++) { const c = w.cars.find(c => c.alive)!; w.phase = 'play'; w.hitStop = 0; w.powerT = 5; const p = w.pacs[0]; p.state = 'alive'; p.x = c.x; p.y = c.y; p.invulnT = 1; w.update(); }
    const king = w.ghosts.find(g => g.king)!;
    w.phase = 'play'; w.hitStop = 0; w.powerT = 5; king.fright = true; w.pacs[0].state = 'alive';
    const p = w.pacs[0]; p.x = king.x; p.y = king.y; w.update();
    expect(w.cars.filter(c => c.alive).length).toBe(0);
    expect(w.bossDefeated).toBe(true);
  });
  it('maze eater dies after 3 cores', () => {
    const w = boot('eater');
    for (let k = 0; k < 3; k++) {
      const i = w.maze.items.indexOf(4);
      expect(i).toBeGreaterThanOrEqual(0);
      w.phase = 'play'; w.hitStop = 0; const p = w.pacs[0]; p.state = 'alive'; p.x = (i % w.maze.w) + 0.5; p.y = Math.floor(i / w.maze.w) + 0.5; p.invulnT = 5;
      w.update();
    }
    expect(w.bossDefeated).toBe(true);
  });
});

describe('ice', () => {
  // Classic maze row 5 is one long corridor. Tile (6,5) is a 4-way junction,
  // tile (7,5) has no side exits, and (1,5) is the next place to turn down.
  const iceWorld = (x: number) => {
    const w = new World({ ...cfg(4), modifiers: ['ice'] });
    w.phase = 'play';
    const p = w.pacs[0];
    p.x = x; p.y = 5.5; p.dir = LEFT; p.desired = LEFT; p.invulnT = 99;
    return w;
  };
  const hold = (w: World, dir: 0 | 1 | 2 | 3, ticks: number) => {
    for (let i = 0; i < ticks; i++) { w.setInput(0, dir, false); w.update(); }
  };
  it('turns when the turn is pressed a tile before the junction', () => {
    const w = iceWorld(7.5);
    hold(w, DOWN, 20);
    expect(w.pacs[0].x).toBe(6.5);
    expect(w.pacs[0].y).toBeGreaterThan(6);
  });
  it('slides past when pressed less than half a tile early, then takes the next opening', () => {
    const w = iceWorld(6.8);
    hold(w, DOWN, 10);
    expect(w.pacs[0].x).toBeLessThan(6.5);
    expect(w.pacs[0].y).toBe(5.5);
    hold(w, DOWN, 60);
    expect(w.pacs[0].x).toBe(1.5);
    expect(w.pacs[0].y).toBeGreaterThan(5.5);
  });
  it('reverses instantly', () => {
    const w = iceWorld(9.5);
    hold(w, LEFT, 3);
    hold(w, RIGHT, 1);
    expect(w.pacs[0].dir).toBe(RIGHT);
  });
});

describe('evil pac', () => {
  const boot = (seed = 31) => {
    const w = new World({ ...cfg(seed), maze: generateMaze(777), boss: 'evil', level: 16 });
    w.phase = 'play';
    return w;
  };
  /** Walk P1 around with a changing held direction. */
  const walk = (w: World, ticks: number, seed = 5) => {
    const rng = new Rng(seed);
    let dir = LEFT as 0 | 1 | 2 | 3;
    for (let i = 0; i < ticks; i++) {
      if (i % 25 === 0) dir = rng.int(4) as 0 | 1 | 2 | 3;
      w.setInput(0, dir, false);
      w.pacs[0].invulnT = 1; // keep P1 alive so the trail keeps growing
      w.update();
    }
  };
  it('waits off-trail, then follows P1 exactly `delay` seconds behind', () => {
    const w = boot();
    expect(w.evil!.mode).toBe('gone');
    walk(w, 60);
    expect(w.evil!.mode).toBe('gone'); // trail is only 1s long
    walk(w, 240);
    const b = w.evil!;
    expect(b.mode).toBe('follow');
    expect(b.delay).toBeLessThan(EVIL_PHASES[0].delay); // closing in
    expect(b.delay).toBeGreaterThanOrEqual(EVIL_PHASES[0].min);
    const pt = trailPoint(w, b.delay)!;
    expect(b.x).toBe(pt.x); expect(b.y).toBe(pt.y);
  });
  it('flees from a powered Pac and loses a phase when caught', () => {
    const w = boot();
    walk(w, 300);
    w.cheatPower(); w.update();
    const b = w.evil!;
    expect(b.mode).toBe('flee');
    const p = w.pacs[0]; p.x = b.x; p.y = b.y;
    w.update();
    expect(b.hp).toBe(2);
    expect(b.phase).toBe(1);
    expect(b.mode).toBe('gone');
    expect(w.ghosts.some(g => g.kind === 'blinky')).toBe(true);
  });
  it('does not flee again on the same power pellet after a hit', () => {
    const w = boot();
    walk(w, 300);
    w.cheatPower(); w.update();
    const b = w.evil!;
    w.pacs[0].x = b.x; w.pacs[0].y = b.y; w.update();
    w.powerT = 60; // power still running
    walk(w, 200);
    expect(b.mode).toBe('follow');
  });
  it('goes down after 3 hits', () => {
    const w = boot();
    for (let k = 0; k < 3; k++) {
      w.powerT = 0; w.hitStop = 0;
      walk(w, 320, k + 1);
      expect(w.evil!.mode).toBe('follow');
      w.cheatPower(); w.hitStop = 0; w.update();
      const b = w.evil!, p = w.pacs[0];
      p.x = b.x; p.y = b.y; p.state = 'alive'; w.hitStop = 0; w.update();
    }
    expect(w.evil!.hp).toBe(0);
    expect(w.bossDefeated).toBe(true);
  });
  it('is deterministic', () => {
    const run = () => simulate(8, 4000, { ...cfg(8), maze: generateMaze(55), boss: 'evil', level: 16 });
    const a = run(), b = run();
    expect(a.score).toBe(b.score);
    expect(a.evil!.x).toBe(b.evil!.x);
    expect(a.lives).toBe(b.lives);
  });
});
