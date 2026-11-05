import type {
  ReflectionApiRequest,
  ReflectionContext,
} from "./reflectionTypes";

const TITLE_MAX = 120;
const TEXT_MAX = 800;
const ANSWER_MAX = 1200;
const TOKEN_LIMIT = 40;

function clip(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function optionalClip(value: string | undefined, max: number) {
  if (!value) return undefined;
  const clipped = clip(value, max);
  return clipped || undefined;
}

/**
 * Maps reflector context to the lean API payload.
 * Omits assets, geometry, ranking state, and unrelated app data.
 */
export function prepareReflectionApiRequest(
  context: ReflectionContext,
  question1?: string | null,
): ReflectionApiRequest {
  const stage = context.stage === "QUESTION_1" ? 1 : 2;
  const focusTokens =
    context.scope === "selected-section"
      ? context.selectedTokens
      : context.processTokens;

  const tokens = focusTokens.slice(0, TOKEN_LIMIT).map((token) => ({
    id: token.id,
    name: clip(token.label, 80),
    type: token.type,
    ...(token.phase ? { phase: token.phase } : {}),
  }));

  const request: ReflectionApiRequest = {
    stage,
    scope:
      context.scope === "selected-section"
        ? "selected_section"
        : "whole_process",
    project: {
      title: clip(context.project.title || "Untitled project", TITLE_MAX),
      description: optionalClip(context.project.description, TEXT_MAX),
      designQuestion: optionalClip(context.project.designQuestion, TEXT_MAX),
      target: optionalClip(context.project.target, TEXT_MAX),
    },
    process: {
      tokens,
      precedingToken: optionalClip(context.preceding.at(-1)?.label, 80),
      followingToken: optionalClip(context.following[0]?.label, 80),
      currentPhase: optionalClip(context.currentPhaseLabel ?? undefined, 40),
    },
  };

  if (stage === 2) {
    request.question1 = optionalClip(question1 ?? undefined, TEXT_MAX);
    request.answer1 = optionalClip(context.firstAnswer ?? undefined, ANSWER_MAX);
  }

  return request;
}
