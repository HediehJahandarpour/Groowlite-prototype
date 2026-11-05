import type {
  ReflectionDimension,
  ReflectionQuestionPayload,
} from "./reflectionTypes";

export const REFLECTION_DIMENSIONS: readonly ReflectionDimension[] = [
  "problem_clarification",
  "uncertainty",
  "assumptions",
  "evidence",
  "alternatives",
  "evaluation",
  "process_reflection",
] as const;

const DIMENSIONS: ReadonlySet<string> = new Set(REFLECTION_DIMENSIONS);

const FALLBACK: ReflectionQuestionPayload = {
  dimension: "uncertainty",
  question: "What are you most uncertain about in this part of your process?",
};

/** Patterns that indicate the model prescribed a method or token. */
const RECOMMENDATION_PATTERNS: RegExp[] = [
  /\byou should\b/i,
  /\byou must\b/i,
  /\b(?:as|for) your next (step|activity|token)\b/i,
  /\bthe next (activity|token) (?:is|should|to)\b/i,
  /\buse the\b.+\btoken\b/i,
  /\brecommend(?:ed|ing)?\b/i,
  /\brank(?:ed|ing)?\b.+\b(activit|token)/i,
  /\bchoose the\b.+\btoken\b/i,
  /\bselect the\b.+\b(token|activity)\b/i,
  /\binsert the\b/i,
  /\btry the\b.+\b(token|activity)\b/i,
];

/**
 * Validates structured question output. Rejects compound questions and
 * obvious recommendation / instruction violations.
 */
export function validateReflectionQuestion(
  value: unknown,
  expectedStage?: 1 | 2,
): ReflectionQuestionPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const dimension = record.dimension;
  const question = record.question;
  if (typeof dimension !== "string" || !DIMENSIONS.has(dimension)) return null;
  if (typeof question !== "string") return null;

  if (expectedStage !== undefined) {
    const stage = record.stage;
    if (stage !== undefined && stage !== expectedStage) return null;
  }

  const trimmed = question.trim().replace(/\s+/g, " ");
  if (trimmed.length < 12 || trimmed.length > 220) return null;
  if ((trimmed.match(/\?/g) ?? []).length !== 1) return null;
  if (!trimmed.endsWith("?")) return null;
  if (RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  return {
    dimension: dimension as ReflectionDimension,
    question: trimmed,
    stage: expectedStage,
  };
}

export function safeReflectionQuestion(
  value: unknown,
  fallback: ReflectionQuestionPayload = FALLBACK,
  expectedStage?: 1 | 2,
): ReflectionQuestionPayload {
  return (
    validateReflectionQuestion(value, expectedStage) ?? {
      ...fallback,
      stage: expectedStage ?? fallback.stage,
    }
  );
}

export { FALLBACK as DEFAULT_REFLECTION_FALLBACK };
