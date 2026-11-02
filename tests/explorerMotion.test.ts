import test from "node:test";
import assert from "node:assert/strict";
import { projectCandidate } from "../src/exploration/depthPose";
import {
  applyOpeningTeaser,
  depthTransform,
  idleMotionFor,
  projectedSize,
} from "../src/exploration/explorerMotion";

const sample = {
  group: 0,
  x: 0.8,
  y: -0.3,
  tiltX: 4,
  tiltY: -3,
  presence: 1,
};

test("depth transform text matches the scroll pose when nothing else is applied", () => {
  const motion = projectCandidate(sample, 0, 360, 240);
  assert.equal(depthTransform(motion), motion.transform);
});

test("idle floats are deterministic, desynchronised, and stay small", () => {
  const first = idleMotionFor("brainstorm", 0, 0);
  const again = idleMotionFor("brainstorm", 0, 0);
  const second = idleMotionFor("planning", 1, 0);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, second);
  assert.ok(Math.abs(first.y) >= 12 && Math.abs(first.y) <= 20);
  assert.ok(Math.abs(first.x) <= 6);
  assert.ok(Math.abs(first.rotationX) <= 4);
  assert.ok(Math.abs(first.rotationY) <= 4);
  assert.ok(first.duration >= 2.8 && first.duration <= 4.4);
  assert.ok(first.phase >= 0 && first.phase < 1);
  assert.ok(
    first.phase !== second.phase || first.duration !== second.duration,
  );
});

test("the opening teaser nudges the nearest tokens forward without moving scroll progress", () => {
  const motion = projectCandidate(sample, 0, 360, 240);
  const resting = applyOpeningTeaser(0, 0, 0, motion);
  assert.equal(resting, motion);

  const peak = applyOpeningTeaser(0, 0, 1, motion);
  const growth = projectedSize(peak.scale, peak.z) / projectedSize(motion.scale, motion.z);
  assert.ok(peak.z > motion.z);
  assert.ok(growth >= 1.1 && growth <= 1.15);
  assert.equal(peak.opacity, motion.opacity);
  assert.equal(motion.z, projectCandidate(sample, 0, 360, 240).z);
});

test("the teaser only reveals the next group a little, and leaves hidden groups alone", () => {
  const progress = 0;
  const reach = [360, 240] as const;
  const next = projectCandidate({ ...sample, group: 1 }, progress, ...reach);
  const lifted = applyOpeningTeaser(1, progress, 1, next);
  assert.ok(lifted.opacity > next.opacity);
  assert.ok(lifted.opacity < 0.7);
  assert.ok(lifted.z > next.z);

  const far = projectCandidate({ ...sample, group: 3 }, progress, ...reach);
  const untouched = applyOpeningTeaser(3, progress, 1, far);
  assert.equal(untouched.z, far.z);
  assert.equal(untouched.scale, far.scale);
  assert.equal(untouched.opacity, far.opacity);

  const hidden = { ...far, opacity: 0 };
  const stillHidden = applyOpeningTeaser(1, progress, 1, hidden);
  assert.equal(stillHidden.opacity, 0);
});
