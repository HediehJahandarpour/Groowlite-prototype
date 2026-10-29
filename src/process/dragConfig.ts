/**
 * Tunable feel for magnetic reordering.
 * Distances are screen pixels so zoom does not change how the snap feels.
 * Durations are milliseconds.
 */
export const DRAG = {
  /** Pointer travel before a press becomes a drag. A shorter move stays a click. */
  thresholdPx: 6,
  /** How close the pointer must be to a slot before that slot becomes the target. */
  snapRadiusPx: 84,
  /** Extra distance the current target keeps so neighbours do not flicker. */
  hysteresisPx: 24,
  /** Scale of the lifted artwork relative to its slot scale. */
  liftScale: 1.08,
  liftMs: 150,
  /** How long neighbouring tokens take to slide into a preview order. */
  reflowMs: 260,
  snapMs: 280,
  cancelMs: 240,
  /** Viewport edge band that starts a gentle camera pan. */
  autoPanEdgePx: 52,
  /** Fastest auto-pan, in screen pixels per frame. */
  autoPanMaxPx: 11,
} as const;
