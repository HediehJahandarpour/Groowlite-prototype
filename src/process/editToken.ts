import type { CatalogEntry } from "./tokenCatalog";
import type { ProcessToken } from "./processTypes";

const PENTAGON_TURNS = 5;

function isMiddle(token: ProcessToken) {
  return token.type === "phase" || token.type === "activity" || token.type === "checkpoint";
}

function isEditable(token: ProcessToken) {
  return token.type === "phase" || token.type === "activity";
}

function isRemovable(token: ProcessToken) {
  return isEditable(token) || token.type === "checkpoint";
}

function chainTokens(tokens: ProcessToken[]) {
  return tokens
    .filter((token) => token.type === "phase" || token.type === "activity" || token.type === "checkpoint")
    .sort((a, b) => a.order - b.order);
}

function renumber(start: ProcessToken, middles: ProcessToken[], end: ProcessToken): ProcessToken[] {
  return [
    start,
    ...middles.map((token, order) => ({ ...token, order: order + 1 })),
    { ...end, order: middles.length + 1 },
  ];
}

function ends(tokens: ProcessToken[]) {
  const start = tokens.find((token) => token.type === "start");
  const end = tokens.find((token) => token.type === "end");
  if (!start || !end) return null;
  const middles = tokens.filter(isMiddle).sort((a, b) => a.order - b.order);
  return { start, end, middles };
}

/** Remove a phase, activity, or checkpoint from its slot. */
export function removeToken(tokens: ProcessToken[], id: string): ProcessToken[] {
  const parts = ends(tokens);
  const target = tokens.find((token) => token.id === id);
  if (!parts || !target || !isRemovable(target)) return tokens;
  const middles = parts.middles.filter((token) => token.id !== id);
  return renumber(parts.start, middles, parts.end);
}

/** Place a copy in the next magnetic gap. The original stays where it is. */
export function duplicateToken(
  tokens: ProcessToken[],
  id: string,
  createdId = `${tokens.find((token) => token.id === id)?.type ?? "token"}-${crypto.randomUUID()}`,
): { tokens: ProcessToken[]; createdId: string | null } {
  const parts = ends(tokens);
  const target = tokens.find((token) => token.id === id);
  if (!parts || !target || !isEditable(target)) return { tokens, createdId: null };
  const index = parts.middles.findIndex((token) => token.id === id);
  if (index < 0) return { tokens, createdId: null };
  const copy: ProcessToken = {
    ...target,
    id: createdId,
    permanent: false,
  };
  const middles = parts.middles.slice();
  middles.splice(index + 1, 0, copy);
  return { tokens: renumber(parts.start, middles, parts.end), createdId };
}

/** Turn the artwork one pentagon step. The slot, heading, and neighbours stay put. */
export function rotateToken(tokens: ProcessToken[], id: string): ProcessToken[] {
  return tokens.map((token) => {
    if (token.id !== id || !isEditable(token)) return token;
    return { ...token, turn: ((token.turn ?? 0) + 1) % PENTAGON_TURNS };
  });
}

/** Swap the picture and label, keeping the same place in the chain. */
export function replaceToken(tokens: ProcessToken[], id: string, entry: CatalogEntry): ProcessToken[] {
  return tokens.map((token) => {
    if (token.id !== id || !isEditable(token)) return token;
    if (entry.type !== "phase" && entry.type !== "activity") return token;
    return {
      ...token,
      type: entry.type,
      label: entry.label,
      category: entry.category,
      asset: entry.asset,
    };
  });
}

/**
 * Seam where the next token is added: just after the selected activity,
 * or after the last activity when nothing is selected.
 * A phase-only chain uses the seam after the last phase.
 */
export function nextAddSeam(tokens: ProcessToken[], selectedId: string | null): number | null {
  const chain = chainTokens(tokens);
  if (chain.length === 0) return null;
  const selectedIndex = chain.findIndex((token) => token.id === selectedId);
  if (selectedIndex >= 0 && chain[selectedIndex].type === "activity") return selectedIndex + 1;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (chain[index].type === "activity") return index + 1;
  }
  return chain.length;
}

/** Seam just after this phase or activity. Index 0 is the starting-point gap. */
export function seamAfterToken(tokens: ProcessToken[], id: string): number | null {
  const chain = chainTokens(tokens);
  const index = chain.findIndex((token) => token.id === id);
  if (index < 0) return null;
  return index + 1;
}
