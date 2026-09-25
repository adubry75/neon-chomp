/** Small seeded PRNG (mulberry32). Everything random in the sim goes through this. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, t) => s + weight(t), 0);
    let r = this.next() * total;
    for (const t of items) { r -= weight(t); if (r <= 0) return t; }
    return items[items.length - 1];
  }
  fork(): Rng { return new Rng(Math.floor(this.next() * 4294967296)); }
}

export const hashSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
