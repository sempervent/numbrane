import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { collectPieceManifests } from "./src/studio/catalog/manifestCollection";

const root = dirname(fileURLToPath(import.meta.url));
const shadersDir = resolve(root, "shaders");
const setsDir = resolve(root, "../../pieces/live");
const pflPacksDir = resolve(root, "../../pieces/pfl");
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

/** Serve committed PFL pack definitions from pieces/pfl/<slug>/pack.json */
function pflPackFixturesPlugin(): Plugin {
  return {
    name: "numbrane-pfl-pack-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const prefix = "/pieces/pfl/";
        if (!url.startsWith(prefix) || !url.endsWith("/pack.json")) {
          next();
          return;
        }
        const slug = url.slice(prefix.length, url.length - "/pack.json".length);
        if (!slug || slug.includes("..") || slug.includes("/")) {
          next();
          return;
        }
        const file = resolve(pflPacksDir, slug, "pack.json");
        if (!file.startsWith(pflPacksDir) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("pack fixture not found");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      if (!options.dir || !existsSync(pflPacksDir)) return;
      const out = resolve(options.dir, "pieces/pfl");
      for (const name of readdirSync(pflPacksDir)) {
        const src = resolve(pflPacksDir, name, "pack.json");
        if (!existsSync(src)) continue;
        const destDir = resolve(out, name);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(src, resolve(destDir, "pack.json"));
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
  return collectPieceManifests(piecesDir);
}

function gitSha(): string {
  try {
    const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim();
    return sha || process.env.NUMBRANE_BUILD_SHA || "unknown";
  } catch {
    return process.env.NUMBRANE_BUILD_SHA ?? "unknown";
  }
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

/** Local high-res render + animation export via numbrane CLI (+ ffmpeg when present). */
function renderApiPlugin(): Plugin {
  return {
    name: "numbrane-render-api",
    configureServer(server) {
      server.middlewares.use("/api/export", (req, res, next) => {
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
              fps?: number;
              start_frame?: number;
              duration_sec?: number;
              format?: string;
              quality?: number;
              loop?: boolean;
            };
            const fps = Math.max(1, Math.min(60, body.fps ?? 30));
            const duration = Math.max(0.1, Math.min(30, body.duration_sec ?? 2));
            const start = Math.max(0, body.start_frame ?? 0);
            const n = Math.min(180, Math.max(1, Math.floor(fps * duration)));
            const fmt = body.format === "apng" || body.format === "webm" || body.format === "gif"
              ? body.format
              : "webp";
            const job = resolve(repoRoot, "artifacts/anim-export", `job-${Date.now()}`);
            const framesDir = resolve(job, "frames");
            mkdirSync(framesDir, { recursive: true });
            const cli = resolve(repoRoot, "tools/numbrane_cli.py");
            for (let i = 0; i < n; i++) {
              const frame = start + i;
              const out = resolve(framesDir, `frame_${String(i).padStart(5, "0")}.png`);
              const r = spawnSync(
                "uv",
                [
                  "run",
                  "python",
                  cli,
                  "render",
                  body.piece,
                  "--seed",
                  String(body.seed ?? 42),
                  "--width",
                  String(body.width ?? 640),
                  "--height",
                  String(body.height ?? 360),
                  "--frame",
                  String(frame),
                  "--format",
                  "png",
                  "-o",
                  out,
                ],
                { cwd: resolve(repoRoot, "engines/python"), encoding: "utf8", timeout: 120_000 },
              );
              if (r.status !== 0 || !existsSync(out)) {
                res.statusCode = 500;
                res.end(r.stderr || r.stdout || `frame ${frame} failed`);
                return;
              }
            }
            const encoded = resolve(job, `out.${fmt}`);
            const pattern = resolve(framesDir, "frame_%05d.png");
            const ffArgs =
              fmt === "webm"
                ? ["-y", "-framerate", String(fps), "-i", pattern, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", encoded]
                : fmt === "apng"
                  ? ["-y", "-framerate", String(fps), "-i", pattern, "-plays", "0", "-f", "apng", encoded]
                  : fmt === "gif"
                    ? ["-y", "-framerate", String(fps), "-i", pattern, "-loop", "0", encoded]
                    : [
                        "-y",
                        "-framerate",
                        String(fps),
                        "-i",
                        pattern,
                        "-c:v",
                        "libwebp",
                        "-loop",
                        "0",
                        "-an",
                        encoded,
                      ];
            const enc = spawnSync("ffmpeg", ffArgs, { encoding: "utf8", timeout: 180_000 });
            if (enc.status !== 0 || !existsSync(encoded)) {
              res.statusCode = 500;
              res.end(enc.stderr || "ffmpeg encode failed — install ffmpeg for animated export");
              return;
            }
            const published = resolve(
              repoRoot,
              "artifacts/anim-export",
              `${body.piece.replace(/\//g, "_")}-s${body.seed ?? 42}.${fmt}`,
            );
            copyFileSync(encoded, published);
            const media =
              fmt === "webm"
                ? "video/webm"
                : fmt === "gif"
                  ? "image/gif"
                  : fmt === "apng"
                    ? "image/apng"
                    : "image/webp";
            res.setHeader("Content-Type", media);
            res.setHeader("X-Numbrane-Artifact", published.replace(repoRoot + "/", ""));
            res.setHeader("X-Numbrane-Frames", String(n));
            res.end(readFileSync(encoded));
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });

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
  define: {
    __NUMBRANE_BUILD_SHA__: JSON.stringify(process.env.NUMBRANE_BUILD_SHA ?? gitSha()),
    __NUMBRANE_BUILD_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
    __NUMBRANE_BUILD_TIME__: JSON.stringify(
      process.env.NUMBRANE_BUILD_TIME ?? new Date().toISOString(),
    ),
  },
  plugins: [shadersStaticPlugin(), pflPackFixturesPlugin(), liveSetsPlugin(), catalogPlugin(), renderApiPlugin()],
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
