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
  fitActivityCircle,
  foregroundFade,
  sceneAnchor,
} from "../src/exploration/exclusionZone";
import { initialProcess } from "../src/process/processTestData";
import {
  evenRingSpacing,
  placeCandidates,
} from "../src/exploration/spatialLayout";

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
  once.forEach((item, index) => {
    assert.ok(
      Math.hypot(item.x - twice[index].x, item.y - twice[index].y) < 1e-6,
    );
  });
  for (const item of once) {
    assert.ok(foregroundFade(item, item.group, frame, zone) > 0.55);
  }
});

test("activity tokens stay on an even circle that clears the hub", () => {
  const seed = (id: string) => ({
    id,
    asset: "brainstorm@2x.png",
    label: id,
    type: "activity" as const,
    category: "activity" as const,
  });
  const placed = placeCandidates([
    Array.from({ length: 7 }, (_, index) => seed(`inner-${index}`)),
    Array.from({ length: 14 }, (_, index) => seed(`middle-${index}`)),
    Array.from({ length: 6 }, (_, index) => seed(`outer-${index}`)),
  ]);
  const fit = fitActivityCircle({
    width: 1440,
    height: 900,
    anchorX: 720,
    anchorY: 450,
    zones: [],
    fullToken: 130,
    fallbackReach: 320,
    points: placed,
    targetOuterRadius: 420,
  });
  assert.ok(fit.reach > 0);
  assert.ok(fit.tokenSize <= 130);
  assert.ok(fit.tokenSize >= 72);
  const frame = {
    anchorX: 720,
    anchorY: 450,
    reachX: fit.reach,
    reachY: fit.reach,
    tokenSize: fit.tokenSize,
    width: 1440,
    height: 900,
    outermostGroup: 2,
  };
  // Match the live explorer: even seats, no process redistribution.
  const settled = evenRingSpacing(placed);
  const outer = candidateScreenRect(
    settled.find((item) => item.group === 2)!,
    0,
    frame,
  );
  const outerRadius = Math.hypot(
    (outer.left + outer.right) / 2 - 720,
    (outer.top + outer.bottom) / 2 - 450,
  );
  assert.ok(outerRadius > 280, "outer ring should fill the radar");
  const inner = candidateScreenRect(
    settled.find((item) => item.group === 0)!,
    0,
    frame,
  );
  const innerRadius = Math.hypot(
    (inner.left + inner.right) / 2 - 720,
    (inner.top + inner.bottom) / 2 - 450,
  );
  assert.ok(
    innerRadius > EXPLORATION.hubClearance + fit.tokenSize * 0.35,
    "inner ring clears the hub",
  );
  for (const item of settled.filter((entry) => entry.group === 2)) {
    const rect = candidateScreenRect(item, item.group, frame);
    assert.ok(rect.top >= 100, "outer tokens stay off the top edge");
    assert.ok(rect.bottom <= 800, "outer tokens stay off the bottom edge");
  }
  for (const group of [0, 1, 2]) {
    const members = settled.filter((item) => item.group === group);
    const radii = members.map((item) => Math.hypot(item.x, item.y));
    const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    for (const radius of radii) {
      assert.ok(Math.abs(radius - mean) < 0.001, "tokens stay on one circle");
    }
    if (members.length < 2) continue;
    const angles = members
      .map((item) => Math.atan2(item.y, item.x))
      .sort((left, right) => left - right);
    for (let index = 0; index < angles.length - 1; index += 1) {
      assert.ok(
        angles[index + 1] - angles[index] > 0.12,
        "neighbours keep angular space",
      );
    }
  }
});

