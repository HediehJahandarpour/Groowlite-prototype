import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITY_REGISTRY, type ActivityRecord } from "../src/data/activityRegistry";
import { PHASE_PALETTE, type PhaseId } from "../src/data/phasePalette";
import { illustrationColourAmount } from "../src/recommendations/colourAnalysis";
import {
  PHASE_FILTERS,
  PHASE_MEMBERSHIP,
  applyActivityFilters,
  filterActivitiesByPhases,
  foldSearchText,
  matchActivitySearch,
  selectedPhaseColourAmount,
} from "../src/recommendations/activityFilters";
import { activityLayersFor } from "../src/recommendations/radialGrouping";
import { rankActivities } from "../src/recommendations/rankingEngine";
import { RECOMMENDATION_WEIGHTS } from "../src/recommendations/recommendationConfig";
import type { ProcessToken, TokenCategory, TokenType } from "../src/process/processTypes";

const PHASES: PhaseId[] = ["understand", "discover", "design", "make", "share"];

function token(
  id: string,
  type: TokenType,
  asset: string,
  label: string,
  category: TokenCategory,
): ProcessToken {
  return { id, type, asset, label, category, order: 0, permanent: type === "start" || type === "end" };
}

function phaseToken(phase: PhaseId): ProcessToken {
  const label = phase[0].toUpperCase() + phase.slice(1);
  return token(phase, "phase", PHASE_PALETTE[phase].asset, label, "phase");
}

function activityToken(id: string): ProcessToken {
  const activity = ACTIVITY_REGISTRY.find((item) => item.id === id);
  if (!activity) throw new Error(`Missing activity ${id}`);
  return token(id, "activity", activity.asset, activity.label, "activity");
}

function processAt(middles: ProcessToken[]) {
  const tokens: ProcessToken[] = [
    token("start", "start", "vertrekpunt@2x.png", "Starting point", "anchor"),
    ...middles.map((item, index) => ({ ...item, order: index + 1 })),
    token("end", "end", "eindpunt@2x.png", "Endpoint", "anchor"),
  ];
  tokens[0].order = 0;
  tokens[tokens.length - 1].order = middles.length + 1;
  return { tokens, insertionIndex: middles.length };
}

test("filter pills use the existing phase ids and the Figma labels", () => {
  assert.deepEqual(
    PHASE_FILTERS.map((phase) => phase.id),
    ["discover", "understand", "share", "design", "make"],
  );
  assert.deepEqual(
    PHASE_FILTERS.map((phase) => phase.label),
    ["Discovery", "Understand", "Shape", "Design", "Make"],
  );
  for (const phase of PHASE_FILTERS) assert.ok(PHASES.includes(phase.id));
});

test("an empty search and no phase filters return the whole library once", () => {
  const filtered = applyActivityFilters(ACTIVITY_REGISTRY, { query: "   ", phases: [] });
  assert.deepEqual(
    filtered.map((activity) => activity.id),
    ACTIVITY_REGISTRY.map((activity) => activity.id),
  );
});

test("search matches printed names, partial words, and ignores case and extra spaces", () => {
  const literature = ACTIVITY_REGISTRY.find((activity) => activity.id === "literatuur-inzetten");
  assert.ok(literature);
  assert.equal(matchActivitySearch(literature, "LITERATURE"), true);
  assert.equal(matchActivitySearch(literature, "  using   lit "), true);
  assert.equal(matchActivitySearch(literature, "prototype"), false);
});

test("search matches a provisional purpose label when the printed name does not", () => {
  const matches = applyActivityFilters(ACTIVITY_REGISTRY, { query: "research", phases: [] });
  assert.ok(matches.length > 0);
  for (const activity of matches) {
    const text = `${activity.label} ${activity.purposes.join(" ")} ${activity.id}`.toLowerCase();
    assert.equal(foldSearchText(text).includes("research") || activity.id.includes("research"), true);
  }
});

test("search folds accents", () => {
  const sample = ACTIVITY_REGISTRY[0];
  const accented: ActivityRecord = { ...sample, id: "resume", label: "Résumé", note: "Résumé", purposes: [] };
  assert.equal(matchActivitySearch(accented, "resume"), true);
});

