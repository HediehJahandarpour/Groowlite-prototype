import assert from "node:assert/strict";
import test from "node:test";
import { autoPanDelta, chooseDropIndex } from "../src/process/dragTargets";
import { lerpPoses } from "../src/process/dragPose";
import { layoutProcess } from "../src/process/processLayout";
import {
  isValidDropIndex,
  middleTokens,
  moveProcessBlock,
  moveProcessToken,
  spanForToken,
} from "../src/process/reorderToken";
import type { ProcessToken } from "../src/process/processTypes";

function token(
  partial: Pick<ProcessToken, "id" | "type" | "label" | "asset"> & { order: number; turn?: number },
): ProcessToken {
  const category =
    partial.type === "phase" || partial.type === "activity" || partial.type === "checkpoint"
      ? partial.type
      : "anchor";
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
  turn: 2,
});
const planning = token({
  id: "planning",
  type: "activity",
  label: "Planning",
  asset: "planning@2x.png",
  order: 3,
});
const design = token({
  id: "design",
  type: "phase",
  label: "Design",
  asset: "ontwerpen@2x.png",
  order: 4,
});
const research = token({
  id: "research",
  type: "activity",
  label: "Research",
  asset: "onderzoeken@2x.png",
  order: 5,
});
const checkpoint = token({
  id: "check",
  type: "checkpoint",
  label: "Checkpoint",
  asset: "checkpunt@2x.png",
  order: 6,
});

function ids(tokens: ProcessToken[]) {
  return tokens.map((item) => item.id);
}

test("moving a token forward uses the index after removal", () => {
  const original = processWith(understand, brainstorm, planning, design);
  const next = moveProcessToken(original, 1, 3);
  assert.deepEqual(ids(next), ["start", "understand", "planning", "design", "brainstorm", "end"]);
  assert.equal(next.find((item) => item.id === "brainstorm")?.turn, 2);
  assert.equal(next.find((item) => item.id === "brainstorm")?.asset, "brainstorm@2x.png");
  assert.notEqual(next, original);
  assert.deepEqual(ids(original), ["start", "understand", "brainstorm", "planning", "design", "end"]);
});

test("moving a token backward keeps identity and renumbers both ends", () => {
  const next = moveProcessToken(processWith(understand, brainstorm, planning, design), 3, 0);
  assert.deepEqual(ids(next), ["start", "design", "understand", "brainstorm", "planning", "end"]);
  assert.deepEqual(
    next.map((item) => item.order),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(next[0].id, "start");
  assert.equal(next.at(-1)?.id, "end");
});

test("a phase drags the tokens that belong to it, up to the next phase", () => {
  const chain = processWith(understand, brainstorm, planning, design, research, checkpoint);
  const span = spanForToken(chain, "understand");
  assert.deepEqual(span?.ids, ["understand", "brainstorm", "planning"]);
  const next = moveProcessToken(chain, 0, 3);
  assert.deepEqual(ids(next), [
    "start",
    "design",
    "research",
    "check",
    "understand",
    "brainstorm",
    "planning",
    "end",
  ]);
  assert.equal(middleTokens(next).length, 6);
  assert.equal(new Set(ids(next)).size, next.length);
});

test("an activity moves alone and a checkpoint stays with its phase until grabbed itself", () => {
  const chain = processWith(understand, brainstorm, { ...checkpoint, order: 3 }, design);
  assert.deepEqual(spanForToken(chain, "brainstorm")?.ids, ["brainstorm"]);
  assert.deepEqual(spanForToken(chain, "check")?.ids, ["check"]);
  assert.deepEqual(spanForToken(chain, "understand")?.ids, ["understand", "brainstorm", "check"]);
  const activityOnly = moveProcessToken(chain, 1, 3);
  assert.deepEqual(ids(activityOnly), ["start", "understand", "check", "design", "brainstorm", "end"]);
});

test("a phase can only drop on a phase boundary", () => {
  const chain = processWith(understand, brainstorm, planning, design, research, checkpoint);
  assert.equal(isValidDropIndex(chain, 0, 3, 0), true);
  assert.equal(isValidDropIndex(chain, 0, 3, 3), true);
  assert.equal(isValidDropIndex(chain, 0, 3, 1), false);
  assert.equal(isValidDropIndex(chain, 0, 3, 2), false);
  assert.equal(isValidDropIndex(chain, 1, 1, 0), true);
  assert.equal(isValidDropIndex(chain, 1, 1, 4), true);
  assert.equal(isValidDropIndex(chain, 5, 1, 2), true);
});

test("dropping on the original index does not copy the array", () => {
  const original = processWith(understand, brainstorm, planning);
  assert.equal(moveProcessToken(original, 1, 1), original);
  assert.equal(moveProcessBlock(original, 0, 3, 0), original);
  assert.equal(spanForToken(original, "start"), null);
  assert.equal(spanForToken(original, "end"), null);
  assert.equal(moveProcessToken(original, -1, 0), original);
  assert.equal(moveProcessToken(original, 9, 0), original);
});

test("reordered tokens still lay out without losing or duplicating anyone", () => {
  const original = processWith(understand, brainstorm, planning, design, research);
  const next = moveProcessToken(original, 0, 1);
  const before = layoutProcess(original);
  const after = layoutProcess(next);
  assert.equal(after.placed.length, before.placed.length);
  assert.deepEqual(new Set(ids(next)), new Set(ids(original)));
  const chain = after.placed.filter((item) => item.token.type !== "start" && item.token.type !== "end");
  assert.equal(chain.length + (after.seatedInStart ? 1 : 0), middleTokens(next).length);
});

test("magnetic choice prefers the nearest slot and keeps the current one inside the hysteresis band", () => {
  const candidates = [
    { index: 0, x: 0, y: 0 },
    { index: 1, x: 100, y: 0 },
  ];
  assert.equal(chooseDropIndex(candidates, { x: 10, y: 0 }, 0), 0);
  assert.equal(chooseDropIndex(candidates, { x: 90, y: 0 }, 0), 1);
  assert.equal(chooseDropIndex(candidates, { x: 55, y: 0 }, 0), 0);
  assert.equal(chooseDropIndex(candidates, { x: 400, y: 0 }, 0), null);
});

test("auto-pan pushes the camera toward the content past the pointer edge", () => {
  const left = autoPanDelta(0, 200, 800, 600);
  const right = autoPanDelta(800, 200, 800, 600);
  const middle = autoPanDelta(400, 300, 800, 600);
  assert.ok(left.x > 0);
  assert.ok(right.x < 0);
  assert.equal(middle.x, 0);
  assert.equal(middle.y, 0);
});

test("pose interpolation takes the short way around a full turn", () => {
  const poses = lerpPoses(
    { a: { x: 0, y: 0, heading: -3, scale: 1 } },
    { a: { x: 10, y: 0, heading: 3, scale: 2 } },
    0.5,
  );
  assert.ok(Math.abs(poses.a.heading) > 3);
  assert.equal(poses.a.x, 5);
  assert.equal(poses.a.scale, 1.5);
});
