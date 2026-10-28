import type { ActivityRecord } from "../data/activityRegistry";
import { PURPOSE_LABEL } from "../data/activityMetadata";
import { PHASE_LABEL, type PhaseId } from "../data/phasePalette";
import type { ProcessToken } from "../process/processTypes";
import { contextFactor, workflowFactor, type ScoreReason } from "./activityRelationships";
import { phaseAssociationScore, roundScore, type AssociationSource } from "./colourAnalysis";
import { readProcessContext, type ProcessContext } from "./processContext";
import {
  NEUTRAL_SCORE,
  PHASE_EXPLANATION,
  RECOMMENDATION_WEIGHTS,
  type RecommendationWeights,
} from "./recommendationConfig";

export type MetadataConfidence = "official" | "provisional" | "unknown";

export type RankedActivity = {
  activityId: string;
  totalScore: number;
  phaseScore: number;
  contextScore: number;
  workflowScore: number;
  originalLibraryIndex: number;
  explanation: string;
  metadataConfidence: MetadataConfidence;
};

export type RankActivitiesInput = {
  /** Activities to rank. Manual search and phase filters narrow this list first. */
  activities: ActivityRecord[];
  /**
   * Registry used to read the process around the gap.
   * Defaults to `activities`. Pass the full registry when `activities` is a
   * filtered subset, so a previous token that is hidden still informs the rank.
   */
  catalog?: ActivityRecord[];
  processTokens: ProcessToken[];
  insertionIndex: number;
  weights?: RecommendationWeights;
};

/**
 * Rank every supplied activity for one insertion gap.
 * The result is deterministic: equal scores keep library order.
 * This function does not remove activities. Phase filters run before it.
 */
export function rankActivities(input: RankActivitiesInput): RankedActivity[] {
  const weights = input.weights ?? RECOMMENDATION_WEIGHTS;
  const catalog = input.catalog ?? input.activities;
  const context = readProcessContext(input.processTokens, input.insertionIndex, catalog);
  const byId = new Map(catalog.map((activity) => [activity.id, activity]));
  const ranked = input.activities.map((activity) => scoreActivity(activity, context, byId, weights));
  ranked.sort(
    (a, b) => b.totalScore - a.totalScore || a.originalLibraryIndex - b.originalLibraryIndex,
  );
  return ranked;
}

export function scoreActivity(
  activity: ActivityRecord,
  context: ProcessContext,
  byId: Map<string, ActivityRecord>,
  weights: RecommendationWeights = RECOMMENDATION_WEIGHTS,
): RankedActivity {
  const phaseScore = roundScore(
    phaseAssociationScore(activity.associationSource, activity.phaseAssociations, context.activePhase),
  );
  const contextFactorResult = contextFactor(activity, context, byId);
  const workflowFactorResult = workflowFactor(activity, context, byId);
  const contextScore = roundScore(contextFactorResult.score);
  const workflowScore = roundScore(workflowFactorResult.score);
  const totalScore = roundScore(combine(phaseScore, contextScore, workflowScore, weights));
  return {
    activityId: activity.id,
    totalScore,
    phaseScore,
    contextScore,
    workflowScore,
    originalLibraryIndex: activity.libraryIndex,
    explanation: explain(activity, context, phaseScore, contextFactorResult.reason, workflowFactorResult.reason),
    metadataConfidence: confidence(activity),
  };
}

function combine(
  phaseScore: number,
  contextScore: number,
  workflowScore: number,
  weights: RecommendationWeights,
): number {
  const phase = Math.max(0, weights.phaseWeight);
  const context = Math.max(0, weights.contextWeight);
  const workflow = Math.max(0, weights.workflowWeight);
  const sum = phase + context + workflow;
  if (sum === 0) return NEUTRAL_SCORE;
  return (phase * phaseScore + context * contextScore + workflow * workflowScore) / sum;
}

function confidence(activity: ActivityRecord): MetadataConfidence {
  const phaseKnown = activity.associationSource !== "unknown";
  const purposeKnown = activity.purposeSource !== "unknown" && activity.purposes.length > 0;
  if (activity.associationSource === "official" && activity.purposeSource === "official") return "official";
  if (!phaseKnown && !purposeKnown) return "unknown";
  return "provisional";
}

