import { DX, DY, type Dir, type Vec } from './types';

export const T_OPEN = 0, T_WALL = 1, T_DOOR = 2, T_HOUSE = 3, T_VOID = 4;
export const I_NONE = 0, I_PELLET = 1, I_POWER = 2, I_COIN = 3, I_CORE = 4;

export type Walker = 'pac' | 'ghost' | 'eyes';

/**
 * Tile map. Coordinates: tile (tx,ty) has its center at (tx+0.5, ty+0.5).
 * Rows are bounded; columns wrap (tunnels).
 */
export class Maze {
  readonly w: number;
  readonly h: number;
  terrain: Uint8Array;
  items: Uint8Array;
  tunnel: Uint8Array;
  noUp = new Set<number>();
  pacStart: Vec = { x: 14, y: 23.5 };
  fruitSpot: Vec = { x: 14, y: 17.5 };
  houseExit: Vec = { x: 14, y: 11.5 };
  houseCenter: Vec = { x: 14, y: 14.5 };
  /** Power pellet tiles, remembered so boss stages can respawn them. */
  powerSpots: Vec[] = [];
  pelletsTotal = 0;
  pelletsLeft = 0;
  name = 'Maze';

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.terrain = new Uint8Array(w * h).fill(T_WALL);
    this.items = new Uint8Array(w * h);
    this.tunnel = new Uint8Array(w * h);
  }

  idx(tx: number, ty: number) { return ty * this.w + this.wrapX(tx); }
  wrapX(tx: number) { return ((tx % this.w) + this.w) % this.w; }

  terrainAt(tx: number, ty: number): number {
    if (ty < 0 || ty >= this.h) return T_WALL;
    return this.terrain[this.idx(tx, ty)];
  }
  itemAt(tx: number, ty: number): number {
    if (ty < 0 || ty >= this.h) return I_NONE;
    return this.items[this.idx(tx, ty)];
  }
  setItem(tx: number, ty: number, v: number) {
    if (ty < 0 || ty >= this.h) return;
    this.items[this.idx(tx, ty)] = v;
  }
  isTunnel(tx: number, ty: number) { return ty >= 0 && ty < this.h && this.tunnel[this.idx(tx, ty)] === 1; }

  walkable(tx: number, ty: number, who: Walker): boolean {
    const t = this.terrainAt(tx, ty);
    if (t === T_OPEN) return true;
    if (who === 'eyes') return t === T_DOOR || t === T_HOUSE;
    return false;
  }
  canGo(tx: number, ty: number, d: Dir, who: Walker): boolean {
    if (d < 0) return false;
    return this.walkable(tx + DX[d], ty + DY[d], who);
  }
  /** Is the wall/void tile solid for rendering neighbour checks. */
  isWallish(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) return false;
    const t = this.terrain[ty * this.w + tx];
    return t === T_WALL;
  }

  countPellets() {
    let n = 0;
    for (const it of this.items) if (it === I_PELLET || it === I_POWER) n++;
    this.pelletsTotal = this.pelletsLeft = n;
  }

  openTiles(): Vec[] {
    const out: Vec[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.terrain[y * this.w + x] === T_OPEN) out.push({ x, y });
    return out;
  }

  clone(): Maze {
    const m = new Maze(this.w, this.h);
    m.terrain = this.terrain.slice(); m.items = this.items.slice(); m.tunnel = this.tunnel.slice();
    m.noUp = new Set(this.noUp);
    m.pacStart = { ...this.pacStart }; m.fruitSpot = { ...this.fruitSpot };
    m.houseExit = { ...this.houseExit }; m.houseCenter = { ...this.houseCenter };
    m.powerSpots = this.powerSpots.map(p => ({ ...p }));
    m.pelletsTotal = this.pelletsTotal; m.pelletsLeft = this.pelletsLeft; m.name = this.name;
    return m;
  }

  /** Mark tunnel tiles: open tiles on rows that wrap, within `depth` of either edge. */
  markTunnels(depth = 6) {
    for (let y = 0; y < this.h; y++) {
      if (this.terrainAt(0, y) !== T_OPEN || this.terrainAt(this.w - 1, y) !== T_OPEN) continue;
      for (let x = 0; x < this.w; x++) {
        if ((x < depth || x >= this.w - depth) && this.terrainAt(x, y) === T_OPEN) this.tunnel[y * this.w + x] = 1;
      }
    }
  }

  /**
   * ASCII legend: '#' wall, '.' pellet, 'o' power pellet, ' ' open (no pellet),
   * 'X' void (solid, not drawn), '-' ghost-house door, 'H' ghost-house interior.
   */
  static parse(rows: string[], name = 'Maze'): Maze {
    const h = rows.length, w = rows[0].length;
    const m = new Maze(w, h);
    m.name = name;
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error(`row ${y} has width ${rows[y].length}, expected ${w}`);
      for (let x = 0; x < w; x++) {
        const c = rows[y][x], i = y * w + x;
        switch (c) {
          case '#': m.terrain[i] = T_WALL; break;
          case 'X': m.terrain[i] = T_VOID; break;
          case '-': m.terrain[i] = T_DOOR; break;
          case 'H': m.terrain[i] = T_HOUSE; break;
          case '.': m.terrain[i] = T_OPEN; m.items[i] = I_PELLET; break;
          case 'o': m.terrain[i] = T_OPEN; m.items[i] = I_POWER; m.powerSpots.push({ x, y }); break;
          default: m.terrain[i] = T_OPEN;
        }
      }
    }
    m.markTunnels();
    m.countPellets();
    return m;
  }
}
