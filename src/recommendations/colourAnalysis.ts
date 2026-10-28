import { COLOUR_ANALYSIS } from "../data/phaseColourCache";
import { PHASE_IDS, type PhaseId } from "../data/phasePalette";
import { NEUTRAL_SCORE } from "./recommendationConfig";

export type AssociationSource = "official" | "colour-inferred" | "unknown";

export type PhaseScoreMap = Record<PhaseId, number>;

export type ColourProfile = {
  asset: string;
  associationSource: AssociationSource;
  phaseAssociations: PhaseScoreMap;
};

const EMPTY_SCORES: PhaseScoreMap = {
  understand: 0,
  discover: 0,
  design: 0,
  make: 0,
  share: 0,
};

/**
 * Cached illustration readings. Pixels are measured by
 * `scripts/analyse-activity-colours.py`, not when the selector opens.
 * No official phase table was found in the project, so these scores stay
 * marked as colour-inferred.
 */
export function colourProfile(asset: string): ColourProfile | null {
  const profiles = COLOUR_ANALYSIS.profiles as Record<string, ColourProfile>;
  return profiles[asset] ?? null;
}

/**
 * Share of the illustration that is this phase colour.
 * Unlike the saturated association score, this keeps growing after a colour
 * already fills enough of the drawing to score 1.
 */
export function illustrationColourAmount(asset: string, phase: PhaseId): number {
  const profiles = COLOUR_ANALYSIS.profiles as Record<
    string,
    { matchedFraction?: Partial<Record<PhaseId, number>> }
  >;
  const amount = profiles[asset]?.matchedFraction?.[phase];
  return typeof amount === "number" && amount > 0 ? amount : 0;
}

export function discoveredActivityAssets(): string[] {
  return Object.keys(COLOUR_ANALYSIS.profiles);
}

export function emptyPhaseScores(): PhaseScoreMap {
  return { ...EMPTY_SCORES };
}

export function phaseScoresForAsset(asset: string): {
  source: AssociationSource;
  scores: PhaseScoreMap;
} {
  const profile = colourProfile(asset);
  if (!profile || profile.associationSource === "unknown") {
    return { source: "unknown", scores: emptyPhaseScores() };
  }
  const scores = emptyPhaseScores();
  for (const phase of PHASE_IDS) {
    const value = profile.phaseAssociations[phase];
    scores[phase] = typeof value === "number" ? clamp01(value) : 0;
  }
  return { source: profile.associationSource, scores };
}

/**
 * How strongly an activity belongs to the phase that contains the insertion
 * gap. Unknown colour and a gap with no phase both stay neutral.
 */
export function phaseAssociationScore(
  source: AssociationSource,
  scores: PhaseScoreMap,
  activePhase: PhaseId | null,
): number {
  if (!activePhase || source === "unknown") return NEUTRAL_SCORE;
  return clamp01(scores[activePhase]);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}
