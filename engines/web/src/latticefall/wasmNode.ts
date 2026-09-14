/**
 * Node/Vitest WASM init (reads bytes; avoids fetch).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WasmModule } from "./wasm";

let cached: WasmModule | null = null;

export async function loadLatticefallWasmNode(): Promise<WasmModule> {
  if (cached) return cached;
  const mod = (await import("../wasm/pkg/numbrane_wasm.js")) as unknown as WasmModule;
  const wasmPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../wasm/pkg/numbrane_wasm_bg.wasm",
  );
  const bytes = readFileSync(wasmPath);
  if (typeof mod.initSync === "function") {
    mod.initSync({ module: bytes });
  } else {
    await mod.default({ module_or_path: bytes });
  }
  cached = mod;
  return mod;
}
