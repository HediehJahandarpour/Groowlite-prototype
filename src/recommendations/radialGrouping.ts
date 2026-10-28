import type { ActivityRecord } from "../data/activityRegistry";
import { ACTIVITY_REGISTRY } from "../data/activityRegistry";
import type { PhaseId } from "../data/phasePalette";
import type { ProcessToken } from "../process/processTypes";
import { selectedPhaseColourAmount } from "./activityFilters";
import { rankActivities, type RankedActivity } from "./rankingEngine";
import { readProcessContext, type ProcessContext } from "./processContext";
import { LAYER_CAPACITIES, PHASE_EXPLANATION, RECOMMENDATION_WEIGHTS } from "./recommendationConfig";

/**
 * Place a ranked list onto radial layers.
 * The first capacities are used in order. Further layers repeat the last
 * capacity until every activity has been placed exactly once.
 */
export function distributeIntoLayers(
  ranked: RankedActivity[],
  activities: ActivityRecord[],
  capacities: readonly number[] = LAYER_CAPACITIES,
): ActivityRecord[][] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const layers: ActivityRecord[][] = [];
  let cursor = 0;
  let layerIndex = 0;
  while (cursor < ranked.length) {
    const capacity = capacities[Math.min(layerIndex, Math.max(0, capacities.length - 1))] ?? ranked.length;
    const count = Math.max(1, capacity);
    const slice = ranked.slice(cursor, cursor + count);
    layers.push(
      slice.map((item) => {
        const activity = byId.get(item.activityId);
        if (!activity) {
          throw new Error(`Ranked activity ${item.activityId} is not in the registry.`);
        }
        return activity;
      }),
    );
    cursor += count;
    layerIndex += 1;
  }
  return layers;
}

export function layerOf(layers: ActivityRecord[][]): Map<string, number> {
  const placement = new Map<string, number>();
  layers.forEach((layer, index) => {
    for (const activity of layer) placement.set(activity.id, index);
  });
  return placement;
}

function matchesActivePhase(activity: ActivityRecord, context: ProcessContext): boolean {
  if (!context.activePhase || activity.associationSource === "unknown") return false;
  return activity.phaseAssociations[context.activePhase] >= PHASE_EXPLANATION.strong;
}

function byProcessFit(rankedById: Map<string, RankedActivity>) {
  return (leftId: string, rightId: string) => {
    const left = rankedById.get(leftId);
    const right = rankedById.get(rightId);
    return (
      (right?.workflowScore ?? 0) - (left?.workflowScore ?? 0) ||
      (right?.totalScore ?? 0) - (left?.totalScore ?? 0) ||
      (left?.originalLibraryIndex ?? 0) - (right?.originalLibraryIndex ?? 0)
    );
  };
}

/**
 * Suggestion order for one insertion gap.
 *
 * The previous activity is kept in the near suggestions. What the design
 * process records around that activity comes next, alternating a colour
 * match with a follow-up from another phase and a step back to the activity
 * that led here. Colour still orders each of those groups, and it orders
 * everything that has no recorded link.
 */
export function orderSuggestions(
  ranked: RankedActivity[],
  activities: ActivityRecord[],
  context: ProcessContext,
): RankedActivity[] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const rankedById = new Map(ranked.map((item) => [item.activityId, item]));
  const pool = new Set(ranked.map((item) => item.activityId));
  const previousId = context.previousActivity?.activityId ?? null;
  const previous = previousId ? byId.get(previousId) : undefined;
  const sortIds = byProcessFit(rankedById);

  const followsPrevious = ranked
    .map((item) => item.activityId)
    .filter((id) => {
      if (!previousId || id === previousId) return false;
      return byId.get(id)?.predecessors.includes(previousId) ?? false;
    });
  const samePhase = followsPrevious.filter((id) => {
    const activity = byId.get(id);
    return activity ? matchesActivePhase(activity, context) : false;
  });
  const otherPhase = followsPrevious.filter((id) => !samePhase.includes(id));
  const stepBack = (previous?.predecessors ?? []).filter((id) => pool.has(id) && id !== previousId);

  samePhase.sort(sortIds);
  otherPhase.sort(sortIds);
  stepBack.sort(sortIds);

  const ordered: RankedActivity[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id) || !pool.has(id)) return;
    const item = rankedById.get(id);
    if (!item) return;
    seen.add(id);
    ordered.push(item);
  };

  push(previousId);
  let sameIndex = 0;
  let otherIndex = 0;
  let backIndex = 0;
  while (sameIndex < samePhase.length || otherIndex < otherPhase.length || backIndex < stepBack.length) {
    if (sameIndex < samePhase.length) push(samePhase[sameIndex]);
    sameIndex += 1;
    if (otherIndex < otherPhase.length) push(otherPhase[otherIndex]);
    otherIndex += 1;
    if (backIndex < stepBack.length) push(stepBack[backIndex]);
    backIndex += 1;
  }

  for (const earlier of context.precedingActivities.slice(1)) {
    const linked = ranked
      .map((item) => item.activityId)
      .filter((id) => earlier.activityId != null && (byId.get(id)?.predecessors.includes(earlier.activityId) ?? false));
    linked.sort(sortIds);
    for (const id of linked) push(id);
  }

  for (const id of context.placedActivityIds) push(id);
  for (const item of ranked) push(item.activityId);
  return ordered;
}

/**
 * When a phase filter is on, the open ring follows the illustration colour
 * instead of the process suggestion. The fullest selected colour is nearest.
 */
function orderByPhaseColour(
  ranked: RankedActivity[],
  activities: ActivityRecord[],
  phases: readonly PhaseId[],
): RankedActivity[] {
  const rankedById = new Map(ranked.map((item) => [item.activityId, item]));
  const sorted = activities.slice().sort(
    (left, right) =>
      selectedPhaseColourAmount(right, phases) - selectedPhaseColourAmount(left, phases) ||
      left.libraryIndex - right.libraryIndex,
  );
  return sorted.flatMap((activity) => {
    const item = rankedById.get(activity.id);
    return item ? [item] : [];
  });
}

/**
 * Layers for the open activity selector.
 * `pool` is the registry after manual search and phase filters.
 * `colourPhases` is the manual phase selection. While it is set, layers
 * follow how much of that colour is in each illustration.
 * With no phase filter, the full registry still informs suggestion order,
 * so a hidden previous activity can affect what remains.
 * Call this when the insertion context or the manual filters change,
 * not on each scroll frame.
 */
export function activityLayersFor(
  tokens: ProcessToken[],
  insertionIndex: number,
  pool: readonly ActivityRecord[] = ACTIVITY_REGISTRY,
  colourPhases: readonly PhaseId[] = [],
): { ranked: RankedActivity[]; ordered: RankedActivity[]; layers: ActivityRecord[][]; context: ProcessContext } {
  const activities = pool.slice();
  const context = readProcessContext(tokens, insertionIndex, ACTIVITY_REGISTRY);
  const ranked = rankActivities({
    activities,
    catalog: ACTIVITY_REGISTRY,
    processTokens: tokens,
    insertionIndex,
    weights: RECOMMENDATION_WEIGHTS,
  });
  const ordered =
    colourPhases.length > 0
      ? orderByPhaseColour(ranked, activities, colourPhases)
      : orderSuggestions(ranked, activities, context);
  return { ranked, ordered, layers: distributeIntoLayers(ordered, activities), context };
}
