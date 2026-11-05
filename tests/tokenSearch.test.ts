import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITY_REGISTRY } from "../src/data/activityRegistry";
import { applyActivityFilters } from "../src/recommendations/activityFilters";
import { searchTokenLibrary } from "../src/recommendations/tokenSearch";
import { TOKEN_CATALOG } from "../src/process/tokenCatalog";
import {
  PHASE_ARC,
  blendPhaseSeats,
  phaseArcEntries,
  phaseCircleBlend,
  placePhaseArc,
  placePhaseCircle,
} from "../src/exploration/phaseArcLayout";

test("global search finds phases, activities, and checkpoints", () => {
  const understand = searchTokenLibrary("Understand");
  assert.ok(understand.some((hit) => hit.id === "understand" && hit.type === "phase"));

  const prototype = searchTokenLibrary("Prototype");
  assert.ok(prototype.some((hit) => hit.id === "prototype" && hit.type === "activity"));

  const checkpoint = searchTokenLibrary("Checkpoint");
  assert.ok(checkpoint.some((hit) => hit.type === "checkpoint"));
});

test("global search ignores manual phase filters", () => {
  const filtered = applyActivityFilters(ACTIVITY_REGISTRY, {
    query: "Prototype",
    phases: ["discover"],
  });
  assert.equal(
    filtered.some((activity) => activity.id === "prototype"),
    false,
    "manual Discover filter would hide Prototype",
  );

  const hits = searchTokenLibrary("Prototype");
  assert.ok(
    hits.some((hit) => hit.id === "prototype"),
    "global search still finds Prototype",
  );
});

test("search relevance prefers exact and prefix name matches", () => {
  const hits = searchTokenLibrary("plan");
  assert.ok(hits.length > 0);
  const first = hits[0];
  assert.ok(first);
  assert.ok(
    first.match === "exact" ||
      first.match === "prefix" ||
      first.match === "name",
  );
  for (let index = 1; index < hits.length; index += 1) {
    assert.ok(hits[index - 1].score >= hits[index].score);
  }
});

test("empty or whitespace queries return no hits", () => {
  assert.deepEqual(searchTokenLibrary("   "), []);
  assert.deepEqual(searchTokenLibrary(""), []);
});

test("phase arc uses the catalog once, in the Figma right-hand order", () => {
  const entries = phaseArcEntries();
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [...PHASE_ARC.phaseIds],
  );
  assert.equal(entries.length, TOKEN_CATALOG.phase.length);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);

  const seats = placePhaseArc(400, 1200, 800, 130);
  assert.equal(seats.length, 5);
  for (const seat of seats) {
    assert.ok(seat.x > 0, `${seat.entry.id} should sit on the right`);
  }
  // Near the gradient rim (radiusFactor ~1 + light clearance).
  assert.ok(seats[2].x > 380, "middle phase should sit near the plate rim");
  assert.ok(seats[2].x < 520, "middle phase should stay close to the gradient");
  // Top to bottom: y increases downward in screen space.
  for (let index = 1; index < seats.length; index += 1) {
    assert.ok(seats[index].y > seats[index - 1].y);
  }
});

test("phase arc morphs from the open half to a full circle with scroll", () => {
  const open = placePhaseArc(400, 1200, 800, 130);
  const circle = placePhaseCircle(220, 1200, 800, 130);
  assert.equal(circle.length, 5);
  // Full circle starts at the top.
  assert.ok(Math.abs(circle[0].x) < 1e-6);
  assert.ok(circle[0].y < 0);

  assert.equal(phaseCircleBlend(0, 4), 0);
  assert.equal(phaseCircleBlend(4, 4), 1);
  assert.ok(phaseCircleBlend(2, 4) < phaseCircleBlend(3.5, 4));

  const mid = blendPhaseSeats(open, circle, 0.5);
  assert.equal(mid.length, 5);
  assert.equal(mid[0].entry.id, open[0].entry.id);
  assert.ok(Math.abs(mid[0].x - (open[0].x + circle[0].x) / 2) < 1);
  assert.ok(PHASE_ARC.circleSizeFactor > PHASE_ARC.sizeFactor);
});
