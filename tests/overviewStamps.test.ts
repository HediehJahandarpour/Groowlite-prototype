import assert from "node:assert/strict";
import test from "node:test";
import { applySlotStamp } from "../src/process/overviewStamps";
import { upperEdgeSeat } from "../src/process/stampSeat";

test("a piece lands on a token slot and lifts off when dropped again", () => {
  const first = applySlotStamp({}, "brainstorm", "activity");
  assert.equal(first.brainstorm, "activity");
  assert.equal(first.planning, undefined);

  const cleared = applySlotStamp(first, "brainstorm", "activity");
  assert.equal(cleared.brainstorm, undefined);

  const swapped = applySlotStamp(first, "brainstorm", "repeat");
  assert.equal(swapped.brainstorm, "repeat");
});

test("a missing token is left untouched", () => {
  const stamps = { planning: "content" as const };
  assert.equal(applySlotStamp(stamps, "", "groowy"), stamps);
});

test("a piece sits on the flat upper side, not the higher corner", () => {
  const seat = upperEdgeSeat([
    { x: 0, y: 10 },
    { x: 100, y: 18 },
    { x: 100, y: 90 },
    { x: 0, y: 90 },
  ]);
  assert.ok(Math.abs(seat.x - 50) < 0.5);
  assert.ok(Math.abs(seat.y - 14) < 0.5);
  assert.ok(Math.abs(seat.tilt) < 12);
});

test("a point-up pentagon uses a roof side instead of the tip", () => {
  const points = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * ((2 * Math.PI) / 5);
    return { x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) };
  });
  const tip = points.reduce((highest, point) => (point.y < highest.y ? point : highest));
  const seat = upperEdgeSeat(points);
  assert.ok(seat.y > tip.y + 10, "seat stays below the tip");
  assert.ok(Math.hypot(seat.x - tip.x, seat.y - tip.y) > 20);
});
