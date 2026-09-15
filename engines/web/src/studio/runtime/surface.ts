/**
 * Decide which Studio surface renders the current piece/mode.
 */

import {
  getPieceRuntime,
  supportsMode,
  type RendererKind,
} from "./registry";
import type { StudioMode } from "../keyboard/registry";

export type StudioSurface = "api-preview" | "live" | "unsupported";

export function rendererKindFor(
  pieceId: string,
  mode: StudioMode,
): RendererKind | null {
  const r = getPieceRuntime(pieceId);
  if (mode === "generate") return r.generate;
  if (mode === "animate") return r.animate;
  return r.react;
}

export function studioSurface(pieceId: string, mode: StudioMode): StudioSurface {
  if (!supportsMode(pieceId, mode)) return "unsupported";
  const kind = rendererKindFor(pieceId, mode);
  if (!kind || kind === "unsupported") return "unsupported";
  if (kind === "python-api") return "api-preview";
  // GENERATE prefers python-api; geometry generate is python-api in registry.
  // Live for stateful / geometry-ir / wasm / shader-native.
  if (
    kind === "webgl-stateful" ||
    kind === "geometry-ir" ||
    kind === "wasm" ||
    kind === "shader-native"
  ) {
    return "live";
  }
  return "unsupported";
}

export function previewSize(): { width: number; height: number } {
  const w = Math.min(1280, Math.max(640, Math.floor(window.innerWidth * (window.devicePixelRatio || 1) * 0.55)));
  const h = Math.max(360, Math.floor(w * 9 / 16));
  return { width: w, height: h };
}

export function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! >>> 0;
}

export function paramsForApi(
  params: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  return { ...params };
}
