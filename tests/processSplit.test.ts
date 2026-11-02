import test from "node:test";
import assert from "node:assert/strict";
import { worldToScreen } from "../src/canvas/view";
import { explorationView } from "../src/exploration/cameraFocus";
import { EXPLORATION } from "../src/exploration/explorationConfig";
import { placedArtBounds } from "../src/exploration/previewFit";
import { buildProcessSplit } from "../src/exploration/processSplit";
import { layoutProcess } from "../src/process/processLayout";
import type { ProcessToken } from "../src/process/processTypes";

const viewport = { width: 1440, height: 900 };

function token(
  id: string,
  type: ProcessToken["type"],
  label: string,
  order: number,
  asset: string,
): ProcessToken {
  return {
    id,
    type,
    label,
    category:
      type === "phase" || type === "activity" || type === "checkpoint"
        ? type
        : "anchor",
    order,
    permanent: type === "start" || type === "end",
    asset,
  };
}

/** Understand sits in the starting point. The gap is between Research and Planning. */
const process: ProcessToken[] = [
  token("start", "start", "Starting point", 0, "vertrekpunt@2x.png"),
  token("understand", "phase", "Understand", 1, "begrijpen@2x.png"),
  token("research", "activity", "Research", 2, "onderzoeken@2x.png"),
  token("planning", "activity", "Planning", 3, "planning@2x.png"),
  token("brainstorm", "activity", "Brainstorm", 4, "brainstorm@2x.png"),
  token("reflect", "activity", "Reflect", 5, "reflecteren@2x.png"),
  token("survey", "activity", "Survey", 6, "brainstorm@2x.png"),
  token("end", "end", "Endpoint", 7, "eindpunt@2x.png"),
];

function screenOf(id: string, pose: { x: number; y: number; scale: number }) {
  const item = layoutProcess(process).placed.find((entry) => entry.token.id === id);
  assert.ok(item);
  const box = placedArtBounds(item);
  const view = explorationView(process, 2, null, viewport);
  return worldToScreen(
    view,
    ((box.minX + box.maxX) / 2) * pose.scale + pose.x,
    ((box.minY + box.maxY) / 2) * pose.scale + pose.y,
  );
}

test("the open process is two views of the same order", () => {
  const orders = process.map((item) => item.order);
  const split = buildProcessSplit(process, 2, null, explorationView(process, 2, null, viewport), viewport);
  assert.deepEqual(
    process.map((item) => item.order),
    orders,
  );
  assert.deepEqual(split.leftIds, ["start", "research"]);
  assert.deepEqual(split.rightIds, ["planning", "brainstorm", "reflect"]);
  assert.equal(split.rightIds.includes("survey"), false);
  assert.equal(split.rightIds.includes("end"), false);
  assert.equal(split.poses.end, undefined);
  assert.equal(split.poses.survey.opacity, 0);
  assert.equal(split.poses.research.scale, EXPLORATION.splitLeftScale);
  assert.equal(split.poses.planning.scale, EXPLORATION.splitRightScale);
  assert.ok(split.poses.planning.scale < split.poses.research.scale);
  assert.equal(split.poses.start.x, split.poses.research.x);
  assert.equal(split.poses.start.y, split.poses.research.y);
  assert.equal(split.poses.planning.x, split.poses.brainstorm.x);
});

test("the selector centre stays clear of both process segments", () => {
  const view = explorationView(process, 2, null, viewport);
  const split = buildProcessSplit(process, 2, null, view, viewport);
  const left = screenOf("research", split.poses.research);
  const right = screenOf("planning", split.poses.planning);
  assert.ok(left.x < viewport.width * 0.4);
  assert.ok(right.x > viewport.width * 0.6);
  assert.equal(split.zones.length, 2);
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  for (const zone of split.zones) {
    const inside =
      centre.x >= zone.left &&
      centre.x <= zone.right &&
      centre.y >= zone.top &&
      centre.y <= zone.bottom;
    assert.equal(inside, false);
  }
});

test("a gap with nothing after it leaves the right side empty", () => {
  const split = buildProcessSplit(
    process,
    6,
    null,
    explorationView(process, 6, null, viewport),
    viewport,
  );
  assert.equal(split.rightIds.length, 0);
  assert.equal(split.zones.length, 1);
  assert.equal(split.leftIds.at(-1), "survey");
});
