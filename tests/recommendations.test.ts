import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ACTIVITY_REGISTRY, type ActivityRecord } from "../src/data/activityRegistry";
import { ACTIVITY_SEMANTICS } from "../src/data/activityMetadata";
import { COLOUR_ANALYSIS } from "../src/data/phaseColourCache";
import { PHASE_PALETTE, type PhaseId } from "../src/data/phasePalette";
import { activityLayersFor, distributeIntoLayers } from "../src/recommendations/radialGrouping";
import { rankActivities } from "../src/recommendations/rankingEngine";
import { readProcessContext } from "../src/recommendations/processContext";
import {
  layerCapacitiesFor,
  NEUTRAL_SCORE,
  RECOMMENDATION_WEIGHTS,
} from "../src/recommendations/recommendationConfig";
import { filterActivitiesByPhases } from "../src/recommendations/activityFilters";
import { emptyPhaseScores } from "../src/recommendations/colourAnalysis";
import type { ProcessToken, TokenCategory, TokenType } from "../src/process/processTypes";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function processAt(middles: ProcessToken[], insertionIndex = middles.length) {
  const tokens: ProcessToken[] = [
    token("start", "start", "vertrekpunt@2x.png", "Starting point", "anchor"),
    ...middles.map((item, index) => ({ ...item, order: index + 1 })),
    token("end", "end", "eindpunt@2x.png", "Endpoint", "anchor"),
  ];
  tokens[0].order = 0;
  tokens[tokens.length - 1].order = middles.length + 1;
  return { tokens, insertionIndex };
}

function rankedAt(middles: ProcessToken[], insertionIndex?: number) {
  const built = processAt(middles, insertionIndex);
  return rankActivities({
    activities: ACTIVITY_REGISTRY,
    processTokens: built.tokens,
    insertionIndex: built.insertionIndex,
    weights: RECOMMENDATION_WEIGHTS,
  });
}

function indexOf(ranked: { activityId: string }[], id: string): number {
  return ranked.findIndex((item) => item.activityId === id);
}

test("every activity asset on disk is registered once, and structural tokens are left out", () => {
  const onDisk = readdirSync(path.join(ROOT, "public/tokens")).filter((name) => name.endsWith("@2x.png"));
  const phaseAssets = new Set(Object.values(COLOUR_ANALYSIS.phaseAssets));
  const excluded = new Set(COLOUR_ANALYSIS.excluded.map((item) => item.asset));
  const discovered = Object.keys(COLOUR_ANALYSIS.profiles);
  const registered = ACTIVITY_REGISTRY.map((activity) => activity.asset);

  for (const file of onDisk) {
    const accounted = phaseAssets.has(file) || excluded.has(file) || discovered.includes(file);
    assert.equal(accounted, true, `${file} is not classified`);
  }
  assert.deepEqual(registered.slice().sort(), discovered.slice().sort());
  assert.equal(new Set(registered).size, registered.length);
  assert.equal(new Set(ACTIVITY_REGISTRY.map((activity) => activity.id)).size, ACTIVITY_REGISTRY.length);
  for (const asset of excluded) assert.equal(registered.includes(asset), false);
  for (const asset of phaseAssets) assert.equal(registered.includes(asset), false);
});

test("semantic links only point at registered activities", () => {
  const ids = new Set(ACTIVITY_REGISTRY.map((activity) => activity.id));
  for (const activity of ACTIVITY_REGISTRY) {
    assert.equal(ACTIVITY_SEMANTICS[activity.id] !== undefined, true, activity.id);
    for (const id of activity.predecessors) assert.equal(ids.has(id), true, id);
    for (const id of activity.successors) assert.equal(ids.has(id), true, id);
  }
});

