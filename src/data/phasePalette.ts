import { COLOUR_ANALYSIS } from "./phaseColourCache";

/** The five Groow phases, in toolkit order. */
export const PHASE_IDS = ["understand", "discover", "design", "make", "share"] as const;

export type PhaseId = (typeof PHASE_IDS)[number];

export const PHASE_LABEL: Record<PhaseId, string> = {
  understand: "Understand",
  discover: "Discover",
  design: "Design",
  make: "Make",
  share: "Share",
};

/**
 * Fill colours measured from the phase tokens.
 * These are the colours the recommendation cache was compared against.
 * The radial wash uses its own screen colours in `activityMotion`.
 */
export const PHASE_PALETTE: Record<PhaseId, { hex: string; asset: string }> = {
  understand: { hex: COLOUR_ANALYSIS.palette.understand.hex, asset: COLOUR_ANALYSIS.palette.understand.asset },
  discover: { hex: COLOUR_ANALYSIS.palette.discover.hex, asset: COLOUR_ANALYSIS.palette.discover.asset },
  design: { hex: COLOUR_ANALYSIS.palette.design.hex, asset: COLOUR_ANALYSIS.palette.design.asset },
  make: { hex: COLOUR_ANALYSIS.palette.make.hex, asset: COLOUR_ANALYSIS.palette.make.asset },
  share: { hex: COLOUR_ANALYSIS.palette.share.hex, asset: COLOUR_ANALYSIS.palette.share.asset },
};

export const PHASE_OF_ASSET: Record<string, PhaseId> = Object.fromEntries(
  PHASE_IDS.map((phase) => [PHASE_PALETTE[phase].asset, phase]),
);

export function phaseFromAsset(asset: string): PhaseId | null {
  return PHASE_OF_ASSET[asset] ?? null;
}
