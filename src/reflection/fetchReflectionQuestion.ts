import type {
  ReflectionApiRequest,
  ReflectionApiResponse,
  ReflectionQuestionPayload,
} from "./reflectionTypes";
import { validateReflectionQuestion } from "./validateQuestion";

export class ReflectionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReflectionRequestError";
  }
}

export type FetchReflectionResult = {
  payload: ReflectionQuestionPayload;
  source: "model" | "fallback";
};

/**
 * Calls the server Reflector endpoint. Never sends a system prompt from the client.
 */
export async function fetchReflectionQuestion(
  request: ReflectionApiRequest,
  signal?: AbortSignal,
): Promise<FetchReflectionResult> {
  let response: Response;
  try {
    response = await fetch("/api/reflection/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ReflectionRequestError(
      "Could not reach the reflection service.",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "The reflection service could not prepare a question.";
    throw new ReflectionRequestError(message);
  }

  const record = body as ReflectionApiResponse | null;
  const validated = validateReflectionQuestion(record, request.stage);
  if (!validated || !record) {
    throw new ReflectionRequestError(
      "The reflection service returned an unexpected response.",
    );
  }

  return {
    payload: validated,
    source: record.source === "fallback" ? "fallback" : "model",
  };
}
