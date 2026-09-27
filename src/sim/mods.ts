/** Numeric/boolean knobs that upgrades and curses turn. The World reads these. */
export interface Mods {
  powerTime: number;        // + seconds of frightened time
  chainChomp: boolean;      // ghost combo survives between power pellets
  doubleChomp: boolean;     // power pellets stack their time
  fruitRate: number;        // fruit spawn frequency multiplier
  fruitDuration: number;    // fruit effect duration multiplier
  clydeFriend: boolean;
  shields: number;          // hits ignored per maze
  pelletBomb: boolean;
  tunnelRat: boolean;
  pacSpeed: number;
  ghostSpeed: number;
  coinMult: number;
  scoreMult: number;
  ghostPoints: number;
  pelletPoints: number;
  startFruit: boolean;
  hunted: boolean;          // 5th ghost
  blackout: boolean;        // every maze is dark
  magnetRadius: number;     // passive pellet magnet
  eliteChance: number;
  comboCoins: number;       // extra coins per ghost eaten
  fruitStandChoices: number;
  frightSlow: number;       // multiplier on frightened ghost speed
  powerGrace: number;       // invulnerable seconds when power ends
  ghostTimeBonus: number;   // power seconds added per ghost eaten
  fruitPower: number;       // seconds of power granted by eating fruit (0 = off)
  powerEcho: boolean;       // first power pellet of a maze respawns once
  powerStun: number;        // seconds power pellets stun ghosts
  soulMult: number;         // souls earned by this run
  allPhantom: boolean;      // heat: every elite is a phantom
  leanMaze: boolean;        // heat: only 2 power pellets per maze
  ironGhosts: boolean;      // heat: non-Blinky ghosts start shielded
  noLives: boolean;         // heat: the stand doesn't sell lives
}

export const defaultMods = (): Mods => ({
  powerTime: 0, chainChomp: false, doubleChomp: false, fruitRate: 1, fruitDuration: 1,
  clydeFriend: false, shields: 0, pelletBomb: false, tunnelRat: false, pacSpeed: 1, ghostSpeed: 1,
  coinMult: 1, scoreMult: 1, ghostPoints: 1, pelletPoints: 1, startFruit: false, hunted: false,
  blackout: false, magnetRadius: 0, eliteChance: 0, comboCoins: 0, fruitStandChoices: 3, frightSlow: 1,
  powerGrace: 0, ghostTimeBonus: 0, fruitPower: 0,
  powerEcho: false, powerStun: 0, soulMult: 1, allPhantom: false, leanMaze: false, ironGhosts: false, noLives: false,
});
