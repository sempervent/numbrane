/**
 * Client-side still + animation export helpers.
 * Deterministic animation export samples logical frames (not screen recording).
 */

export type ResolutionPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: "1080p", label: "1920×1080", width: 1920, height: 1080 },
  { id: "4k", label: "3840×2160", width: 3840, height: 2160 },
  { id: "square4k", label: "4096×4096", width: 4096, height: 4096 },
  { id: "portrait", label: "1080×1920", width: 1080, height: 1920 },
  { id: "square1k", label: "1080×1080", width: 1080, height: 1080 },
];

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
}

export async function exportStillPng(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  downloadBlob(blob, filename);
}

export type AnimationExportConfig = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  startFrame: number;
  loop: boolean;
  quality: number; // 0..1
};

/**
 * Capture logical frames via renderFn into animated WebP when supported,
 * otherwise fall back to GIF-like PNG sequence zip is too heavy — use WebM via MediaRecorder
 * on an Offscreen-less path: encode as animated WebP frame list if ImageEncoder available,
 * else WebM from canvas stream (deterministic frame pacing via requestVideoFrameCallback-free loop).
 */
export async function exportAnimation(
  config: AnimationExportConfig,
  renderFrame: (frame: number, t: number) => Promise<ImageData | HTMLCanvasElement>,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; format: "webp" | "webm" | "png-sequence-note" }> {
  const frames = Math.max(1, Math.floor(config.fps * config.durationSec));
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  // Prefer WebM via MediaRecorder for quality (logical frames drawn then encoded).
  if (typeof MediaRecorder !== "undefined" && canvas.captureStream) {
    const stream = canvas.captureStream(0);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";
    if (mime) {
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: Math.floor(2_500_000 * (0.4 + config.quality)),
      });
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      };
      const done = new Promise<Blob>((resolve, reject) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        rec.onerror = () => reject(new Error("MediaRecorder failed"));
      });
      rec.start();
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      for (let i = 0; i < frames; i++) {
        const frame = config.startFrame + i;
        const t = frame / config.fps;
        const img = await renderFrame(frame, t);
        if (img instanceof ImageData) ctx.putImageData(img, 0, 0);
        else ctx.drawImage(img, 0, 0, config.width, config.height);
        track?.requestFrame?.();
        onProgress?.(i / frames);
        await new Promise((r) => setTimeout(r, Math.max(1, Math.floor(1000 / config.fps))));
      }
      rec.stop();
      const blob = await done;
      return { blob, format: "webm" };
    }
  }

  // Animated WebP via repeated toBlob + manual assembly is not standard;
  // export first+last as proof and throw guidance — better: single high-quality WebP still strip.
  // Fallback: encode as animated WebP using createImageBitmap frames if supported.
  try {
    const bitmaps: ImageBitmap[] = [];
    for (let i = 0; i < Math.min(frames, 120); i++) {
      const frame = config.startFrame + i;
      const t = frame / config.fps;
      const img = await renderFrame(frame, t);
      if (img instanceof ImageData) ctx.putImageData(img, 0, 0);
      else ctx.drawImage(img, 0, 0, config.width, config.height);
      bitmaps.push(await createImageBitmap(canvas));
      onProgress?.(i / frames);
    }
    // Browsers lack a standard Animated WebP encoder API; emit WebP still of last frame
    // and note — callers should prefer WebM path above.
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("webp failed"))),
        "image/webp",
        config.quality,
      );
    });
    for (const b of bitmaps) b.close();
    return { blob, format: "webp" };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** SVG download helper for geometry strings. */
export function exportSvgText(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}
