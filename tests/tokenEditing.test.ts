import assert from "node:assert/strict";
import test from "node:test";
import { duplicateToken, removeToken, replaceToken, rotateToken } from "../src/process/editToken";
import { insertToken } from "../src/process/insertToken";
import { layoutProcess } from "../src/process/processLayout";
import { downwardLabelSpin, END_ENTRY_EDGE, START_EXIT_EDGE, distance } from "../src/process/tokenGeometry";
import type { ProcessToken } from "../src/process/processTypes";
import type { CatalogEntry } from "../src/process/tokenCatalog";

function token(partial: Pick<ProcessToken, "id" | "type" | "label" | "asset"> & { order: number }): ProcessToken {
  const category = partial.type === "phase" || partial.type === "activity" ? partial.type : "anchor";
  return {
    category,
    permanent: partial.type === "start" || partial.type === "end",
    ...partial,
  };
}

function processWith(...middles: ProcessToken[]): ProcessToken[] {
  return [
    token({ id: "start", type: "start", label: "Starting point", asset: "vertrekpunt@2x.png", order: 0 }),
    ...middles,
    token({
      id: "end",
      type: "end",
      label: "Endpoint",
      asset: "eindpunt@2x.png",
      order: middles.length + 1,
    }),
  ];
}

const understand = token({
  id: "understand",
  type: "phase",
  label: "Understand",
  asset: "begrijpen@2x.png",
  order: 1,
});

const brainstorm = token({
  id: "brainstorm",
  type: "activity",
  label: "Brainstorm",
  asset: "brainstorm@2x.png",
  order: 2,
});

const planning = token({
  id: "planning",
  type: "activity",
  label: "Planning",
  asset: "planning@2x.png",
  order: 3,
});

test("remove drops one token and leaves a checkpoint in its own slot", () => {
  const checkpoint: ProcessToken = {
    id: "check",
    type: "checkpoint",
    label: "Checkpoint",
    category: "checkpoint",
    order: 4,
    permanent: false,
    asset: "checkpunt@2x.png",
  };
  const next = removeToken(processWith(understand, brainstorm, planning, checkpoint), "brainstorm");
  assert.deepEqual(
    next.map((item) => item.id),
    ["start", "understand", "planning", "check", "end"],
  );
  const withoutCheckpoint = removeToken(next, "check");
  assert.deepEqual(
    withoutCheckpoint.map((item) => item.id),
    ["start", "understand", "planning", "end"],
  );
});

test("a checkpoint fills the next process slot", () => {
  const checkpoint: ProcessToken = {
    id: "check",
    type: "checkpoint",
    label: "Checkpoint",
    category: "checkpoint",
    order: 2,
    permanent: false,
    asset: "checkpunt@2x.png",
  };
  const layout = layoutProcess(processWith(understand, checkpoint));
  const placed = layout.placed.find((item) => item.token.id === "check");
  const slot = layout.slots[0];
  assert.equal(layout.occupied, 1);
  assert.ok(placed && slot);
  assert.ok(Math.hypot(placed.x - slot.entry.x, placed.y - slot.entry.y) < 1);
  assert.ok(placed.outputX !== null && placed.outputY !== null);
  assert.ok(Math.hypot(placed.outputX - slot.exit.x, placed.outputY - slot.exit.y) < 1);
});

test("rotate keeps the slot and turns the artwork one pentagon step", () => {
  const next = rotateToken(processWith(understand), "understand");
  assert.equal(next.find((item) => item.id === "understand")?.turn, 1);
  assert.equal(next.find((item) => item.id === "start")?.turn, undefined);
});

test("duplicate inserts the copy after the original", () => {
  const next = duplicateToken(processWith(understand, brainstorm), "understand", "copy");
  assert.deepEqual(
    next.tokens.map((item) => item.id),
    ["start", "understand", "copy", "brainstorm", "end"],
  );
});

