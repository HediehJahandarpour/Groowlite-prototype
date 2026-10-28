import type { ActivityRecord } from "../data/activityRegistry";
import {
  PURPOSE_LABEL,
  PURPOSE_NEXT,
  type ActivityPurpose,
} from "../data/activityMetadata";
import type { ContextActivity, ProcessContext } from "./processContext";
import { NEUTRAL_SCORE } from "./recommendationConfig";

export type ScoreReason =
  | { kind: "no-previous" }
  | { kind: "unknown-semantics" }
  | { kind: "explicit"; previousLabel: string; distance: number }
  | { kind: "repeat"; previousLabel: string }
  | { kind: "step-back"; activityLabel: string; previousLabel: string }
  | { kind: "revisit"; activityLabel: string }
  | { kind: "checkpoint" }
  | { kind: "next-step"; nextLabel: string }
  | { kind: "progresses"; from: string; to: string }
  | { kind: "continues"; purpose: string }
  | { kind: "iterates"; purpose: string }
  | { kind: "neutral"; previousLabel: string | null };

export type ScoredFactor = {
  score: number;
  reason: ScoreReason;
};

const EXPLICIT_BY_DISTANCE = [1, 0.78, 0.68];
const REPEAT_PREVIOUS = 0.9;
const STEP_BACK = 0.82;
const REVISIT_PLACED = 0.66;

function activityOf(id: string | null, byId: Map<string, ActivityRecord>): ActivityRecord | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

function sharesPurpose(left: ActivityPurpose[], right: ActivityPurpose[]): boolean {
  return left.some((purpose) => right.includes(purpose));
}

function progresses(
  from: ActivityPurpose[],
  to: ActivityPurpose[],
): { from: ActivityPurpose; to: ActivityPurpose } | null {
  for (const purpose of to) {
    const source = from.find((previous) => PURPOSE_NEXT[previous].includes(purpose));
    if (source) return { from: source, to: purpose };
  }
  return null;
}

/**
 * Relevance to the activity just before the gap, then the two before that.
 * An explicit name-based link raises the score. An unknown link stays at the
 * neutral score and is never pushed down.
 */
export function contextFactor(
  candidate: ActivityRecord,
  context: ProcessContext,
  byId: Map<string, ActivityRecord>,
): ScoredFactor {
  let best = NEUTRAL_SCORE;
  let reason: ScoreReason = context.previousActivity
    ? { kind: "neutral", previousLabel: context.previousActivity.label }
    : { kind: "no-previous" };

  if (context.previousActivity && candidate.purposeSource === "unknown" && candidate.predecessors.length === 0) {
    reason = { kind: "unknown-semantics" };
  }

  for (const previous of context.precedingActivities) {
    const distanceIndex = previous.distance - 1;
    if (previous.activityId && candidate.predecessors.includes(previous.activityId)) {
      const score = EXPLICIT_BY_DISTANCE[distanceIndex] ?? NEUTRAL_SCORE;
      if (score > best) {
        best = score;
        reason = { kind: "explicit", previousLabel: previous.label, distance: previous.distance };
      }
    } else if (previous.distance === 1 && previous.activityId === candidate.id) {
      if (REPEAT_PREVIOUS > best) {
        best = REPEAT_PREVIOUS;
        reason = { kind: "repeat", previousLabel: previous.label };
      }
    }
  }

  const immediate = activityOf(context.previousActivity?.activityId ?? null, byId);
  if (immediate?.predecessors.includes(candidate.id) && STEP_BACK > best) {
    best = STEP_BACK;
    reason = {
      kind: "step-back",
      activityLabel: candidate.label,
      previousLabel: context.previousActivity?.label ?? immediate.label,
    };
  }

  if (
    context.placedActivityIds.includes(candidate.id) &&
    candidate.id !== context.previousActivity?.activityId &&
    REVISIT_PLACED > best
  ) {
    best = REVISIT_PLACED;
    reason = { kind: "revisit", activityLabel: candidate.label };
  }

  if (
    context.nearbyCheckpoint &&
    candidate.purposes.some((purpose) => purpose === "reflection" || purpose === "evaluation")
  ) {
    const score = 0.7;
    if (score > best) {
      best = score;
      reason = { kind: "checkpoint" };
    }
  }

  const next = context.nextToken;
  if (next?.activityId) {
    const following = activityOf(next.activityId, byId);
    if (following?.predecessors.includes(candidate.id) && best < 0.72) {
      best = 0.72;
      reason = { kind: "next-step", nextLabel: next.label };
    }
  }

  return { score: best, reason };
}

/**
 * Whether the candidate is a plausible next step from the previous activity's
 * purpose. Repeating a purpose and stepping back both stay available.
 */
export function workflowFactor(
  candidate: ActivityRecord,
  context: ProcessContext,
  byId: Map<string, ActivityRecord>,
): ScoredFactor {
  const previous = previousRecord(context.previousActivity, byId);
  if (!context.previousActivity) {
    return { score: NEUTRAL_SCORE, reason: { kind: "no-previous" } };
  }
  if (!previous || previous.purposes.length === 0 || candidate.purposes.length === 0) {
    return { score: NEUTRAL_SCORE, reason: { kind: "unknown-semantics" } };
  }

  const nextPurpose = progresses(previous.purposes, candidate.purposes);
  if (nextPurpose) {
    return {
      score: 0.86,
      reason: {
        kind: "progresses",
        from: PURPOSE_LABEL[nextPurpose.from],
        to: PURPOSE_LABEL[nextPurpose.to],
      },
    };
  }

  if (sharesPurpose(previous.purposes, candidate.purposes)) {
    const shared = candidate.purposes.find((purpose) => previous.purposes.includes(purpose));
    return {
      score: 0.64,
      reason: { kind: "continues", purpose: shared ? PURPOSE_LABEL[shared] : "the same purpose" },
    };
  }

  const backward = progresses(candidate.purposes, previous.purposes);
  if (backward) {
    return {
      score: 0.58,
      reason: { kind: "iterates", purpose: PURPOSE_LABEL[backward.to] },
    };
  }

  return { score: NEUTRAL_SCORE, reason: { kind: "neutral", previousLabel: previous.label } };
}

function previousRecord(
  previous: ContextActivity | null,
  byId: Map<string, ActivityRecord>,
): ActivityRecord | null {
  return activityOf(previous?.activityId ?? null, byId);
}
