import type { ProcessToken } from "./processTypes";

function isMiddle(token: ProcessToken) {
  return token.type === "phase" || token.type === "activity" || token.type === "checkpoint";
}

/** Phases, activities, and checkpoints, in process order. Anchors are excluded. */
export function middleTokens(tokens: readonly ProcessToken[]): ProcessToken[] {
  return tokens.filter(isMiddle).sort((a, b) => a.order - b.order);
}

export type TokenSpan = {
  /** Index in the middle sequence, after the starting point. */
  start: number;
  count: number;
  ids: string[];
};

/**
 * The tokens that move together.
 * A phase takes every token after it until the next phase.
 * An activity or checkpoint moves on its own.
 * Starting Point and Endpoint have no span.
 */
export function spanForToken(tokens: readonly ProcessToken[], id: string): TokenSpan | null {
  const middles = middleTokens(tokens);
  const index = middles.findIndex((token) => token.id === id);
  if (index < 0) return null;
  const token = middles[index];
  if (token.type !== "phase") {
    return { start: index, count: 1, ids: [token.id] };
  }
  let end = index + 1;
  while (end < middles.length && middles[end].type !== "phase") end += 1;
  const group = middles.slice(index, end);
  return { start: index, count: group.length, ids: group.map((item) => item.id) };
}

/**
 * A phase can only land on a phase boundary, so it does not split another
 * phase's group. Activities and checkpoints may land on any middle index.
 * `destinationIndex` is counted after the moving span has been removed.
 */
export function isValidDropIndex(
  tokens: readonly ProcessToken[],
  sourceIndex: number,
  count: number,
  destinationIndex: number,
): boolean {
  const middles = middleTokens(tokens);
  const moving = middles[sourceIndex];
  if (!moving || count < 1 || sourceIndex + count > middles.length) return false;
  const remaining = middles.filter(
    (_, index) => index < sourceIndex || index >= sourceIndex + count,
  );
  if (destinationIndex < 0 || destinationIndex > remaining.length) return false;
  if (moving.type !== "phase") return true;
  if (destinationIndex === remaining.length) return true;
  return remaining[destinationIndex]?.type === "phase";
}

function renumber(start: ProcessToken, middles: ProcessToken[], end: ProcessToken): ProcessToken[] {
  return [
    { ...start, order: 0 },
    ...middles.map((token, order) => ({ ...token, order: order + 1 })),
    { ...end, order: middles.length + 1 },
  ];
}

/**
 * Move a contiguous middle span.
 *
 * `destinationIndex` is the insertion index AFTER the span has been removed.
 * Index 0 places the span directly after the starting point.
 * Returning the same array means the order did not change.
 *
 * A → B → C → D, move B (index 1) to after D: destination 3 → A C D B.
 */
export function moveProcessBlock(
  tokens: readonly ProcessToken[],
  sourceIndex: number,
  count: number,
  destinationIndex: number,
): ProcessToken[] {
  const start = tokens.find((token) => token.type === "start");
  const end = tokens.find((token) => token.type === "end");
  if (!start || !end) return tokens as ProcessToken[];
  if (count < 1 || !Number.isInteger(count)) return tokens as ProcessToken[];

  const middles = middleTokens(tokens);
  if (sourceIndex < 0 || sourceIndex + count > middles.length) return tokens as ProcessToken[];
  const moving = middles.slice(sourceIndex, sourceIndex + count);
  if (moving.some((token) => token.type === "start" || token.type === "end")) {
    return tokens as ProcessToken[];
  }

  const remaining = middles.filter(
    (_, index) => index < sourceIndex || index >= sourceIndex + count,
  );
  const destination = Math.max(0, Math.min(destinationIndex, remaining.length));
  if (destination === sourceIndex) return tokens as ProcessToken[];

  const next = remaining.slice();
  next.splice(destination, 0, ...moving);
  return renumber(start, next, end);
}

/**
 * Reorder one middle token.
 * When that token is a phase, the activities and checkpoints that belong to it
 * move with it. Starting Point and Endpoint cannot be moved.
 * `destinationIndex` is counted after the moved span has been taken out.
 */
export function moveProcessToken(
  tokens: readonly ProcessToken[],
  sourceIndex: number,
  destinationIndex: number,
): ProcessToken[] {
  const middles = middleTokens(tokens);
  const token = middles[sourceIndex];
  if (!token || token.type === "start" || token.type === "end") return tokens as ProcessToken[];
  const span = spanForToken(tokens, token.id);
  if (!span) return tokens as ProcessToken[];
  return moveProcessBlock(tokens, span.start, span.count, destinationIndex);
}
