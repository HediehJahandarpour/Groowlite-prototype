import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { reflectionApiPlugin } from "./server/reflection/createReflectionApiPlugin";

const tokensDir = "/Users/daneshmand/Desktop/Studio Tast/Groow lite/Tokens";

const tokenTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Serve the live token folder on every request, including files added after startup. */
function tokensSource(): Plugin {
  return {
    name: "groow-tokens",
    configureServer(server) {
      server.middlewares.use("/tokens", (req, res, next) => {
        const raw = decodeURIComponent((req.url ?? "").split("?")[0]);
        const name = path.posix.basename(raw);
        const type = tokenTypes[path.extname(name).toLowerCase()];
        if (!name || name !== raw.replace(/^\/+/, "") || !type) {
          next();
          return;
        }
        const file = path.join(tokensDir, name);
        fs.stat(file, (error, stat) => {
          if (error || !stat.isFile()) {
            next();
            return;
          }
          res.setHeader("Content-Type", type);
          res.setHeader("Content-Length", String(stat.size));
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Last-Modified", stat.mtime.toUTCString());
          fs.createReadStream(file).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [tokensSource(), reflectionApiPlugin(), react()],
});
