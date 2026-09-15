/**
 * Per-piece animation export backend selection.
 */

import { getPieceRuntime, type RendererKind } from "../runtime/registry";

export type AnimationExportBackend = "python-frames" | "runtime-frames" | "unsupported";

function animateKind(pieceId: string): RendererKind | null {
  return getPieceRuntime(pieceId).animate;
}

/** Which backend must produce deterministic frames for export. */
export function animationExportBackend(pieceId: string): AnimationExportBackend {
  const kind = animateKind(pieceId);
  if (!kind || kind === "unsupported") return "unsupported";
  if (kind === "python-api") return "python-frames";
  if (
    kind === "webgl-stateful" ||
    kind === "wasm" ||
    kind === "geometry-ir" ||
    kind === "shader-native"
  ) {
    return "runtime-frames";
  }
  return "unsupported";
}

export function exportBackendLabel(backend: AnimationExportBackend): string {
  switch (backend) {
    case "python-frames":
      return "python-frames";
    case "runtime-frames":
      return "runtime-frames";
    default:
      return "unsupported";
  }
}
