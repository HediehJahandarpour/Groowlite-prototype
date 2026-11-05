import { generateScriptedQuestionFromApiRequest } from "../../src/reflection/scriptedQuestions";
import type {
  ReflectionApiRequest,
  ReflectionApiResponse,
} from "../../src/reflection/reflectionTypes";
import { validateReflectionQuestion } from "../../src/reflection/validateQuestion";
import { callReflectionModel, readModelConfig, type ModelConfig } from "./modelClient";

const CORRECTIVE =
  "Previous output was invalid. Return exactly one open-ended reflective question as JSON. Do not recommend tokens, methods, or next steps. Do not ask more than one question.";

export type GenerateResult = ReflectionApiResponse & {
  /** Present when the model path failed and a fallback was used after an error. */
  degraded?: boolean;
};

async function tryModel(
  request: ReflectionApiRequest,
  config: ModelConfig,
  signal?: AbortSignal,
): Promise<ReflectionApiResponse | null> {
  const first = await callReflectionModel(request, config, { signal });
  const validFirst = validateReflectionQuestion(first, request.stage);
  if (validFirst) {
    return {
      stage: request.stage,
      dimension: validFirst.dimension,
      question: validFirst.question,
      source: "model",
    };
  }

  const second = await callReflectionModel(request, config, {
    corrective: CORRECTIVE,
    signal,
  });
  const validSecond = validateReflectionQuestion(second, request.stage);
  if (validSecond) {
    return {
      stage: request.stage,
      dimension: validSecond.dimension,
      question: validSecond.question,
      source: "model",
    };
  }
  return null;
}

/**
 * Generates one reflective question. Uses the model when configured;
 * otherwise (or after failed validation/retry) returns a scripted fallback.
 */
export async function generateReflectionQuestion(
  request: ReflectionApiRequest,
  options?: { signal?: AbortSignal; env?: NodeJS.ProcessEnv },
): Promise<GenerateResult> {
  const fallback = generateScriptedQuestionFromApiRequest(request);
  const config = readModelConfig(options?.env);

  if (!config) {
    return {
      stage: request.stage,
      dimension: fallback.dimension,
      question: fallback.question,
      source: "fallback",
    };
  }

  try {
    const modelResult = await tryModel(request, config, options?.signal);
    if (modelResult) return modelResult;
    return {
      stage: request.stage,
      dimension: fallback.dimension,
      question: fallback.question,
      source: "fallback",
      degraded: true,
    };
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    return {
      stage: request.stage,
      dimension: fallback.dimension,
      question: fallback.question,
      source: "fallback",
      degraded: true,
    };
  }
}
