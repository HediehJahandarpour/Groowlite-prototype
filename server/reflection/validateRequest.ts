import type { ReflectionApiRequest } from "../../src/reflection/reflectionTypes";

const TITLE_MAX = 120;
const TEXT_MAX = 800;
const ANSWER_MAX = 1200;
const TOKEN_LIMIT = 40;

function asString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function asToken(value: unknown, index: number) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id, 80) ?? `token-${index}`;
  const name = asString(record.name, 80);
  const type = asString(record.type, 40);
  if (!name || !type) return null;
  const phase = asString(record.phase, 40);
  return phase ? { id, name, type, phase } : { id, name, type };
}

/** Validates and truncates the client payload. Rejects oversized or malformed bodies. */
export function parseReflectionApiRequest(
  body: unknown,
): { ok: true; request: ReflectionApiRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const record = body as Record<string, unknown>;
  const stage = record.stage;
  if (stage !== 1 && stage !== 2) {
    return { ok: false, error: "stage must be 1 or 2." };
  }
  const scope = record.scope;
  if (scope !== "selected_section" && scope !== "whole_process") {
    return { ok: false, error: "scope must be selected_section or whole_process." };
  }

  const projectRaw =
    record.project && typeof record.project === "object"
      ? (record.project as Record<string, unknown>)
      : {};
  const title = asString(projectRaw.title, TITLE_MAX) ?? "Untitled project";

  const processRaw =
    record.process && typeof record.process === "object"
      ? (record.process as Record<string, unknown>)
      : {};
  const tokenList = Array.isArray(processRaw.tokens) ? processRaw.tokens : [];
  if (tokenList.length > TOKEN_LIMIT) {
    return { ok: false, error: "Too many process tokens." };
  }
  const tokens = [];
  for (let index = 0; index < tokenList.length; index += 1) {
    const token = asToken(tokenList[index], index);
    if (!token) return { ok: false, error: "Invalid process token." };
    tokens.push(token);
  }

  if (scope === "selected_section" && tokens.length === 0) {
    return { ok: false, error: "selected_section requires at least one token." };
  }

  const request: ReflectionApiRequest = {
    stage,
    scope,
    project: {
      title,
      description: asString(projectRaw.description, TEXT_MAX),
      designQuestion: asString(projectRaw.designQuestion, TEXT_MAX),
      target: asString(projectRaw.target, TEXT_MAX),
    },
    process: {
      tokens,
      precedingToken: asString(processRaw.precedingToken, 80),
      followingToken: asString(processRaw.followingToken, 80),
      currentPhase: asString(processRaw.currentPhase, 40),
    },
  };

  if (stage === 2) {
    request.question1 = asString(record.question1, TEXT_MAX);
    request.answer1 = asString(record.answer1, ANSWER_MAX);
  }

  return { ok: true, request };
}