function explain(
  activity: ActivityRecord,
  context: ProcessContext,
  phaseScore: number,
  contextReason: ScoreReason,
  workflowReason: ScoreReason,
): string {
  const sentences = [
    contextSentence(contextReason),
    workflowSentence(activity, workflowReason),
    phaseSentence(activity, context.activePhase, phaseScore),
  ].filter((sentence) => sentence.length > 0);
  return sentences.join(" ");
}

function phaseSentence(
  activity: ActivityRecord,
  activePhase: PhaseId | null,
  phaseScore: number,
): string {
  if (!activePhase) {
    return "No phase precedes this position, so the phase score stays neutral.";
  }
  if (activity.associationSource === "unknown") {
    return "No reliable phase colour was identified, so the phase score stays neutral.";
  }
  const source =
    activity.associationSource === "official"
      ? "Official phase metadata"
      : "Provisional colour reading";
  const active = PHASE_LABEL[activePhase];
  const others = strongPhases(activity, activePhase);
  const also = others.length > 0 ? ` ${others.join(" and ")} ${others.length === 1 ? "is" : "are"} also visible in the illustration.` : "";
  if (phaseScore >= PHASE_EXPLANATION.strong) {
    return `${source} aligns with ${active}.${also}`;
  }
  if (phaseScore >= PHASE_EXPLANATION.some) {
    return `${source} has some association with ${active}.${also}`;
  }
  return `${source} has little association with ${active}.${also}`;
}

function strongPhases(activity: ActivityRecord, activePhase: PhaseId): string[] {
  if (activity.associationSource === "unknown") return [];
  return (Object.entries(activity.phaseAssociations) as Array<[PhaseId, number]>)
    .filter(([phase, score]) => phase !== activePhase && score >= PHASE_EXPLANATION.strong)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([phase]) => PHASE_LABEL[phase]);
}

function contextSentence(reason: ScoreReason): string {
  switch (reason.kind) {
    case "no-previous":
      return "No earlier activity to compare, so the context score stays neutral.";
    case "unknown-semantics":
      return "Semantic metadata is incomplete, so the context score stays neutral.";
    case "explicit":
      return reason.distance === 1
        ? `Follows ${reason.previousLabel}.`
        : `Follows ${reason.previousLabel}, ${reason.distance} steps back.`;
    case "repeat":
      return `Repeats ${reason.previousLabel}, which stays in the suggestions.`;
    case "step-back":
      return `Steps back to ${reason.activityLabel}, which led to ${reason.previousLabel}.`;
    case "revisit":
      return `${reason.activityLabel} is already in this process, so it stays in the suggestions.`;
    case "checkpoint":
      return "A nearby checkpoint favours reflection or evaluation.";
    case "next-step":
      return `Fits just before ${reason.nextLabel}.`;
    case "neutral":
      return reason.previousLabel
        ? `No recorded relationship with ${reason.previousLabel}, so the context score stays neutral.`
        : "No recorded relationship, so the context score stays neutral.";
    default:
      return "";
  }
}

function workflowSentence(activity: ActivityRecord, reason: ScoreReason): string {
  switch (reason.kind) {
    case "progresses":
      return `Supports ${reason.to} after ${reason.from} (provisional purpose).`;
    case "continues":
      return `Continues ${reason.purpose} (provisional purpose).`;
    case "iterates":
      return `Steps back toward ${reason.purpose}, which stays a valid move (provisional purpose).`;
    case "unknown-semantics":
      return activity.purposeSource === "unknown"
        ? "No provisional purpose is recorded, so the workflow score stays neutral."
        : "";
    case "neutral":
      return "No provisional progression from the previous purpose, so the workflow score stays neutral.";
    default:
      return "";
  }
}

export function purposeSummary(activity: ActivityRecord): string {
  if (activity.purposeSource === "unknown" || activity.purposes.length === 0) {
    return "Unknown";
  }
  const names = activity.purposes.map((purpose) => PURPOSE_LABEL[purpose]).join(", ");
  return activity.purposeSource === "official" ? names : `${names} (provisional)`;
}

export type { AssociationSource };
