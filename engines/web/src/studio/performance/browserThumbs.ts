/**
 * Performance browser thumbnails — poster frames via render API.
 */

import { defaultsForPiece } from "../runtime/registry";
import { performanceMeta } from "./catalog";
import type { BrowserPreviewSession } from "./browserPreviewSession";
import { usesLiveBrowserPreview } from "./browserPreviewSession";

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
async function posterBlobForPiece(
  pieceId: string,
  signal: AbortSignal | undefined,
  previewSession?: BrowserPreviewSession,
): Promise<Blob | null> {
  if (usesLiveBrowserPreview(pieceId) && previewSession) {
    return previewSession.captureLivePoster(pieceId);
  }
  return fetchPiecePosterThumb(thumbRequestForPiece(pieceId), signal);
}

export async function loadThumbQueue(
  pieceIds: string[],
  onLoaded: (pieceId: string, url: string) => void,
  opts: {
    concurrency?: number;
    signal?: AbortSignal;
    previewSession?: BrowserPreviewSession;
  } = {},
): Promise<void> {
  const live = opts.previewSession;
  const apiConcurrency = opts.concurrency ?? 4;
  const liveIds = pieceIds.filter((id) => usesLiveBrowserPreview(id));
  const apiIds = pieceIds.filter((id) => !usesLiveBrowserPreview(id));

  for (const pieceId of liveIds) {
    if (opts.signal?.aborted) return;
    const blob = await posterBlobForPiece(pieceId, opts.signal, live);
    if (opts.signal?.aborted) return;
    if (blob) onLoaded(pieceId, URL.createObjectURL(blob));
  }

  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < apiIds.length) {
      if (opts.signal?.aborted) return;
      const i = idx++;
      const pieceId = apiIds[i]!;
      const blob = await posterBlobForPiece(pieceId, opts.signal, live);
      if (opts.signal?.aborted) return;
      if (blob) onLoaded(pieceId, URL.createObjectURL(blob));
    }
  };
  await Promise.all(Array.from({ length: apiConcurrency }, () => worker()));
}
