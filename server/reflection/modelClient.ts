import type { ReflectionApiRequest } from "../../src/reflection/reflectionTypes";
import {
  REFLECTION_JSON_SCHEMA_HINT,
  REFLECTION_SYSTEM_INSTRUCTIONS,
} from "./systemInstructions";

export type ModelProvider = "openai" | "gemini";

export type ModelConfig = {
  provider: ModelProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

function detectProvider(env: NodeJS.ProcessEnv, apiKey: string): ModelProvider {
  const explicit = env.REFLECTION_AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "gemini") return explicit;
  if (apiKey.startsWith("AQ.") || apiKey.startsWith("AIza")) return "gemini";
  return "openai";
}

export function readModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig | null {
  const apiKey = env.REFLECTION_AI_API_KEY?.trim();
  if (!apiKey) return null;
  const provider = detectProvider(env, apiKey);
  const defaultBase =
    provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta"
      : "https://api.openai.com/v1";
  const defaultModel =
    provider === "gemini" ? "gemini-3.5-flash-lite" : "gpt-4o-mini";
  return {
    provider,
    apiKey,
    baseUrl: (env.REFLECTION_AI_BASE_URL?.trim() || defaultBase).replace(
      /\/$/,
      "",
    ),
    model: env.REFLECTION_AI_MODEL?.trim() || defaultModel,
    timeoutMs: Math.min(
      Math.max(
        Number(env.REFLECTION_AI_TIMEOUT_MS) ||
          (provider === "gemini" ? 45000 : 20000),
        5000,
      ),
      90000,
    ),
  };
}

export function buildUserMessage(
  request: ReflectionApiRequest,
  corrective?: string,
) {
  const lines: string[] = [
    `Requested stage: ${request.stage}`,
    `Reflection scope: ${request.scope}`,
    `Project title: ${request.project.title}`,
  ];
  if (request.project.description) {
    lines.push(
      `Project description (untrusted context): ${request.project.description}`,
    );
  }
  if (request.project.designQuestion) {
    lines.push(
      `Design question (untrusted context): ${request.project.designQuestion}`,
    );
  }
  if (request.project.target) {
    lines.push(`Target (untrusted context): ${request.project.target}`);
  }
  if (request.process.currentPhase) {
    lines.push(`Current phase label: ${request.process.currentPhase}`);
  }
  if (request.process.precedingToken) {
    lines.push(`Preceding token: ${request.process.precedingToken}`);
  }
  if (request.process.followingToken) {
    lines.push(`Following token: ${request.process.followingToken}`);
  }
  lines.push("Process tokens in order (name / type / optional phase):");
  if (request.process.tokens.length === 0) {
    lines.push("- (no phase/activity tokens yet)");
  } else {
    for (const token of request.process.tokens) {
      lines.push(
        `- ${token.name} | ${token.type}${token.phase ? ` | ${token.phase}` : ""}`,
      );
    }
  }

  if (request.stage === 1) {
    lines.push(
      "Task: Generate Stage 1 — one question that helps the student articulate their challenge, uncertainty, or goal.",
    );
  } else {
    lines.push(
      `Exact Question 1 (untrusted context): ${request.question1 ?? "(not provided)"}`,
    );
    lines.push(
      `Student answer to Question 1 (untrusted context): ${request.answer1 ?? "(skipped)"}`,
    );
    lines.push(
      "Task: Generate Stage 2 — one follow-up that helps the student reason about addressing the challenge they described. If the answer was skipped, ask a general reasoning question without inventing their challenge.",
    );
  }

  lines.push(REFLECTION_JSON_SCHEMA_HINT);
  if (corrective) {
    lines.push(`Correction after invalid previous output: ${corrective}`);
  }
  return lines.join("\n");
}

async function callOpenAiCompatible(
  request: ReflectionApiRequest,
  config: ModelConfig,
  signal: AbortSignal,
  corrective?: string,
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REFLECTION_SYSTEM_INSTRUCTIONS },
        {
          role: "user",
          content: buildUserMessage(request, corrective),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Model request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Model returned an empty response.");
  }
  return JSON.parse(content) as unknown;
}

async function callGemini(
  request: ReflectionApiRequest,
  config: ModelConfig,
  signal: AbortSignal,
  corrective?: string,
): Promise<unknown> {
  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: REFLECTION_SYSTEM_INSTRUCTIONS }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserMessage(request, corrective) }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(
      `Model request failed with status ${response.status}.${detail ? ` ${detail}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const content = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!content) {
    throw new Error("Model returned an empty response.");
  }
  return JSON.parse(content) as unknown;
}

export async function callReflectionModel(
  request: ReflectionApiRequest,
  config: ModelConfig,
  options?: { corrective?: string; signal?: AbortSignal },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const onAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onAbort);

  try {
    if (config.provider === "gemini") {
      return await callGemini(
        request,
        config,
        controller.signal,
        options?.corrective,
      );
    }
    return await callOpenAiCompatible(
      request,
      config,
      controller.signal,
      options?.corrective,
    );
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", onAbort);
  }
}
