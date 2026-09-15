/**
 * Client helpers for Studio → /api/render|/api/export (Vite or Docker nginx proxy).
 */

export type StillExportRequest = {
  piece: string;
  seed: number;
  width: number;
  height: number;
  frame?: number;
  format?: "png" | "svg";
  parameters?: Record<string, number | string | boolean>;
};

export type AnimExportRequest = {
  piece: string;
  seed: number;
  width: number;
  height: number;
  fps: number;
  start_frame?: number;
  end_frame?: number;
  duration_sec?: number;
  format: "webp" | "apng" | "webm" | "gif";
  quality?: number;
  loop?: boolean;
  parameters?: Record<string, number | string | boolean>;
};

export async function apiRenderStill(req: StillExportRequest): Promise<Blob> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

export async function apiExportAnimation(
  req: AnimExportRequest,
  onProgress?: (msg: string) => void,
): Promise<{ blob: Blob; format: string; artifact?: string | null }> {
  onProgress?.("rendering logical frames…");
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await res.text());
  const artifact = res.headers.get("X-Numbrane-Artifact");
  const blob = await res.blob();
  onProgress?.("encoded");
  return { blob, format: req.format, artifact };
}

/** Probe whether a WebP blob is animated (ANMF chunk present). */
export async function webpIsAnimated(blob: Blob): Promise<boolean> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // RIFF....WEBP then look for ANIM / ANMF
  const text = new TextDecoder("latin1").decode(buf.subarray(0, Math.min(buf.length, 512)));
  if (!text.startsWith("RIFF") || !text.includes("WEBP")) return false;
  // Search full buffer for ANMF
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x41 && buf[i + 1] === 0x4e && buf[i + 2] === 0x4d && buf[i + 3] === 0x46) {
      return true; // ANMF
    }
  }
  return false;
}
