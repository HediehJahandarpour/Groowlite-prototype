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
 * Activities on each depth layer, closest to the viewer first.
 * The choosable layer holds six tokens. Later layers hold six,
 * and anything left over opens another layer of six.
 */
export const LAYER_CAPACITIES = [6, 6] as const;