test("every activity is scored and placed on exactly one layer", () => {
  const ranked = rankedAt([phaseToken("understand")]);
  const layers = distributeIntoLayers(ranked, ACTIVITY_REGISTRY);
  const ids = layers.flat().map((activity) => activity.id);
  assert.equal(ranked.length, ACTIVITY_REGISTRY.length);
  assert.equal(ids.length, ACTIVITY_REGISTRY.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(layers.at(-1)?.length ? layers.at(-1)!.length > 0 : false, true);
  assert.equal(layers[0].length <= 7, true);
  for (const layer of layers.slice(1)) assert.equal(layer.length <= 14, true);
});

test("a phase-sized pool fits on three Figma rings", () => {
  assert.deepEqual(layerCapacitiesFor(22), [7, 10, 5]);
  assert.deepEqual(layerCapacitiesFor(27), [7, 10, 10]);
  assert.deepEqual(layerCapacitiesFor(16), [6, 10]);
  for (const phase of PHASES) {
    const pool = filterActivitiesByPhases(ACTIVITY_REGISTRY, [phase]);
    const { layers } = activityLayersFor([phaseToken(phase)], 1, pool, [phase]);
    assert.ok(layers.length <= 3, `${phase} should use at most three rings`);
    assert.equal(
      layers.flat().length,
      pool.length,
      `${phase} should keep every filtered activity`,
    );
    if (layers[0]) assert.ok(layers[0].length <= 7);
    if (layers[1]) assert.ok(layers[1].length <= 14);
  }
});

test("identical scores keep library order", () => {
  const blank = (id: string, libraryIndex: number): ActivityRecord => ({
    id,
    asset: `${id}.png`,
    label: id,
    type: "activity",
    category: "activity",
    libraryIndex,
    phaseAssociations: emptyPhaseScores(),
    associationSource: "unknown",
    purposes: [],
    purposeSource: "unknown",
    predecessors: [],
    successors: [],
    note: id,
  });
  const activities = [blank("later", 4), blank("earlier", 1)];
  const ranked = rankActivities({
    activities,
    processTokens: processAt([]).tokens,
    insertionIndex: 0,
    weights: RECOMMENDATION_WEIGHTS,
  });
  assert.equal(ranked[0].activityId, "earlier");
  assert.equal(ranked[1].activityId, "later");
  assert.equal(ranked[0].totalScore, ranked[1].totalScore);
});

test("a gap with no phase stays neutral instead of assuming Understand", () => {
  const ranked = rankedAt([]);
  const context = readProcessContext(processAt([]).tokens, 0, ACTIVITY_REGISTRY);
  assert.equal(context.activePhase, null);
  for (const item of ranked) {
    assert.equal(item.phaseScore, NEUTRAL_SCORE);
    assert.match(item.explanation, /neutral/i);
  }
});

test("missing phase and purpose metadata stays neutral and does not throw", () => {
  const ghost: ActivityRecord = {
    id: "ghost",
    asset: "ghost.png",
    label: "Ghost",
    type: "activity",
    category: "activity",
    libraryIndex: 0,
    phaseAssociations: emptyPhaseScores(),
    associationSource: "unknown",
    purposes: [],
    purposeSource: "unknown",
    predecessors: [],
    successors: [],
    note: "Ghost",
  };
  const built = processAt([phaseToken("understand"), activityToken("brainstorm")]);
  const ranked = rankActivities({
    activities: [ghost],
    processTokens: built.tokens,
    insertionIndex: 2,
    weights: RECOMMENDATION_WEIGHTS,
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].phaseScore, NEUTRAL_SCORE);
  assert.equal(ranked[0].contextScore, NEUTRAL_SCORE);
  assert.equal(ranked[0].workflowScore, NEUTRAL_SCORE);
  assert.equal(ranked[0].metadataConfidence, "unknown");
  assert.match(ranked[0].explanation, /incomplete|neutral|No reliable phase/i);
});

for (const phase of PHASES) {
  const specialist: Record<PhaseId, string> = {
    understand: "literatuur-inzetten",
    discover: "persona",
    design: "brainstorm",
    make: "filmen",
    share: "presenteren",
  };
  const elsewhere: Record<PhaseId, string> = {
    understand: "presenteren",
    discover: "filmen",
    design: "persona",
    make: "persona",
    share: "persona",
  };

  test(`${phase}: activities in that colour rank nearer the centre`, () => {
    const ranked = rankedAt([phaseToken(phase)]);
    const layers = distributeIntoLayers(ranked, ACTIVITY_REGISTRY);
    const near = indexOf(ranked, specialist[phase]);
    const far = indexOf(ranked, elsewhere[phase]);
    const nearRecord = ACTIVITY_REGISTRY.find((item) => item.id === specialist[phase]);
    const farRecord = ACTIVITY_REGISTRY.find((item) => item.id === elsewhere[phase]);
    assert.ok(nearRecord && farRecord);
    assert.ok(nearRecord.phaseAssociations[phase] > farRecord.phaseAssociations[phase]);
    assert.ok(ranked[near].phaseScore > ranked[far].phaseScore);
    assert.ok(near < far);

    const scoreOf = (layer: ActivityRecord[]) =>
      layer.reduce((sum, activity) => sum + activity.phaseAssociations[phase], 0) / layer.length;
    assert.ok(scoreOf(layers[0]) > scoreOf(layers[layers.length - 1]));
    assert.match(ranked[near].explanation, /Provisional colour reading/);
    assert.doesNotMatch(ranked[near].explanation, /Official phase metadata/);
  });
}

test("a token with several phase colours keeps each association", () => {
  const literature = ACTIVITY_REGISTRY.find((item) => item.id === "literatuur-inzetten");
  assert.ok(literature);
  assert.equal(literature.associationSource, "colour-inferred");
  assert.ok(literature.phaseAssociations.understand >= 0.6);
  assert.ok(literature.phaseAssociations.discover >= 0.6);

  const inUnderstand = rankedAt([phaseToken("understand")]);
  const inDiscover = rankedAt([phaseToken("discover")]);
  const inShare = rankedAt([phaseToken("share")]);
  const score = (ranked: { activityId: string; phaseScore: number }[]) =>
    ranked.find((item) => item.activityId === "literatuur-inzetten")?.phaseScore ?? -1;
  assert.equal(score(inUnderstand), literature.phaseAssociations.understand);
  assert.equal(score(inDiscover), literature.phaseAssociations.discover);
  assert.ok(score(inShare) < 0.25);
});

test("the closest preceding phase is used when inserting in the middle", () => {
  const middles = [
    phaseToken("understand"),
    activityToken("onderzoeken"),
    phaseToken("discover"),
    activityToken("brainstorm"),
  ];
  const between = readProcessContext(processAt(middles, 2).tokens, 2, ACTIVITY_REGISTRY);
  assert.equal(between.activePhase, "understand");
  assert.equal(between.previousActivity?.activityId, "onderzoeken");
  assert.equal(between.nextToken?.type, "phase");

  const atEnd = readProcessContext(processAt(middles, 4).tokens, 4, ACTIVITY_REGISTRY);
  assert.equal(atEnd.activePhase, "discover");
  assert.equal(atEnd.previousActivity?.activityId, "brainstorm");
});

test("changing the previous activity changes the ranking", () => {
  const afterPrototype = rankedAt([phaseToken("make"), activityToken("prototype")]);
  const afterResearch = rankedAt([phaseToken("make"), activityToken("onderzoeken")]);
  const testIndex = (ranked: { activityId: string }[]) => indexOf(ranked, "gebruikerstest");
  const analysisIndex = (ranked: { activityId: string }[]) => indexOf(ranked, "data-analyse");
  assert.ok(testIndex(afterPrototype) < analysisIndex(afterPrototype));
  assert.ok(analysisIndex(afterResearch) < testIndex(afterResearch));

  const testScore = (ranked: { activityId: string; contextScore: number }[], id: string) =>
    ranked.find((item) => item.activityId === id)?.contextScore ?? -1;
  assert.ok(testScore(afterPrototype, "gebruikerstest") > testScore(afterPrototype, "enquete"));
  assert.ok(testScore(afterResearch, "data-analyse") > testScore(afterResearch, "gebruikerstest"));
});

test("a later phase does not override the insertion position", () => {
  const middles = [
    phaseToken("share"),
    activityToken("presenteren"),
    phaseToken("understand"),
  ];
  const context = readProcessContext(processAt(middles).tokens, 3, ACTIVITY_REGISTRY);
  assert.equal(context.activePhase, "understand");
  assert.equal(context.previousActivity?.activityId, "presenteren");
});

test("the previous activity stays in the near suggestions, with process follow-ups from other phases", () => {
  const middles = [phaseToken("share"), activityToken("gebruikerstest")];
  const { layers } = activityLayersFor(processAt(middles).tokens, middles.length);
  const front = layers[0].map((activity) => activity.id);
  assert.ok(front.includes("gebruikerstest"));
  assert.ok(front.includes("kwaliteitscontrole"));
  assert.ok(front.includes("echt-nep") || front.includes("nabespreken"));
  assert.ok(front.includes("prototype"));
  const nearest = front.slice(0, 4);
  assert.equal(nearest.includes("presenteren"), false);
  assert.equal(nearest.includes("duiveltje"), false);

  const shown = layers.flat().map((activity) => activity.id);
  assert.equal(shown.length, ACTIVITY_REGISTRY.length);
  assert.equal(new Set(shown).size, shown.length);
});

test("a previous activity with a weak phase colour is still suggested first", () => {
  const brainstorm = ACTIVITY_REGISTRY.find((activity) => activity.id === "brainstorm");
  assert.ok(brainstorm);
  const related = new Set([...brainstorm.successors, ...brainstorm.predecessors]);
  const middles = [phaseToken("share"), activityToken("brainstorm")];
  const { layers } = activityLayersFor(processAt(middles).tokens, middles.length);
  const front = layers[0].map((activity) => activity.id);
  assert.equal(front[0], "brainstorm");
  assert.ok(front.some((id) => related.has(id)));
});

test("after a prototype, the previous token and a recorded next step lead the suggestions", () => {
  const middles = [phaseToken("make"), activityToken("prototype")];
  const { layers, ordered } = activityLayersFor(processAt(middles).tokens, middles.length);
  const front = layers[0].map((activity) => activity.id);
  const followsPrototype = new Set(
    ACTIVITY_REGISTRY.find((activity) => activity.id === "prototype")?.successors ?? [],
  );
  assert.ok(front.includes("prototype"));
  assert.ok(front.some((id) => followsPrototype.has(id)));
  assert.equal(front.includes("onderzoeken"), false);
  assert.ok(indexOf(ordered, "gebruikerstest") < indexOf(ordered, "onderzoeken"));
});

test("an activity already used earlier in the process is suggested before an unrelated colour match", () => {
  const middles = [
    phaseToken("understand"),
    activityToken("onderzoeken"),
    phaseToken("share"),
    activityToken("gebruikerstest"),
  ];
  const { ordered } = activityLayersFor(processAt(middles).tokens, middles.length);
  const research = indexOf(ordered, "onderzoeken");
  const devil = indexOf(ordered, "duiveltje");
  assert.ok(research >= 0 && devil >= 0);
  assert.ok(research < devil);
});

test("repeated activities stay in the library exactly once", () => {
  const ranked = rankedAt([
    phaseToken("discover"),
    activityToken("brainstorm"),
    activityToken("brainstorm"),
  ]);
  const copies = ranked.filter((item) => item.activityId === "brainstorm");
  assert.equal(copies.length, 1);
  assert.equal(ranked.length, ACTIVITY_REGISTRY.length);
});

test("stepping back to an earlier phase is ranked, not rejected", () => {
  const ranked = rankedAt([
    phaseToken("share"),
    activityToken("presenteren"),
    phaseToken("understand"),
  ]);
  assert.equal(ranked.length, ACTIVITY_REGISTRY.length);
  const research = ranked.find((item) => item.activityId === "onderzoeken");
  assert.ok(research);
  assert.ok(research.totalScore > 0);
  assert.equal(layersContainAll(ranked), true);
});

test("a nearby checkpoint raises reflection without hiding other activities", () => {
  const ranked = rankedAt([
    phaseToken("discover"),
    activityToken("brainstorm"),
    token("checkpoint", "checkpoint", "checkpunt@2x.png", "Checkpoint", "checkpoint"),
  ]);
  const reflect = ranked.find((item) => item.activityId === "reflecteren");
  const survey = ranked.find((item) => item.activityId === "enquete");
  assert.ok(reflect && survey);
  assert.ok(reflect.contextScore > survey.contextScore);
  assert.equal(ranked.length, ACTIVITY_REGISTRY.length);
});

test("custom weights are applied and normalised", () => {
  const built = processAt([phaseToken("share")]);
  const ranked = rankActivities({
    activities: ACTIVITY_REGISTRY,
    processTokens: built.tokens,
    insertionIndex: built.insertionIndex,
    weights: { phaseWeight: 1, contextWeight: 0, workflowWeight: 0 },
  });
  for (const item of ranked) assert.equal(item.totalScore, item.phaseScore);
});

function layersContainAll(ranked: { activityId: string }[]): boolean {
  const ids = distributeIntoLayers(
    ranked.map((item) => ({ ...item, totalScore: 0, phaseScore: 0, contextScore: 0, workflowScore: 0, originalLibraryIndex: 0, explanation: "", metadataConfidence: "unknown" as const })),
    ACTIVITY_REGISTRY,
  )
    .flat()
    .map((activity) => activity.id);
  return ids.length === ACTIVITY_REGISTRY.length && new Set(ids).size === ids.length;
}
