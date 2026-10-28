import type { ActivityRecord } from "../data/activityRegistry";
import { phaseFromAsset, type PhaseId } from "../data/phasePalette";
import type { ProcessToken } from "../process/processTypes";

export type ContextActivity = {
  activityId: string | null;
  label: string;
  asset: string;
  /** 1 is the activity immediately before the insertion gap. */
  distance: number;
};

export type ContextToken = {
  type: ProcessToken["type"];
  label: string;
  asset: string;
  activityId: string | null;
};

export type ProcessContext = {
  insertionIndex: number;
  activePhase: PhaseId | null;
  previousActivity: ContextActivity | null;
  /** Closest preceding activities first, at most three. */
  precedingActivities: ContextActivity[];
  /**
   * Every activity already placed before the gap, nearest first.
   * Repeats of the same activity are kept once.
   */
  placedActivityIds: string[];
  nextToken: ContextToken | null;
  nearbyCheckpoint: boolean;
};

function middleTokens(tokens: ProcessToken[]): ProcessToken[] {
  return tokens
    .filter((token) => token.type !== "start" && token.type !== "end")
    .slice()
    .sort((a, b) => a.order - b.order);
}

/**
 * The phase and activities that surround an insertion gap.
 * The phase is the closest phase token before the gap, not the last phase
 * in the whole process. No preceding phase stays neutral rather than
 * defaulting to Understand.
 */
export function readProcessContext(
  tokens: ProcessToken[],
  insertionIndex: number,
  activities: ActivityRecord[],
): ProcessContext {
  const byAsset = new Map(activities.map((activity) => [activity.asset, activity]));
  const middles = middleTokens(tokens);
  const index = Math.max(0, Math.min(insertionIndex, middles.length));
  const before = middles.slice(0, index);
  const next = middles[index] ?? null;

  let activePhase: PhaseId | null = null;
  for (let cursor = before.length - 1; cursor >= 0; cursor -= 1) {
    if (before[cursor].type !== "phase") continue;
    const phase = phaseFromAsset(before[cursor].asset);
    if (phase) {
      activePhase = phase;
      break;
    }
  }

  const precedingActivities: ContextActivity[] = [];
  const placedActivityIds: string[] = [];
  const seenPlaced = new Set<string>();
  for (let cursor = before.length - 1; cursor >= 0; cursor -= 1) {
    const token = before[cursor];
    if (token.type !== "activity") continue;
    const known = byAsset.get(token.asset);
    if (precedingActivities.length < 3) {
      precedingActivities.push({
        activityId: known?.id ?? null,
        label: known?.label ?? token.label,
        asset: token.asset,
        distance: precedingActivities.length + 1,
      });
    }
    if (known && !seenPlaced.has(known.id)) {
      seenPlaced.add(known.id);
      placedActivityIds.push(known.id);
    }
  }

  const window = [...before.slice(-3), ...(next ? [next] : [])];
  const nearbyCheckpoint = window.some((token) => token.type === "checkpoint");

  return {
    insertionIndex: index,
    activePhase,
    previousActivity: precedingActivities[0] ?? null,
    precedingActivities,
    placedActivityIds,
    nextToken: next
      ? {
          type: next.type,
          label: byAsset.get(next.asset)?.label ?? next.label,
          asset: next.asset,
          activityId: next.type === "activity" ? (byAsset.get(next.asset)?.id ?? null) : null,
        }
      : null,
    nearbyCheckpoint,
  };
}
