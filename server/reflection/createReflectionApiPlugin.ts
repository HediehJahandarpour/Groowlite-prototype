import path from "node:path";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { generateReflectionQuestion } from "./generateQuestion";
import { parseReflectionApiRequest } from "./validateRequest";

const ROUTE = "/api/reflection/question";

async function readJson(req: import("http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.reduce((sum, item) => sum + item.length, 0) > 32_000) {
      throw new Error("Request body too large.");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function sendJson(
  res: import("http").ServerResponse,
  status: number,
  body: unknown,
) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

function applyEnv(mode: string, root: string) {
  const loaded = loadEnv(mode, root, "");
  for (const [key, value] of Object.entries(loaded)) {
    if (key.startsWith("REFLECTION_AI_") && value) {
      process.env[key] = value;
    }
  }
}

function attachReflectionRoute(
  middlewares: {
    use: (
      fn: (
        req: import("http").IncomingMessage,
        res: import("http").ServerResponse,
        next: (error?: unknown) => void,
      ) => void,
    ) => void;
  },
) {
  middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith(ROUTE)) {
      next();
      return;
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    try {
      const body = await readJson(req);
      const parsed = parseReflectionApiRequest(body);
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error });
        return;
      }

      const result = await generateReflectionQuestion(parsed.request);
      sendJson(res, 200, result);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Request body too large."
          ? error.message
          : "Unable to generate a reflection question.";
      sendJson(res, 500, { error: message });
    }
  });
}

/**
 * Smallest server-side integration: Vite middleware for the Reflector API.
 * Keeps API keys off the client. Works with `vite` and `vite preview`.
 */
export function reflectionApiPlugin(): Plugin {
  return {
    name: "groow-reflection-api",
    configResolved(config) {
      applyEnv(config.mode, config.envDir || config.root || path.resolve("."));
    },
    configureServer(server) {
      applyEnv(
        server.config.mode,
        server.config.envDir || server.config.root || path.resolve("."),
      );
      attachReflectionRoute(server.middlewares);
    },
    configurePreviewServer(server) {
      applyEnv(
        server.config.mode,
        server.config.envDir || server.config.root || path.resolve("."),
      );
      attachReflectionRoute(server.middlewares);
    },
  };
}
