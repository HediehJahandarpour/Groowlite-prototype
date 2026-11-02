import type { PhaseId } from "./phasePalette";

export type PhaseInfo = {
  /** What this phase is for in the design process. */
  bestFor: string;
  /** What choosing this phase helps someone achieve. */
  whenToUse: string;
};

/**
 * Copy for the phase hover card.
 * Best for names the work of the phase. When to use names the outcome.
 */
export const PHASE_INFO: Record<PhaseId, PhaseInfo> = {
  understand: {
    bestFor: "Framing the question",
    whenToUse:
      "Use this phase when you want a clear picture of the assignment, and of what you already know.",
  },
  discover: {
    bestFor: "Finding out",
    whenToUse:
      "Use this phase when you want to look, ask, and collect before you decide what to make.",
  },
  design: {
    bestFor: "Ideas and choices",
    whenToUse:
      "Use this phase when you want directions to choose from, and a reason to keep one.",
  },
  make: {
    bestFor: "Making it real",
    whenToUse:
      "Use this phase when you want the idea in a form you can try and improve.",
  },
  share: {
    bestFor: "Showing the work",
    whenToUse:
      "Use this phase when you want others to see the result, and to hear what they make of it.",
  },
};

export function phaseInfoFor(id: string): PhaseInfo | null {
  if (!(id in PHASE_INFO)) return null;
  return PHASE_INFO[id as PhaseId];
}
