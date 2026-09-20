/**
 * Performance browser thumbnails — poster frames via render API.
 */

import { defaultsForPiece, supportsMode } from "../runtime/registry";
import { performanceMeta } from "./catalog";
import { BUILD_SHA } from "../buildInfo";

export type ThumbRequest = {
  pieceId: string;
  seed: number;
  frame: number;
  parameters: Record<string, number | string | boolean>;
};

export function thumbCacheKey(pieceId: string): string {
  const req = thumbRequestForPiece(pieceId);
  return `${pieceId}|${req.seed}|${req.frame}|${BUILD_SHA}`;
}

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
  timeoutMs = 20_000,
): Promise<Blob | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const merged =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : timeout;
  try {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: merged,
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

export type BrowserThumbQueueStats = {
  requested: number;
  loaded: number;
  liveOnly: number;
  failed: number;
  aborted: number;
  inFlight: number;
  /** Visible cards still showing the loading placeholder (should reach 0 when settled). */
  stillLoading?: number;
  failures: Array<{ pieceId: string; reason: string }>;
};

/** Posters via /api/render only — never spin up parallel LiveSessions (GPU/WASM isolation). */
export async function loadThumbQueue(
  pieceIds: string[],
  onLoaded: (pieceId: string, url: string, cacheKey: string) => void,
  onFailed: (pieceId: string, reason: ThumbLoadResult) => void,
  opts: {
    concurrency?: number;
    signal?: AbortSignal;
    onStats?: (stats: BrowserThumbQueueStats) => void;
  } = {},
): Promise<BrowserThumbQueueStats> {
  const apiConcurrency = opts.concurrency ?? 3;
  const stats: BrowserThumbQueueStats = {
    requested: pieceIds.length,
    loaded: 0,
    liveOnly: 0,
    failed: 0,
    aborted: 0,
    inFlight: 0,
    failures: [],
  };
  const report = () => opts.onStats?.({ ...stats, failures: [...stats.failures] });
  const pending = new Set(pieceIds);
  const finish = (pieceId: string): void => {
    pending.delete(pieceId);
  };
  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < pieceIds.length) {
      if (opts.signal?.aborted) return;
      const i = idx++;
      const pieceId = pieceIds[i]!;
      if (opts.signal?.aborted) return;
      stats.inFlight += 1;
      report();
      try {
        if (!supportsMode(pieceId, "generate")) {
          stats.liveOnly += 1;
          onFailed(pieceId, "live-only");
          finish(pieceId);
          report();
          continue;
        }
        const blob = await fetchPiecePosterThumb(thumbRequestForPiece(pieceId), opts.signal);
        if (opts.signal?.aborted) return;
        if (blob) {
          stats.loaded += 1;
          onLoaded(pieceId, URL.createObjectURL(blob), thumbCacheKey(pieceId));
        } else {
          stats.failed += 1;
          stats.failures.push({ pieceId, reason: "render-api-failed" });
          onFailed(pieceId, "failed");
        }
        finish(pieceId);
        report();
      } finally {
        stats.inFlight = Math.max(0, stats.inFlight - 1);
        report();
      }
    }
  };
  await Promise.all(Array.from({ length: apiConcurrency }, () => worker()));
  if (opts.signal?.aborted) {
    for (const pieceId of pending) {
      stats.aborted += 1;
      stats.failures.push({ pieceId, reason: "aborted" });
      onFailed(pieceId, "failed");
    }
    pending.clear();
  }
  stats.inFlight = 0;
  report();
  return stats;
}