test("phase filters keep an activity when any selected phase matches, fullest colour first", () => {
  const phases = ["understand", "discover"] as const;
  const filtered = filterActivitiesByPhases(ACTIVITY_REGISTRY, phases);
  const ids = filtered.map((activity) => activity.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(filtered.length < ACTIVITY_REGISTRY.length);
  let previousAmount = Number.POSITIVE_INFINITY;
  for (const activity of filtered) {
    const matches =
      activity.associationSource !== "unknown" &&
      (activity.phaseAssociations.understand >= PHASE_MEMBERSHIP ||
        activity.phaseAssociations.discover >= PHASE_MEMBERSHIP);
    assert.equal(matches, true, activity.id);
    const amount = selectedPhaseColourAmount(activity, phases);
    assert.ok(amount > 0, activity.id);
    assert.ok(amount <= previousAmount, activity.id);
    previousAmount = amount;
  }
  const hidden = ACTIVITY_REGISTRY.filter((activity) => !ids.includes(activity.id));
  for (const activity of hidden) {
    assert.ok(activity.phaseAssociations.understand < PHASE_MEMBERSHIP);
    assert.ok(activity.phaseAssociations.discover < PHASE_MEMBERSHIP);
  }
  const discover = filterActivitiesByPhases(ACTIVITY_REGISTRY, ["discover"]);
  const fullest = ACTIVITY_REGISTRY.filter(
    (activity) =>
      activity.associationSource !== "unknown" &&
      activity.phaseAssociations.discover >= PHASE_MEMBERSHIP,
  ).reduce((best, activity) =>
    illustrationColourAmount(activity.asset, "discover") >
    illustrationColourAmount(best.asset, "discover")
      ? activity
      : best,
  );
  assert.equal(discover[0]?.id, fullest.id);
});

test("a keyword and a phase filter both have to match", () => {
  const filtered = applyActivityFilters(ACTIVITY_REGISTRY, { query: "research", phases: ["understand"] });
  for (const activity of filtered) {
    assert.equal(matchActivitySearch(activity, "research"), true);
    assert.ok(activity.phaseAssociations.understand >= PHASE_MEMBERSHIP);
  }
  const searchOnly = applyActivityFilters(ACTIVITY_REGISTRY, { query: "research", phases: [] });
  assert.ok(filtered.length <= searchOnly.length);
});

test("an unknown phase reading is excluded once a phase filter is selected", () => {
  const sample = ACTIVITY_REGISTRY[0];
  const unknown: ActivityRecord = {
    ...sample,
    id: "unknown-activity",
    label: "Unknown activity",
    associationSource: "unknown",
    phaseAssociations: {
      understand: 0.5,
      discover: 0.5,
      design: 0.5,
      make: 0.5,
      share: 0.5,
    },
  };
  const filtered = filterActivitiesByPhases([unknown, sample], ["make"]);
  assert.equal(
    filtered.some((activity) => activity.id === "unknown-activity"),
    false,
  );
});

test("a phase filter orders the radial by illustration colour, and the ranker still scores that pool", () => {
  const makeOnly = applyActivityFilters(ACTIVITY_REGISTRY, { query: "", phases: ["make"] });
  assert.ok(!makeOnly.some((activity) => activity.id === "brainstorm"));
  const built = processAt([phaseToken("understand"), activityToken("brainstorm")]);
  const ranked = rankActivities({
    activities: makeOnly,
    catalog: ACTIVITY_REGISTRY,
    processTokens: built.tokens,
    insertionIndex: built.insertionIndex,
    weights: RECOMMENDATION_WEIGHTS,
  });
  const withoutContext = rankActivities({
    activities: makeOnly,
    processTokens: built.tokens,
    insertionIndex: built.insertionIndex,
    weights: RECOMMENDATION_WEIGHTS,
  });

  assert.equal(ranked.length, makeOnly.length);
  assert.equal(new Set(ranked.map((item) => item.activityId)).size, ranked.length);
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const current = ranked[index];
    assert.ok(
      previous.totalScore > current.totalScore ||
        (previous.totalScore === current.totalScore &&
          previous.originalLibraryIndex <= current.originalLibraryIndex),
    );
  }
  assert.notDeepEqual(
    ranked.map((item) => item.totalScore),
    withoutContext.map((item) => item.totalScore),
  );

  const { layers } = activityLayersFor(built.tokens, built.insertionIndex, makeOnly, ["make"]);
  const shown = layers.flat().map((activity) => activity.id);
  assert.deepEqual(shown, makeOnly.map((activity) => activity.id));
  let previousAmount = Number.POSITIVE_INFINITY;
  for (const activity of makeOnly) {
    const amount = illustrationColourAmount(activity.asset, "make");
    assert.ok(amount <= previousAmount, activity.id);
    previousAmount = amount;
  }
});

test("no matches produce an empty radial distribution", () => {
  const none = applyActivityFilters(ACTIVITY_REGISTRY, { query: "zzzz-not-a-token", phases: ["make"] });
  assert.deepEqual(none, []);
  const built = processAt([phaseToken("discover")]);
  const layers = activityLayersFor(built.tokens, built.insertionIndex, none);
  assert.deepEqual(layers.ranked, []);
  assert.deepEqual(layers.layers, []);
});
