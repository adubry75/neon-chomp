/** Per-difficulty tuning, adapted from the arcade tables. Speeds are fractions of BASE_SPEED. */
export interface LevelParams {
  pac: number; pacFright: number;
  ghost: number; ghostFright: number; ghostTunnel: number;
  elroy1Dots: number; elroy1: number; elroy2Dots: number; elroy2: number;
  frightTime: number;
  /** Alternating scatter/chase durations (seconds), starting with scatter. Last chase is forever. */
  modes: number[];
  /** Pellets that must be eaten before each house ghost may leave (pinky, inky, clyde, stalker). */
  dotLimits: number[];
  /** Seconds without a pellet before the next ghost is forced out. */
  idleRelease: number;
}

export function levelParams(level: number): LevelParams {
  const l = Math.max(1, level);
  const tier = l === 1 ? 0 : l <= 4 ? 1 : 2;
  const extra = Math.min(0.08, Math.max(0, l - 5) * 0.01); // gentle creep past arcade tables
  const base = [
    { pac: 0.8, pacFright: 0.9, ghost: 0.75, ghostFright: 0.5, ghostTunnel: 0.4, e1: 0.8, e2: 0.85 },
    { pac: 0.9, pacFright: 0.95, ghost: 0.85, ghostFright: 0.55, ghostTunnel: 0.45, e1: 0.9, e2: 0.95 },
    { pac: 1.0, pacFright: 1.0, ghost: 0.95, ghostFright: 0.6, ghostTunnel: 0.5, e1: 1.0, e2: 1.05 },
  ][tier];
  const modes =
    tier === 0 ? [7, 20, 7, 20, 5, 20, 5] :
    tier === 1 ? [7, 20, 7, 20, 5, 1033, 1 / 60] :
                 [5, 20, 5, 20, 5, 1037, 1 / 60];
  return {
    pac: base.pac, pacFright: base.pacFright,
    ghost: base.ghost + extra, ghostFright: base.ghostFright, ghostTunnel: base.ghostTunnel,
    elroy1Dots: Math.min(20 + (l - 1) * 5, 60), elroy1: base.e1 + extra,
    elroy2Dots: Math.min(10 + Math.floor((l - 1) * 2.5), 30), elroy2: base.e2 + extra,
    // Kinder than the arcade (which hits 1s by level 9) — upgrades add on top.
    frightTime: Math.max(2.5, 6.5 - (l - 1) * 0.35),
    modes,
    dotLimits: l === 1 ? [0, 30, 60, 90] : l === 2 ? [0, 0, 50, 70] : [0, 0, 0, 30],
    idleRelease: l < 5 ? 4 : 3,
  };
}
