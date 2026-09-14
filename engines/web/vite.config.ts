import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
const shadersDir = resolve(root, "shaders");
const setsDir = resolve(root, "../../pieces/live");

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

export default defineConfig({
  plugins: [shadersStaticPlugin(), liveSetsPlugin()],
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
