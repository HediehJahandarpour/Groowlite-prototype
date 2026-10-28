import { PURPOSE_LABEL } from "../data/activityMetadata";
import type { ActivityRecord } from "../data/activityRegistry";
import type { PhaseId } from "../data/phasePalette";
import { illustrationColourAmount } from "./colourAnalysis";
import { PHASE_EXPLANATION } from "./recommendationConfig";

/**
 * Display labels for the filter pills.
 * Internal ids stay the process ids. Discovery is `discover`.
 * Shape is the pink phase, stored as `share`.
 */
export const PHASE_FILTERS: readonly { id: PhaseId; label: string; color: string }[] = [
  { id: "discover", label: "Discovery", color: "#4ba570" },
  { id: "understand", label: "Understand", color: "#348bcd" },
  { id: "share", label: "Shape", color: "#bd3b60" },
  { id: "design", label: "Design", color: "#f2c649" },
  { id: "make", label: "Make", color: "#ec754f" },
];

/**
 * Colour readings at or above this count as membership of a phase.
 * It is the same "some association" floor the ranker already uses when it
 * explains a colour. It does not change how activities are scored.
 */
export const PHASE_MEMBERSHIP = PHASE_EXPLANATION.some;

export type ActivityFilter = {
  query: string;
  phases: readonly PhaseId[];
};

/** Case-fold, trim, and strip accents so partial matches stay predictable. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match the words the library already has: the printed name, the id,
 * and the provisional purpose labels. Nothing is added as a keyword.
 */
export function matchActivitySearch(activity: ActivityRecord, query: string): boolean {
  const terms = foldSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const purposes = activity.purposes.map((purpose) => PURPOSE_LABEL[purpose]).join(" ");
  const haystack = foldSearchText(
    [activity.label, activity.note, activity.id.replace(/-/g, " "), purposes].join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

function associatedWith(activity: ActivityRecord, phase: PhaseId): boolean {
  if (activity.associationSource === "unknown") return false;
  return (
    activity.phaseAssociations[phase] >= PHASE_MEMBERSHIP &&
    illustrationColourAmount(activity.asset, phase) > 0
  );
}

/**
 * How much of the selected phase colours is in this illustration.
 * When several phases are selected, the strongest of those colours counts.
 */
export function selectedPhaseColourAmount(
  activity: ActivityRecord,
  phases: readonly PhaseId[],
): number {
  let strongest = 0;
  for (const phase of phases) {
    if (!associatedWith(activity, phase)) continue;
    strongest = Math.max(strongest, illustrationColourAmount(activity.asset, phase));
  }
  return strongest;
}

/**
 * Keep activities whose illustration contains a selected phase colour.
 * An empty selection does not restrict the library.
 * Selected phases combine with OR, and each activity is returned once.
 * The result is ordered by how much of that colour is in the illustration,
 * the fullest colour first. Equal amounts keep library order.
 */
export function filterActivitiesByPhases(
  activities: readonly ActivityRecord[],
  phases: readonly PhaseId[],
): ActivityRecord[] {
  if (phases.length === 0) return activities.slice();
  return activities
    .filter((activity) => selectedPhaseColourAmount(activity, phases) > 0)
    .sort(
      (left, right) =>
        selectedPhaseColourAmount(right, phases) - selectedPhaseColourAmount(left, phases) ||
        left.libraryIndex - right.libraryIndex,
    );
}

/**
 * Search first, then phase filters.
 * The query and the phase set combine with AND.
 * Selected phases combine with OR.
 */
export function applyActivityFilters(
  activities: readonly ActivityRecord[],
  filter: ActivityFilter,
): ActivityRecord[] {
  const searched = activities.filter((activity) => matchActivitySearch(activity, filter.query));
  return filterActivitiesByPhases(searched, filter.phases);
}
