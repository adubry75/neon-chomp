// Directions. Order matters: it is the arcade tie-break order (up > left > down > right).
export const UP = 0, LEFT = 1, DOWN = 2, RIGHT = 3, NONE = -1;
export type Dir = -1 | 0 | 1 | 2 | 3;
export const DX: readonly number[] = [0, -1, 0, 1];
export const DY: readonly number[] = [-1, 0, 1, 0];
export const DIRS: readonly Dir[] = [UP, LEFT, DOWN, RIGHT];
export const opposite = (d: Dir): Dir => (d === NONE ? NONE : (((d + 2) % 4) as Dir));
export const isHorizontal = (d: Dir) => d === LEFT || d === RIGHT;

export const TICK = 1 / 60;
/** Arcade "100%" speed in tiles per second (1.25 px/frame on 8px tiles). */
export const BASE_SPEED = 9.47;

export interface Vec { x: number; y: number }

export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
