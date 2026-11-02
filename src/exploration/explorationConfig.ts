/**
 * Camera and layout knobs for the canvas-to-explorer transition.
 * The depth scroll of floating tokens is tuned separately in depthPose.ts.
 */
export const EXPLORATION = {
  /** Absolute canvas scale while a category is being explored. */
  explorationZoom: 1.35,
  /**
   * The insertion seam rests at the centre of the viewport.
   * The split presentation then moves the preceding chain left
   * and the following chain right, opening space for the selector.
   */
  processFocusX: 0.5,
  processFocusY: 0.5,
  /** Seconds for the zoom into and out of exploration. */
  transitionDuration: 0.8,
  /** Seconds for the small follow when a newly added token shifts the gap. */
  adjustDuration: 0.5,
  /** Screen pixels kept clear around the visible process. */
  processSafetyMargin: 60,
  /**
   * World-pixel radius around the insertion point.
   * Tokens inside this radius form the protected process area.
   */
  localReach: 520,
  /** Screen pixels of fade before a foreground token touches the process. */
  fadeBuffer: 42,
  /**
   * Presentation-only split while exploration is open.
   * Fractions are of the viewport. The gradient stays at the centre.
   */
  splitLeftX: 0.18,
  splitRightX: 0.82,
  /** Visible left tokens stay to the left of this fraction. */
  splitLeftLimit: 0.34,
  /** Visible right tokens stay to the right of this fraction. */
  splitRightLimit: 0.66,
  splitLeftScale: 1,
  splitRightScale: 0.78,
  /** Safety margin around each process segment, in screen pixels. */
  splitMargin: 42,
  /** Nearest tokens kept in each side of the open process. */
  splitVisible: 3,
} as const;
