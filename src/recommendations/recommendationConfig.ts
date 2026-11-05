/**
 * Provisional recommendation parameters.
 * These are UX settings, not validated educational weights.
 * Change them here. The radial selector reads this object; it does not
 * hardcode the numbers.
 *
 * Colour still decides the order when nothing is known about the previous
 * token. A recorded link to that token — what follows it, or the step back
 * into making — is weighted so it can outrank a colour match on its own.
 */
export const RECOMMENDATION_WEIGHTS = {
  phaseWeight: 0.3,
  contextWeight: 0.45,
  workflowWeight: 0.25,
};

export type RecommendationWeights = {
  phaseWeight: number;
  contextWeight: number;
  workflowWeight: number;
};

/**
 * Used when a phase, a relationship, or a purpose is unknown.
 * Missing metadata stays neutral. It is not treated as zero relevance.
 */
export const NEUTRAL_SCORE = 0.5;

/** How strongly a colour reading has to be before an explanation names that phase. */
export const PHASE_EXPLANATION = {
  strong: 0.55,
  some: 0.25,
};

/**
 * Fallback buckets matching the Figma radar:
 * inner ~7 at 130px, middle ~10 at 100px, then an outer ring at 90px.
 */
export const LAYER_CAPACITIES = [7, 14] as const;

/**
 * Split activities onto three rings when possible:
 * first 6–7, next 13–14, remainder on the outer ring.
 */
export function layerCapacitiesFor(count: number): number[] {
  const safe = Math.max(0, Math.floor(count));
  if (safe <= 0) return [...LAYER_CAPACITIES];
  if (safe <= 7) return [safe];
  const inner = safe >= 21 ? 7 : 6;
  const afterInner = safe - inner;
  // Middle holds up to ~14 on an even circle; spill the rest onto a third.
  const middle = Math.min(14, afterInner);
  const outer = afterInner - middle;
  if (outer <= 0) return [inner, middle];
  return [inner, middle, outer];
}