test("replace keeps the id and swaps the picture", () => {
  const entry: CatalogEntry = {
    id: "design",
    asset: "ontwerpen@2x.png",
    label: "Design",
    type: "phase",
    category: "phase",
  };
  const next = replaceToken(processWith(understand), "understand", entry);
  const updated = next.find((item) => item.id === "understand");
  assert.equal(updated?.asset, "ontwerpen@2x.png");
  assert.equal(updated?.label, "Design");
});

test("an open slot shifts the following token onto the next pentagon", () => {
  const tokens = processWith(understand, brainstorm, planning);
  const closed = layoutProcess(tokens);
  const opened = layoutProcess(tokens, 0);
  const brainstormClosed = closed.placed.find((item) => item.token.id === "brainstorm");
  const planningClosed = closed.placed.find((item) => item.token.id === "planning");
  const brainstormOpened = opened.placed.find((item) => item.token.id === "brainstorm");
  assert.ok(brainstormClosed && planningClosed && brainstormOpened);
  const moved = Math.hypot(
    brainstormOpened.x - brainstormClosed.x,
    brainstormOpened.y - brainstormClosed.y,
  );
  const towardNext = Math.hypot(
    brainstormOpened.x - planningClosed.x,
    brainstormOpened.y - planningClosed.y,
  );
  assert.ok(moved > 1);
  assert.ok(towardNext < moved);
});

test("the starting block begins with a phase, and phases outsize activities", () => {
  const blocked = insertToken(processWith(), 0, {
    id: "brainstorm",
    asset: "brainstorm@2x.png",
    label: "Brainstorm",
    type: "activity",
    category: "activity",
  });
  assert.deepEqual(
    blocked.map((item) => item.id),
    ["start", "end"],
  );
  const blockedCheckpoint = insertToken(processWith(), 0, {
    id: "checkpoint",
    asset: "checkpunt@2x.png",
    label: "Checkpoint",
    type: "checkpoint",
    category: "checkpoint",
  });
  assert.deepEqual(
    blockedCheckpoint.map((item) => item.id),
    ["start", "end"],
  );

  const design = token({
    id: "design",
    type: "phase",
    label: "Design",
    asset: "ontwerpen@2x.png",
    order: 2,
  });
  const layout = layoutProcess(processWith(understand, design, brainstorm));
  const start = layout.placed.find((item) => item.token.id === "start");
  const end = layout.placed.find((item) => item.token.id === "end");
  const phase = layout.placed.find((item) => item.token.id === "design");
  const activity = layout.placed.find((item) => item.token.id === "brainstorm");
  assert.ok(start && end && phase && activity);
  const startEdge = distance(START_EXIT_EDGE[0], START_EXIT_EDGE[1]) * start.scale;
  const phaseEdge = 230 * phase.scale;
  const activityEdge = 177 * activity.scale;
  assert.ok(Math.abs(phaseEdge - startEdge) / startEdge < 0.02);
  assert.ok(activityEdge < phaseEdge * 0.85);
  const endNotch = distance(END_ENTRY_EDGE[0], END_ENTRY_EDGE[1]) * end.scale;
  assert.ok(Math.abs(endNotch - activityEdge) / activityEdge < 0.05);
  const activitySlot = layout.slots[1];
  assert.ok(activitySlot);
  assert.ok(Math.hypot(end.x - activitySlot.exit.x, end.y - activitySlot.exit.y) < 1);
});

test("label spin turns the artwork so the word faces down", () => {
  for (const degrees of [0, 40, 90, -90, 180, 36]) {
    const spin = downwardLabelSpin((degrees * Math.PI) / 180);
    const facing = (((degrees + spin) % 360) + 360) % 360;
    const tilt = Math.min(facing, 360 - facing);
    assert.ok(tilt <= 36, `${degrees}° ends ${tilt}° from straight down`);
    assert.equal(spin % 72, 0);
  }
  assert.equal(downwardLabelSpin(0), 0);
});
