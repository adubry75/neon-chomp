export type FruitId =
  | 'cherry' | 'strawberry' | 'orange' | 'apple' | 'melon' | 'bell'
  | 'key' | 'pineapple' | 'banana' | 'grapes' | 'chili' | 'rainbow';

export interface FruitDef {
  id: FruitId;
  name: string;
  power: string;
  desc: string;
  points: number;
  /** Seconds the effect lasts (0 = instant). */
  duration: number;
  color: string;
  leaf: string;
  weight: number;
  /** Must be unlocked via meta-progression before it can spawn. */
  locked?: boolean;
}

export const FRUITS: Record<FruitId, FruitDef> = {
  cherry:     { id: 'cherry', name: 'Cherry', power: 'TURBO', desc: '+40% speed. Your trail pays out bonus points.', points: 100, duration: 6, color: '#ff2a55', leaf: '#3dff8a', weight: 10 },
  strawberry: { id: 'strawberry', name: 'Strawberry', power: 'SPLIT-PAC', desc: 'A mirror clone copies your moves, flipped.', points: 300, duration: 10, color: '#ff3d6e', leaf: '#3dff8a', weight: 8 },
  orange:     { id: 'orange', name: 'Orange', power: 'FREEZE', desc: 'Ghosts turn to ice. Bump them to shatter.', points: 500, duration: 4.5, color: '#ff9a1f', leaf: '#3dff8a', weight: 8 },
  apple:      { id: 'apple', name: 'Apple', power: 'MAGNET', desc: 'Pellets within 4 tiles fly into your mouth.', points: 700, duration: 8, color: '#ff4040', leaf: '#3dff8a', weight: 9 },
  melon:      { id: 'melon', name: 'Melon', power: 'GIANT PAC', desc: '3x size. Stomp ghosts. Chomp everything.', points: 1000, duration: 7, color: '#6dff6d', leaf: '#1c8f3c', weight: 6 },
  bell:       { id: 'bell', name: 'Bell', power: 'SHOCKWAVE', desc: 'Every ghost is stunned and flung into retreat.', points: 2000, duration: 0, color: '#ffe45c', leaf: '#5ce1ff', weight: 7 },
  key:        { id: 'key', name: 'Key', power: 'VAULT', desc: 'Unlocks the vault: coins rain into the maze.', points: 3000, duration: 0, color: '#7fd8ff', leaf: '#ffffff', weight: 5, locked: true },
  pineapple:  { id: 'pineapple', name: 'Pineapple', power: 'DASH', desc: '3 dash charges (action button). Invincible while dashing.', points: 1500, duration: 12, color: '#ffd23d', leaf: '#3dff8a', weight: 7, locked: true },
  banana:     { id: 'banana', name: 'Banana', power: 'PEEL TRAP', desc: 'Drop peels behind you. Ghosts spin out.', points: 800, duration: 10, color: '#fff05c', leaf: '#8a6d1c', weight: 7, locked: true },
  grapes:     { id: 'grapes', name: 'Grapes', power: 'SWARM', desc: '3 mini-Pacs hunt pellets for you.', points: 1200, duration: 7, color: '#b04dff', leaf: '#3dff8a', weight: 6, locked: true },
  chili:      { id: 'chili', name: 'Chili', power: 'FIRE TRAIL', desc: 'Your path burns. Ghosts that touch it get torched.', points: 1600, duration: 6, color: '#ff3b1f', leaf: '#3dff8a', weight: 6, locked: true },
  rainbow:    { id: 'rainbow', name: 'Rainbow Fruit', power: 'PAC-FRENZY', desc: 'All ghosts frightened 10s. Pellets worth 5x.', points: 5000, duration: 10, color: '#ffffff', leaf: '#ff5cf0', weight: 1.2 },
};

export const FRUIT_IDS = Object.keys(FRUITS) as FruitId[];
