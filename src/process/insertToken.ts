import type { CatalogEntry } from "./tokenCatalog";
import type { ProcessToken } from "./processTypes";

function isMiddle(token: ProcessToken) {
  return token.type === "phase" || token.type === "activity" || token.type === "checkpoint";
}

/** Insert a catalog token at a gap. Index 0 is the gap after the starting point. */
export function insertToken(tokens: ProcessToken[], at: number, entry: CatalogEntry): ProcessToken[] {
  const start = tokens.find((token) => token.type === "start");
  const end = tokens.find((token) => token.type === "end");
  if (!start || !end) return tokens;

  const middles = tokens.filter(isMiddle).sort((a, b) => a.order - b.order);
  const index = Math.max(0, Math.min(at, middles.length));
  if (index === 0 && entry.type !== "phase") return tokens;
  const created: ProcessToken = {
    id: `${entry.id}-${crypto.randomUUID()}`,
    type: entry.type,
    label: entry.label,
    category: entry.category,
    order: index + 1,
    permanent: false,
    asset: entry.asset,
  };
  middles.splice(index, 0, created);

  return [
    start,
    ...middles.map((token, order) => ({ ...token, order: order + 1 })),
    { ...end, order: middles.length + 1 },
  ];
}
