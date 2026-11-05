import { PURPOSE_LABEL } from "../data/activityMetadata";
import { ACTIVITY_REGISTRY } from "../data/activityRegistry";
import { TOKEN_CATALOG, type CatalogEntry } from "../process/tokenCatalog";
import { foldSearchText } from "./activityFilters";

export type SearchMatchKind =
  | "exact"
  | "prefix"
  | "name"
  | "keyword"
  | "description";

export type TokenSearchHit = CatalogEntry & {
  match: SearchMatchKind;
  score: number;
};

const MATCH_SCORE: Record<SearchMatchKind, number> = {
  exact: 500,
  prefix: 400,
  name: 300,
  keyword: 200,
  description: 100,
};

type Searchable = CatalogEntry & {
  keywords: string[];
  description: string;
};

function catalogPool(): Searchable[] {
  const phases = TOKEN_CATALOG.phase.map((entry) => ({
    ...entry,
    keywords: [entry.id.replace(/-/g, " ")],
    description: "",
  }));
  const checkpoints = TOKEN_CATALOG.checkpoint.map((entry) => ({
    ...entry,
    keywords: [entry.id.replace(/-/g, " ")],
    description: "",
  }));
  const activities = ACTIVITY_REGISTRY.map((activity) => ({
    id: activity.id,
    asset: activity.asset,
    label: activity.label,
    type: activity.type,
    category: activity.category,
    keywords: [
      activity.id.replace(/-/g, " "),
      ...activity.purposes.map((purpose) => PURPOSE_LABEL[purpose]),
    ],
    description: activity.note,
  }));
  return [...phases, ...activities, ...checkpoints];
}

function bestMatch(entry: Searchable, query: string): SearchMatchKind | null {
  const folded = foldSearchText(query);
  if (!folded) return null;
  const terms = folded.split(" ").filter(Boolean);
  if (terms.length === 0) return null;

  const name = foldSearchText(entry.label);
  const idText = foldSearchText(entry.id.replace(/-/g, " "));
  const keywords = foldSearchText(entry.keywords.join(" "));
  const description = foldSearchText(entry.description);

  if (terms.length === 1) {
    const term = terms[0];
    if (name === term || idText === term) return "exact";
    if (name.startsWith(term) || idText.startsWith(term)) return "prefix";
  }

  if (terms.every((term) => name.includes(term) || idText.includes(term))) {
    return "name";
  }
  if (terms.every((term) => keywords.includes(term))) return "keyword";
  if (terms.every((term) => description.includes(term))) return "description";

  const haystack = foldSearchText(
    [entry.label, entry.id.replace(/-/g, " "), entry.keywords.join(" "), entry.description].join(
      " ",
    ),
  );
  if (terms.every((term) => haystack.includes(term))) {
    if (terms.some((term) => name.includes(term) || idText.includes(term))) return "name";
    if (terms.some((term) => keywords.includes(term))) return "keyword";
    return "description";
  }
  return null;
}

/**
 * Search the complete token library: phases, activities, and checkpoints.
 * Manual phase filters are intentionally ignored.
 * Relevance order: exact → prefix → name → keyword → description.
 */
export function searchTokenLibrary(query: string): TokenSearchHit[] {
  const folded = foldSearchText(query);
  if (!folded) return [];

  const hits: TokenSearchHit[] = [];
  for (const entry of catalogPool()) {
    const match = bestMatch(entry, folded);
    if (!match) continue;
    hits.push({
      id: entry.id,
      asset: entry.asset,
      label: entry.label,
      type: entry.type,
      category: entry.category,
      match,
      score: MATCH_SCORE[match],
    });
  }

  return hits.sort(
    (left, right) =>
      right.score - left.score ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
}
