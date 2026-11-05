import type { SavedReflection } from "./reflectionTypes";

const STORAGE_KEY = "groow-lite.reflections";

function readAll(): SavedReflection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedReflection[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedReflection[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota / private mode: saving is optional, so ignore failures.
  }
}

/** Explicitly saves a reflection. Never called automatically. */
export function saveReflection(
  entry: Omit<SavedReflection, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): SavedReflection {
  const saved: SavedReflection = {
    id: entry.id ?? `reflection-${Date.now()}`,
    scope: entry.scope,
    tokenIds: [...entry.tokenIds],
    question1: entry.question1,
    answer1: entry.answer1,
    question2: entry.question2,
    answer2: entry.answer2,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  const next = [...readAll(), saved];
  writeAll(next);
  return saved;
}

export function listSavedReflections(): SavedReflection[] {
  return readAll();
}
