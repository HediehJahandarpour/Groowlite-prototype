import test from "node:test";
import assert from "node:assert/strict";
import { worldToScreen } from "../src/canvas/view";
import {
  explorationFocusPoint,
  explorationView,
  processExclusionZone,
  viewForWorldPoint,
} from "../src/exploration/cameraFocus";
import { EXPLORATION } from "../src/exploration/explorationConfig";
import {
  avoidProcessZone,
  candidateScreenRect,
  foregroundFade,
  sceneAnchor,
} from "../src/exploration/exclusionZone";
import { initialProcess } from "../src/process/processTestData";
import { placeCandidates } from "../src/exploration/spatialLayout";

const viewport = { width: 1200, height: 800 };

test("the exploration camera parks the insertion point at the focus ratios", () => {
  const view = viewForWorldPoint({ x: 100, y: 40 }, viewport, 1.35, 0.3, 0.5);
  const screen = worldToScreen(view, 100, 40);
  assert.equal(view.scale, 1.35);
  assert.ok(Math.abs(screen.x - 360) < 0.001);
  assert.ok(Math.abs(screen.y - 400) < 0.001);
});

test("the live process focus is what the exploration camera frames", () => {
  const focus = explorationFocusPoint(initialProcess, 0, null);
  const view = explorationView(initialProcess, 0, null, viewport);
  const screen = worldToScreen(view, focus.x, focus.y);
  assert.equal(view.scale, EXPLORATION.explorationZoom);
  assert.ok(Math.abs(screen.x - viewport.width * EXPLORATION.processFocusX) < 0.01);
  assert.ok(Math.abs(screen.y - viewport.height * EXPLORATION.processFocusY) < 0.01);
});

test("the protected process area contains the focus and grows by the margin", () => {
  const view = explorationView(initialProcess, 0, null, viewport);
  const focus = explorationFocusPoint(initialProcess, 0, null);
  const screen = worldToScreen(view, focus.x, focus.y);
  const tight = processExclusionZone(initialProcess, 0, null, view, viewport, 0);
  const loose = processExclusionZone(
    initialProcess,
    0,
    null,
    view,
    viewport,
    EXPLORATION.processSafetyMargin,
  );
  assert.ok(screen.x >= tight.left && screen.x <= tight.right);
  assert.ok(screen.y >= tight.top && screen.y <= tight.bottom);
  assert.ok(loose.left <= tight.left - EXPLORATION.processSafetyMargin + 0.01);
  assert.ok(loose.top <= tight.top - EXPLORATION.processSafetyMargin + 0.01);
  assert.ok(loose.right >= tight.right + EXPLORATION.processSafetyMargin - 0.01);
  assert.ok(loose.bottom >= tight.bottom + EXPLORATION.processSafetyMargin - 0.01);
});

test("candidate anchors move outside the process once and then stay put", () => {
  const zone = processExclusionZone(
    initialProcess,
    0,
    null,
    explorationView(initialProcess, 0, null, viewport),
    viewport,
  );
  const anchor = sceneAnchor(zone, viewport.width, viewport.height);
  const frame = {
    anchorX: anchor.x,
    anchorY: anchor.y,
    reachX: 360,
    reachY: 280,
    tokenSize: 120,
  };
  const seeded = placeCandidates([
    [
      {
        id: "brainstorm",
        asset: "brainstorm@2x.png",
        label: "Brainstorm",
        type: "activity",
        category: "activity",
      },
      {
        id: "survey",
        asset: "survey@2x.png",
        label: "Survey",
        type: "activity",
        category: "activity",
      },
      {
        id: "reflect",
        asset: "reflect@2x.png",
        label: "Reflect",
        type: "activity",
        category: "activity",
      },
    ],
  ]);
  const once = avoidProcessZone(seeded, zone, frame);
  const twice = avoidProcessZone(once, zone, frame);
  assert.deepEqual(
    once.map((item) => [item.x, item.y]),
    twice.map((item) => [item.x, item.y]),
  );
  for (const item of once) {
    const resting = candidateScreenRect(item, item.group, frame);
    assert.equal(overlaps(resting, zone), false);
    assert.ok(foregroundFade(item, item.group, frame, zone) > 0.75);
  }
});

function overlaps(
  rect: { left: number; top: number; right: number; bottom: number },
  zone: { left: number; top: number; right: number; bottom: number },
) {
  return (
    rect.left < zone.right &&
    rect.right > zone.left &&
    rect.top < zone.bottom &&
    rect.bottom > zone.top
  );
}
