/**
 * Studio ANIMATE controllers — never abort in-flight frames for FPS pacing.
 *
 * GeneratePreviewController remains for GENERATE stills only.
 */

import type { GenerateRequest, GenerateResult } from "../generate/preview";

export type AnimPaintResult = {
  objectUrl: string;
  logicalFrame: number;
  renderMs: number;
  recipeDigest: string;
  renderDigest: string;
};

export type BufferedAnimHooks = {
  fetchFrame: (
    req: GenerateRequest,
    signal: AbortSignal,
  ) => Promise<{
    blob: Blob;
    recipeDigest: string;
    renderDigest: string;
    renderMs: number;
  }>;
  onPaint: (result: AnimPaintResult) => void;
  onError: (err: Error, logicalFrame: number) => void;
  onStats?: (stats: { updateFps: number; latencyMs: number; inFlight: number }) => void;
};

/**
 * Backpressured sequential (or lightly pipelined) frame animation.
 * Completes frame N before requesting N+1 (or with bounded prefetch).
 * Never aborts a frame solely because the wall-clock FPS timer fired.
 */
export class BufferedFrameAnimationController {
  private running = false;
  private disposed = false;
  private generation = 0;
  private abort: AbortController | null = null;
  private logicalFrame = 0;
  private displayedFrame = -1;
  private lastUrl: string | null = null;
  private inFlight = 0;
  private readonly maxInFlight: number;
  private paintTimes: number[] = [];
  private lastLatency = 0;

  constructor(
    private hooks: BufferedAnimHooks,
    opts: { maxInFlight?: number } = {},
  ) {
    this.maxInFlight = Math.max(1, Math.min(3, opts.maxInFlight ?? 1));
  }

  getLogicalFrame(): number {
    return this.logicalFrame;
  }

  getDisplayedFrame(): number {
    return this.displayedFrame;
  }

  getUpdateFps(): number {
    if (this.paintTimes.length < 2) return 0;
    const span = this.paintTimes[this.paintTimes.length - 1]! - this.paintTimes[0]!;
    if (span <= 0) return 0;
    return ((this.paintTimes.length - 1) * 1000) / span;
  }

  getLatencyMs(): number {
    return this.lastLatency;
  }

  /** Start (or restart) continuous animation from `startFrame`. */
  start(baseReq: Omit<GenerateRequest, "frame">, startFrame: number): void {
    this.stop({ revokeLast: false });
    this.disposed = false;
    this.running = true;
    this.logicalFrame = startFrame >>> 0;
    this.generation += 1;
    const gen = this.generation;
    void this.pump(baseReq, gen);
  }

  /** Soft pause — keep last frame visible; do not abort the current in-flight paint. */
  pause(): void {
    this.running = false;
  }

  /** Resume from current logical frame (does not rewind). */
  resume(baseReq: Omit<GenerateRequest, "frame">): void {
    if (this.disposed) return;
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    const gen = this.generation;
    void this.pump(baseReq, gen);
  }

  /**
   * Hard stop. Abort only when leaving the animation session
   * (piece/seed/mode change or dispose).
   */
  stop(opts: { revokeLast?: boolean; abortInFlight?: boolean } = {}): void {
    this.running = false;
    this.generation += 1;
    if (opts.abortInFlight !== false) {
      this.abort?.abort();
      this.abort = null;
    }
    this.inFlight = 0;
    if (opts.revokeLast) {
      if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
      this.lastUrl = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop({ revokeLast: true, abortInFlight: true });
  }

  private async pump(baseReq: Omit<GenerateRequest, "frame">, gen: number): Promise<void> {
    while (this.running && !this.disposed && gen === this.generation) {
      if (this.inFlight >= this.maxInFlight) {
        await new Promise((r) => setTimeout(r, 8));
        continue;
      }
      const frame = this.logicalFrame;
      this.logicalFrame += 1;
      this.inFlight += 1;
      const ac = new AbortController();
      this.abort = ac;
      try {
        const req: GenerateRequest = { ...baseReq, frame };
        const t0 = performance.now();
        const fetched = await this.hooks.fetchFrame(req, ac.signal);
        if (gen !== this.generation || this.disposed) return;
        const objectUrl = URL.createObjectURL(fetched.blob);
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastUrl = objectUrl;
        this.displayedFrame = frame;
        this.lastLatency = fetched.renderMs || performance.now() - t0;
        const now = performance.now();
        this.paintTimes.push(now);
        if (this.paintTimes.length > 32) this.paintTimes.shift();
        this.hooks.onPaint({
          objectUrl,
          logicalFrame: frame,
          renderMs: this.lastLatency,
          recipeDigest: fetched.recipeDigest,
          renderDigest: fetched.renderDigest,
        });
        this.hooks.onStats?.({
          updateFps: this.getUpdateFps(),
          latencyMs: this.lastLatency,
          inFlight: this.inFlight,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (gen !== this.generation || this.disposed) return;
        this.hooks.onError(err instanceof Error ? err : new Error(String(err)), frame);
        // Back off briefly so a hard failure does not spin.
        await new Promise((r) => setTimeout(r, 250));
      } finally {
        this.inFlight = Math.max(0, this.inFlight - 1);
      }
    }
  }
}

/** Prove that rapid run() abort storms never complete frames. */
export function countCompletedUnderAbortStorm(
  runMs: number,
  intervalMs: number,
  fetchMs: number,
): { started: number; completed: number; aborted: number } {
  let started = 0;
  let completed = 0;
  let aborted = 0;
  let current: { id: number; done: boolean } | null = null;
  let nextId = 0;
  for (let t = 0; t < runMs; t += intervalMs) {
    if (current && !current.done) {
      aborted += 1;
      current.done = true;
    }
    const id = ++nextId;
    started += 1;
    current = { id, done: false };
    // Would complete at t+fetchMs if not aborted
    const completeAt = t + fetchMs;
    const nextAbort = t + intervalMs;
    if (completeAt < nextAbort && completeAt < runMs) {
      completed += 1;
      current.done = true;
      current = null;
    }
  }
  return { started, completed, aborted };
}
