/**
 * Deterministic fixed-step frame capture from Studio live animation runtimes.
 * Uses a dedicated hidden canvas — never touches the visible Studio canvas.
 */

import { createLivePiece } from "../../live/pieces/registry";
import type { FrameState, LivePiece } from "../../live/piece";
import type { ColorConfig } from "../color/model";
import { hexToHueTurn } from "../color/model";
import { mergeParamsWithColor } from "../color/serialize";

export type RuntimeExportState = {
  arrays?: Record<string, Float32Array>;
  shapes?: Record<string, number[]>;
  json?: Record<string, unknown>;
  logicalFrame?: number;
};

export type RuntimeExportOptions = {
  pieceId: string;
  seed: number;
  params: Record<string, number | string | boolean>;
  color: ColorConfig;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  startFrame?: number;
  /** When set, export continues from captured Studio sim state. */
  importState?: RuntimeExportState | null;
  onProgress?: (frame: number, total: number) => void;
};

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

function applyParams(
  piece: LivePiece,
  params: Record<string, number | string | boolean>,
  color: ColorConfig,
): void {
  const ext = piece as LivePiece & { setColorConfig?: (c: ColorConfig) => void };
  ext.setColorConfig?.(color);
  for (const [k, v] of Object.entries(params)) {
    if (k === "color_json") continue;
    piece.setParameter(k, v);
  }
  if (typeof params.color_primary === "string") {
    piece.setParameter("hue", hexToHueTurn(String(params.color_primary)));
  }
}

export async function captureRuntimeFrames(opts: RuntimeExportOptions): Promise<Blob[]> {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL2 required for runtime animation export");

  const merged = mergeParamsWithColor(opts.params, opts.color);
  let piece: LivePiece;
  try {
    piece = await createLivePiece(gl, opts.pieceId, "animate");
  } catch (err) {
    throw new Error(
      `export runtime unavailable for ${opts.pieceId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  piece.initialize({ piece: opts.pieceId, parameters: merged }, opts.seed >>> 0);
  piece.resize(opts.width, opts.height);
  applyParams(piece, merged, opts.color);

  if (opts.importState?.arrays && piece.importState) {
    piece.importState({
      arrays: opts.importState.arrays,
      shapes: opts.importState.shapes ?? {},
      json: opts.importState.json,
    });
  }

  const dt = 1 / opts.fps;
  let logicalFrame = opts.importState?.logicalFrame ?? opts.startFrame ?? 0;
  const frames: Blob[] = [];

  for (let i = 0; i < opts.frameCount; i++) {
    const frameState: FrameState = {
      frame: logicalFrame,
      t: logicalFrame * dt,
      dt,
      fps: opts.fps,
      beat: 0,
      bar: 0,
      beatPhase: 0,
      bpm: 120,
    };
    piece.update(frameState);
    piece.render({
      framebuffer: null,
      width: opts.width,
      height: opts.height,
      transparent: opts.color.transparentBackground,
    });
    frames.push(await canvasToPng(canvas));
    logicalFrame += 1;
    opts.onProgress?.(i + 1, opts.frameCount);
  }

  piece.dispose();
  return frames;
}

/** Sample digests for regression tests (SHA-256 truncated). */
export async function frameBlobDigest(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
