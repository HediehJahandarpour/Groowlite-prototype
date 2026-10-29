import test from "node:test";
import assert from "node:assert/strict";
import {
  apparentScale,
  clampProgress,
  poseAtDepth,
  projectCandidate,
} from "../src/exploration/depthPose";
import { PLATE_GROWTH, outerPlateScale, plateScale } from "../src/exploration/plateGrowth";
import {
  contextFocus,
  explorationIndex,
} from "../src/exploration/contextToken";
import { fitBounds } from "../src/exploration/previewFit";
import { orbitPoints, placeCandidates } from "../src/exploration/spatialLayout";
import { activityLayersFor } from "../src/recommendations/radialGrouping";
import { initialProcess } from "../src/process/processTestData";
import type { ProcessToken } from "../src/process/processTypes";

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

const process: ProcessToken[] = [
  token("start", "start", "Starting point", 0, "vertrekpunt@2x.png"),
  token("understand", "phase", "Understand", 1, "begrijpen@2x.png"),
  token("brainstorm", "activity", "Brainstorm", 2, "brainstorm@2x.png"),
  token("planning", "activity", "Planning", 3, "planning@2x.png"),
  token("end", "end", "Endpoint", 4, "eindpunt@2x.png"),
];

test("the central token is the one immediately before the insertion gap", () => {
  assert.equal(contextFocus(process, 3)?.label, "Planning");
  assert.equal(contextFocus(process, 1)?.label, "Understand");
  assert.equal(contextFocus(process, 0)?.type, "start");
  assert.equal(contextFocus(initialProcess, 0)?.type, "start");
});

test("replacing a token ranks from that token's place in the chain", () => {
  assert.equal(explorationIndex(process, 0, "planning"), 2);
  assert.equal(explorationIndex(process, 1, null), 1);
});

test("deeper groups are smaller, fainter, and farther from the camera", () => {
  const front = poseAtDepth(0);
  const middle = poseAtDepth(1);
  const far = poseAtDepth(2);
  assert.ok(front.z > middle.z);
  assert.ok(middle.z > far.z);
  assert.ok(apparentScale(0) > apparentScale(1) * 1.7);
  assert.ok(apparentScale(1) > apparentScale(2));
  assert.ok(front.opacity > middle.opacity);
  assert.ok(middle.opacity > far.opacity);
  assert.ok(middle.opacity < 0.5);
  assert.ok(apparentScale(2) < 0.75);
  assert.ok(apparentScale(0) > 0.9);
});

test("scrolling back through a group reverses the pass", () => {
  const passing = poseAtDepth(-0.7);
  const active = poseAtDepth(0);
  assert.ok(passing.spread > active.spread);
  assert.ok(passing.opacity < active.opacity);
  assert.ok(passing.opacity > 0.2);
  assert.ok(passing.scale > active.scale);
  assert.ok(passing.scale > poseAtDepth(-0.25).scale);
  assert.ok(passing.z > active.z);
  assert.deepEqual(
    projectCandidate(
      { group: 1, x: 0.8, y: -0.2, tiltX: 1, tiltY: -1, presence: 1 },
      1,
      400,
      280,
    ).z,
    poseAtDepth(0).z,
  );
});

test("progress stays inside the available groups", () => {
  assert.equal(clampProgress(-2, 4), 0);
  assert.equal(clampProgress(9, 4), 3);
  assert.equal(clampProgress(1.2, 1), 0);
});

test("orbital slots are deterministic and stay off the centre", () => {
  const first = orbitPoints(6, 0);
  const again = orbitPoints(6, 0);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, orbitPoints(6, 1));
  for (const point of first) {
    assert.ok(Math.hypot(point.x, point.y) >= 0.7);
    assert.ok(Math.abs(point.tiltX) < 12);
    assert.ok(Math.abs(point.tiltY) < 12);
  }
});

test("recommendation layers become depth groups without duplicate tokens", () => {
  const { layers } = activityLayersFor(process, 3);
  const placed = placeCandidates(layers);
  const ids = placed.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    placed.length,
    layers.reduce((sum, layer) => sum + layer.length, 0),
  );
  assert.ok(placed.filter((item) => item.group === 0).length > 0);
  assert.ok(placed.some((item) => item.group > 0));
  assert.deepEqual(
    placed.filter((item) => item.group === 0).map((item) => item.id),
    layers[0].map((item) => item.id),
  );
});

test("the explorer rings start small and reach full size at the end of the scroll", () => {
  assert.equal(plateScale(0), PLATE_GROWTH.start);
  assert.equal(plateScale(1), 1);
  assert.equal(outerPlateScale(0), PLATE_GROWTH.start);
  assert.equal(outerPlateScale(1), PLATE_GROWTH.outerEnd);
  assert.ok(outerPlateScale(1) > 1);
  assert.ok(outerPlateScale(0.45) < plateScale(0.45));
  assert.ok(plateScale(0.25) < plateScale(0.75));
});

test("the process preview fits a bounding box without using canvas zoom", () => {
  const fit = fitBounds(
    { minX: 100, minY: 40, maxX: 1100, maxY: 540 },
    { width: 200, height: 100 },
  );
  assert.equal(fit.scale, 0.2);
  assert.ok(Math.abs(fit.x - -20) < 0.001);
  assert.ok(Math.abs(fit.y - -8) < 0.001);
});
