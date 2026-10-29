import type { ProcessToken } from "../process/processTypes";

export type ContextFocus = {
  id: string;
  asset: string;
  label: string;
  type: ProcessToken["type"];
};

function chain(tokens: readonly ProcessToken[]): ProcessToken[] {
  return tokens
    .filter(
      (token) =>
        token.type === "phase" ||
        token.type === "activity" ||
        token.type === "checkpoint",
    )
    .slice()
    .sort((left, right) => left.order - right.order);
}

/**
 * Gap used for ranking and for the central token.
 * Replacing a token uses that token's own place in the chain.
 * Adding a token uses the insertion seam.
 */
export function explorationIndex(
  tokens: readonly ProcessToken[],
  insertionIndex: number,
  replaceId: string | null,
): number {
  const middles = chain(tokens);
  if (replaceId) {
    const at = middles.findIndex((token) => token.id === replaceId);
    if (at >= 0) return at;
  }
  return Math.max(0, Math.min(insertionIndex, middles.length));
}

/**
 * The token immediately before the gap.
 * A gap directly after Starting Point uses Starting Point.
 */
export function contextFocus(
  tokens: readonly ProcessToken[],
  insertionIndex: number,
): ContextFocus | null {
  const middles = chain(tokens);
  const index = Math.max(0, Math.min(insertionIndex, middles.length));
  const previous = index > 0 ? middles[index - 1] : undefined;
  const token =
    previous ?? tokens.find((item) => item.type === "start") ?? null;
  if (!token) return null;
  return {
    id: token.id,
    asset: token.asset,
    label: token.label,
    type: token.type,
  };
}
