import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateSelectedTokens,
  removeSelectedTokens,
} from "../src/process/editToken";
import {
  layoutSelectedSequence,
  normalizeRect,
  rectsIntersect,
  selectedInProcessOrder,
} from "../src/process/multiSelect";
import type { ProcessToken } from "../src/process/processTypes";

function token(
  partial: Pick<ProcessToken, "id" | "type" | "label" | "asset"> & { order: number },
): ProcessToken {
  const category =
    partial.type === "phase" || partial.type === "activity"
      ? partial.type
      : partial.type === "checkpoint"
        ? "checkpoint"
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

const a = token({ id: "a", type: "phase", label: "A", asset: "begrijpen@2x.png", order: 1 });
const b = token({ id: "b", type: "activity", label: "B", asset: "brainstorm@2x.png", order: 2 });
const c = token({ id: "c", type: "activity", label: "C", asset: "planning@2x.png", order: 3 });
const d = token({ id: "d", type: "activity", label: "D", asset: "onderzoeken@2x.png", order: 4 });
const e = token({ id: "e", type: "phase", label: "E", asset: "ontwerpen@2x.png", order: 5 });

test("normalizeRect accepts any drag direction", () => {
  assert.deepEqual(normalizeRect(10, 20, 4, 8), {
    x: 4,
    y: 8,
    width: 6,
    height: 12,
  });
});

test("rectsIntersect detects partial overlap", () => {
  assert.equal(
    rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 8, y: 8, width: 4, height: 4 }),
    true,
  );
  assert.equal(
    rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 4, height: 4 }),
    false,
  );
});

test("copy inserts non-adjacent selections after the last selected token", () => {
  const result = duplicateSelectedTokens(processWith(a, b, c, d, e), ["b", "d"], (token) => `${token.id}-copy`);
  assert.deepEqual(
    result.tokens.map((item) => item.id),
    ["start", "a", "b", "c", "d", "b-copy", "d-copy", "e", "end"],
  );
  assert.deepEqual(result.createdIds, ["b-copy", "d-copy"]);
});

test("batch remove drops only selected tokens and renumbers", () => {
  const next = removeSelectedTokens(processWith(a, b, c, d, e), ["b", "d"]);
  assert.deepEqual(
    next.map((item) => item.id),
    ["start", "a", "c", "e", "end"],
  );
  assert.equal(next.find((item) => item.id === "c")?.order, 2);
});

test("batch remove leaves start and end alone", () => {
  const next = removeSelectedTokens(processWith(a, b), ["start", "end", "a"]);
  assert.deepEqual(
    next.map((item) => item.id),
    ["start", "b", "end"],
  );
});

test("selectedInProcessOrder keeps magnetic sequence", () => {
  const ordered = selectedInProcessOrder(processWith(a, b, c, d, e), ["d", "b"]);
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["b", "d"],
  );
});

test("export layout places only the selected tokens in their own slots", () => {
  const placed = layoutSelectedSequence([b, d]);
  assert.deepEqual(
    placed.map((item) => item.token.id),
    ["b", "d"],
  );
  assert.ok(placed.length === 2);
  assert.ok(Math.hypot(placed[1].x - placed[0].x, placed[1].y - placed[0].y) > 1);
});
