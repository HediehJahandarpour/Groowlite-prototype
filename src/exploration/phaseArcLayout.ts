import { TOKEN_CATALOG, type CatalogEntry } from "../process/tokenCatalog";
import type { PhaseId } from "../data/phasePalette";

/**
 * Persistent phase tokens on the outermost right-hand gradient ring.
 * Angles are degrees from the positive X axis (0° = right, negative = up).
 * At the end of activity scroll they close into a full circle like the
 * phase selector; reverse scroll opens them back to the right-hand arc.
 */
export const PHASE_ARC = {
  /** Top → bottom visual order along the right semicircle. */
  phaseIds: [
    "design",
    "understand",
    "make",
    "discover",
    "share",
  ] as const satisfies readonly PhaseId[],
  /**
   * Compact right-hand cluster (degrees from +X).
   * Tighter than a full semicircle so tokens sit closer and stay below the search bar.
   */
  anglesDeg: [-38, -19, 0, 19, 38] as const,
  /**
   * Radius as a fraction of the opening plate outer radius.
   * Near 1 sits on the painted rim of the gradient.
   */
  radiusFactor: 1.02,
  /**
   * Extra outward push past the activity rim, as a fraction of phase token size.
   * Small value keeps phases hugging the gradient edge.
   */
  clearanceFactor: 0.18,
  /** Size relative to the explorer activity base token (open half-arc). */
  sizeFactor: 1,
  /**
   * Size multiplier when phases sit alone in the closed circle.
   * Interpolates with the half→circle scroll blend.
   */
  circleSizeFactor: 1.48,
  /** Extra inward padding so the art clears the right viewport edge. */
  edgePadding: 10,
  /**
   * Keep the top of the arc below the fixed search bar
   * (bar top ~18px + height ~48px + gap).
   */
  searchClearance: 88,
  /**
   * Fraction of activity-scroll progress where the half→circle morph begins.
   * 0.55 means the last ~45% of scroll closes the phases into a ring.
   */
  circleBlendStart: 0.55,
} as const;

export type PhaseArcSeat = {
  entry: CatalogEntry;
  angle: number;
  x: number;
  y: number;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Catalog phases in the fixed arc order. Uses TOKEN_CATALOG — no duplicates. */
export function phaseArcEntries(): CatalogEntry[] {
  const byId = new Map(TOKEN_CATALOG.phase.map((entry) => [entry.id, entry]));
  return PHASE_ARC.phaseIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

function openArcRadius(
  radius: number,
  width: number,
  height: number,
  size: number,
) {
  const maxX = width * 0.5 - PHASE_ARC.edgePadding - size * 0.45;
  const maxY = height * 0.5 - PHASE_ARC.edgePadding - size * 0.45;
  const desired =
    radius * PHASE_ARC.radiusFactor + size * PHASE_ARC.clearanceFactor;
  const maxAbsSin = Math.max(
    ...PHASE_ARC.anglesDeg.map((deg) =>
      Math.abs(Math.sin((deg * Math.PI) / 180)),
    ),
    0.01,
  );
  const radiusFromY = maxY / maxAbsSin;
  return Math.max(0, Math.min(desired, maxX, radiusFromY));
}

function openYBias(
  safeRadius: number,
  height: number,
  size: number,
) {
  const topLimit = -(height * 0.5 - PHASE_ARC.searchClearance - size * 0.45);
  const topAngle = ((PHASE_ARC.anglesDeg[0] ?? 0) * Math.PI) / 180;
  const topY = Math.sin(topAngle) * safeRadius;
  return topY < topLimit ? topLimit - topY : 0;
}

/** Right-hand half-arc seats — resting layout while exploring activities. */
export function placePhaseArc(
  radius: number,
  width: number,
  height: number,
  tokenSize = 130,
): PhaseArcSeat[] {
  const entries = phaseArcEntries();
  const size = tokenSize * PHASE_ARC.sizeFactor;
  const safeRadius = openArcRadius(radius, width, height, size);
  const yBias = openYBias(safeRadius, height, size);

  return entries.map((entry, index) => {
    const deg = PHASE_ARC.anglesDeg[index] ?? 0;
    const angle = (deg * Math.PI) / 180;
    return {
      entry,
      angle,
      x: Math.cos(angle) * safeRadius,
      y: Math.sin(angle) * safeRadius + yBias,
    };
  });
}

/**
 * Full circle like the initial phase selector.
 * Same phase order as the open arc, starting at the top (−90°).
 */
export function placePhaseCircle(
  circleRadius: number,
  width: number,
  height: number,
  tokenSize = 130,
): PhaseArcSeat[] {
  const entries = phaseArcEntries();
  const size = tokenSize * PHASE_ARC.sizeFactor;
  const maxR =
    Math.min(width, height) * 0.5 - PHASE_ARC.edgePadding - size * 0.45;
  const safeRadius = Math.max(0, Math.min(circleRadius, maxR));
  const count = Math.max(entries.length, 1);
  const step = (Math.PI * 2) / count;
  const spin = -Math.PI / 2;

  return entries.map((entry, index) => {
    const angle = spin + index * step;
    return {
      entry,
      angle,
      x: Math.cos(angle) * safeRadius,
      y: Math.sin(angle) * safeRadius,
    };
  });
}

/** Map activity-scroll progress (0…scrollSpan) to a 0…1 half→circle blend. */
export function phaseCircleBlend(
  progress: number,
  scrollSpan: number,
): number {
  if (scrollSpan <= 0) return 0;
  const unit = clamp01(progress / scrollSpan);
  const start = PHASE_ARC.circleBlendStart;
  if (unit <= start) return 0;
  return smoothstep((unit - start) / Math.max(1e-6, 1 - start));
}

/** Interpolate open arc → full circle for one scroll frame. */
export function blendPhaseSeats(
  open: readonly PhaseArcSeat[],
  circle: readonly PhaseArcSeat[],
  blend: number,
): PhaseArcSeat[] {
  const t = clamp01(blend);
  const count = Math.min(open.length, circle.length);
  const seats: PhaseArcSeat[] = [];
  for (let index = 0; index < count; index += 1) {
    const from = open[index];
    const to = circle[index];
    seats.push({
      entry: from.entry,
      angle: from.angle + (to.angle - from.angle) * t,
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
  }
  return seats;
}
