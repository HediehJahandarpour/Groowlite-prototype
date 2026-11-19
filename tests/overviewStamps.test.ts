import assert from "node:assert/strict";
import test from "node:test";
import { applySlotStamp } from "../src/process/overviewStamps";

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
