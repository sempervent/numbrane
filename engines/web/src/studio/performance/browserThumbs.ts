/**
 * Performance browser thumbnails — poster frames via render API.
 */

import { defaultsForPiece } from "../runtime/registry";
import { performanceMeta } from "./catalog";
import { supportsMode } from "../runtime/registry";

export type ThumbRequest = {
  pieceId: string;
  seed: number;
  frame: number;
  parameters: Record<string, number | string | boolean>;
};

export function thumbRequestForPiece(pieceId: string): ThumbRequest {
  const meta = performanceMeta(pieceId);
  const base = defaultsForPiece(pieceId);
  const parameters = { ...base, ...(meta?.previewParams ?? {}) };
  return {
    pieceId,
    seed: meta?.previewSeed ?? 42,
    frame: meta?.previewFrame ?? 0,
    parameters,
  };
}

export async function fetchPiecePosterThumb(
  req: ThumbRequest,
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        piece: req.pieceId,
        seed: req.seed,
        width: 320,
        height: 180,
        frame: req.frame,
        format: "png",
        quality: "preview",
        parameters: req.parameters,
      }),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Limited concurrency queue for browser thumbnails. */
export type ThumbLoadResult = "ok" | "failed" | "live-only";

/** Posters via /api/render only — never spin up parallel LiveSessions (GPU/WASM isolation). */
export async function loadThumbQueue(
  pieceIds: string[],
  onLoaded: (pieceId: string, url: string) => void,
  onFailed: (pieceId: string, reason: ThumbLoadResult) => void,
  opts: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const apiConcurrency = opts.concurrency ?? 3;
  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < pieceIds.length) {
      if (opts.signal?.aborted) return;
      const i = idx++;
      const pieceId = pieceIds[i]!;
      if (!supportsMode(pieceId, "generate")) {
        onFailed(pieceId, "live-only");
        continue;
      }
      const blob = await fetchPiecePosterThumb(thumbRequestForPiece(pieceId), opts.signal);
      if (opts.signal?.aborted) return;
      if (blob) onLoaded(pieceId, URL.createObjectURL(blob));
      else onFailed(pieceId, "failed");
    }
  };
  await Promise.all(Array.from({ length: apiConcurrency }, () => worker()));
}
