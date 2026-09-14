import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
const shadersDir = resolve(root, "shaders");
const setsDir = resolve(root, "../../pieces/live");
const piecesDir = resolve(root, "../../pieces");
const repoRoot = resolve(root, "../..");

/** Serve and emit GLSL from engines/web/shaders at /shaders/*. */
function shadersStaticPlugin(): Plugin {
  return {
    name: "numbrane-shaders-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/shaders/")) {
          next();
          return;
        }
        const name = url.slice("/shaders/".length);
        if (!name || name.includes("..") || name.includes("/")) {
          next();
          return;
        }
        const file = resolve(shadersDir, name);
        if (!file.startsWith(shadersDir) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("shader not found");
          return;
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      const out = resolve(options.dir, "shaders");
      mkdirSync(out, { recursive: true });
      for (const name of readdirSync(shadersDir)) {
        if (!name.endsWith(".frag") && !name.endsWith(".vert")) continue;
        copyFileSync(resolve(shadersDir, name), resolve(out, name));
      }
    },
  };
}

/** Serve live performance sets from pieces/live/<id>/set.json as /sets/<id>.json */
function liveSetsPlugin(): Plugin {
  return {
    name: "numbrane-live-sets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/sets/") || !url.endsWith(".json")) {
          next();
          return;
        }
        const id = url.slice("/sets/".length, url.length - ".json".length);
        if (!id || id.includes("..") || id.includes("/")) {
          next();
          return;
        }
        const file = resolve(setsDir, id, "set.json");
        if (!file.startsWith(setsDir) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("set not found");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      if (!options.dir || !existsSync(setsDir)) return;
      const out = resolve(options.dir, "sets");
      mkdirSync(out, { recursive: true });
      for (const name of readdirSync(setsDir)) {
        const src = resolve(setsDir, name, "set.json");
        if (existsSync(src)) copyFileSync(src, resolve(out, `${name}.json`));
      }
    },
  };
}

function collectPieces(): unknown[] {
  const pieces: unknown[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name === "manifest.json") {
        try {
          pieces.push(JSON.parse(readFileSync(p, "utf8")));
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(piecesDir);
  return pieces;
}

function catalogPlugin(): Plugin {
  return {
    name: "numbrane-catalog",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/catalog/pieces.json") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ pieces: collectPieces() }, null, 2));
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      const out = resolve(options.dir, "catalog");
      mkdirSync(out, { recursive: true });
      writeFileSync(
        resolve(out, "pieces.json"),
        JSON.stringify({ pieces: collectPieces() }, null, 2),
      );
    },
  };
}

/** Local high-res render via numbrane CLI (Studio export). */
function renderApiPlugin(): Plugin {
  return {
    name: "numbrane-render-api",
    configureServer(server) {
      server.middlewares.use("/api/render", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              piece: string;
              seed?: number;
              width?: number;
              height?: number;
              frame?: number;
              format?: string;
            };
            const fmt = body.format === "svg" ? "svg" : "png";
            const outDir = resolve(repoRoot, "artifacts/studio-export");
            mkdirSync(outDir, { recursive: true });
            const out = resolve(outDir, `export-${Date.now()}.${fmt}`);
            const cli = resolve(repoRoot, "tools/numbrane_cli.py");
            const args = [
              cli,
              "render",
              body.piece,
              "--seed",
              String(body.seed ?? 42),
              "--width",
              String(body.width ?? 1920),
              "--height",
              String(body.height ?? 1080),
              "--frame",
              String(body.frame ?? 0),
              "--format",
              fmt,
              "-o",
              out,
            ];
            const r = spawnSync("uv", ["run", "python", ...args], {
              cwd: resolve(repoRoot, "engines/python"),
              encoding: "utf8",
              timeout: 120_000,
            });
            if (r.status !== 0 || !existsSync(out)) {
              res.statusCode = 500;
              res.end(r.stderr || r.stdout || "render failed");
              return;
            }
            if (fmt === "svg") {
              res.setHeader("Content-Type", "image/svg+xml");
              res.end(readFileSync(out));
            } else {
              res.setHeader("Content-Type", "image/png");
              res.end(readFileSync(out));
            }
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shadersStaticPlugin(), liveSetsPlugin(), catalogPlugin(), renderApiPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        latticefall: resolve(root, "latticefall.html"),
        live: resolve(root, "live.html"),
        "live-output": resolve(root, "live-output.html"),
        studio: resolve(root, "studio.html"),
      },
    },
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["../src/wasm/pkg/numbrane_wasm.js"],
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
