/**
 * GENERATE preview client — canonical stills via /api/render (AbortController + request ids).
 */

export type GenerateRequest = {
  piece: string;
  seed: number;
  frame: number;
  width: number;
  height: number;
  quality?: "draft" | "preview" | "final";
  parameters: Record<string, number | string | boolean>;
};

export type GenerateResult = {
  blob: Blob;
  objectUrl: string;
  requestId: number;
  piece: string;
  seed: number;
  recipeDigest: string;
  renderDigest: string;
  renderMs: number;
};

function digestString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class GeneratePreviewController {
  private requestId = 0;
  private abort: AbortController | null = null;
  private debounceTimer: number | null = null;
  private lastUrl: string | null = null;

  recipeDigest(req: GenerateRequest): string {
    return digestString(
      JSON.stringify({
        piece: req.piece,
        seed: req.seed,
        frame: req.frame,
        w: req.width,
        h: req.height,
        q: req.quality ?? "preview",
        p: req.parameters,
      }),
    );
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  schedule(
    req: GenerateRequest,
    delayMs: number,
    onStart: (id: number) => void,
    onDone: (result: GenerateResult) => void,
    onError: (err: Error, id: number) => void,
  ): void {
    this.cancel();
    this.debounceTimer = window.setTimeout(() => {
      void this.run(req, onStart, onDone, onError);
    }, delayMs);
  }

  async run(
    req: GenerateRequest,
    onStart: (id: number) => void,
    onDone: (result: GenerateResult) => void,
    onError: (err: Error, id: number) => void,
  ): Promise<void> {
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    const id = ++this.requestId;
    onStart(id);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          piece: req.piece,
          seed: req.seed,
          frame: req.frame,
          width: req.width,
          height: req.height,
          format: "png",
          quality: req.quality ?? "preview",
          parameters: req.parameters,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      if (id !== this.requestId) return; // stale
      const blob = await res.blob();
      if (id !== this.requestId) return;
      const recipeDigest =
        res.headers.get("X-Numbrane-Recipe-Digest") ?? this.recipeDigest(req);
      const renderDigest =
        res.headers.get("X-Numbrane-Render-Digest") ?? digestString(`${blob.size}:${recipeDigest}`);
      if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
      const objectUrl = URL.createObjectURL(blob);
      this.lastUrl = objectUrl;
      onDone({
        blob,
        objectUrl,
        requestId: id,
        piece: req.piece,
        seed: req.seed,
        recipeDigest,
        renderDigest,
        renderMs: performance.now() - t0,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (id !== this.requestId) return;
      onError(err instanceof Error ? err : new Error(String(err)), id);
    }
  }

  dispose(): void {
    this.cancel();
    if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
    this.lastUrl = null;
  }
}
