/**
 * Client for job-style animation encoding (browser renders frames → server FFmpeg).
 */

export type EncodeJobRequest = {
  fps: number;
  format: "webp" | "apng" | "webm" | "gif";
  quality: number;
  loop: boolean;
  piece: string;
  seed: number;
  frameCount: number;
};

export type EncodeJobResult = {
  blob: Blob;
  artifact?: string | null;
  frames: number;
};

export async function createAnimationJob(): Promise<string> {
  const res = await fetch("/api/animation-jobs", { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { job_id: string };
  return data.job_id;
}

export async function uploadAnimationFrame(
  jobId: string,
  index: number,
  png: Blob,
): Promise<void> {
  const res = await fetch(`/api/animation-jobs/${jobId}/frames/${index}`, {
    method: "PUT",
    body: png,
    headers: { "Content-Type": "image/png" },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function encodeAnimationJob(
  frames: Blob[],
  req: EncodeJobRequest,
  onProgress?: (msg: string) => void,
): Promise<EncodeJobResult> {
  const jobId = await createAnimationJob();
  try {
    for (let i = 0; i < frames.length; i++) {
      onProgress?.(`upload frame ${i + 1}/${frames.length}`);
      await uploadAnimationFrame(jobId, i, frames[i]!);
    }
    onProgress?.("encoding…");
    const res = await fetch(`/api/animation-jobs/${jobId}/encode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fps: req.fps,
        format: req.format,
        quality: req.quality,
        loop: req.loop,
        piece: req.piece,
        seed: req.seed,
        frame_count: req.frameCount,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const artifact = res.headers.get("X-Numbrane-Artifact");
    const blob = await res.blob();
    return { blob, artifact, frames: frames.length };
  } finally {
    await fetch(`/api/animation-jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
  }
}
