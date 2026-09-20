/**
 * Bounded rolling frame-time samples for live performance diagnosis.
 */

export type FramePacingSnapshot = {
  sampleCount: number;
  visualFps: number;
  rafHz: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over33Ms: number;
  over50Ms: number;
  over100Ms: number;
  over500Ms: number;
};

export class FramePacingRing {
  private readonly cap: number;
  private buf: number[] = [];
  private head = 0;
  private count = 0;

  constructor(cap = 360) {
    this.cap = Math.max(32, cap);
    this.buf = new Array(this.cap).fill(0);
  }

  push(frameMs: number): void {
    const v = Math.max(0, frameMs);
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
  }

  snapshot(visualFps: number, rafHz: number): FramePacingSnapshot {
    const n = this.count;
    if (n === 0) {
      return {
        sampleCount: 0,
        visualFps,
        rafHz,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        over33Ms: 0,
        over50Ms: 0,
        over100Ms: 0,
        over500Ms: 0,
      };
    }
    const slice: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (this.head - 1 - i + this.cap) % this.cap;
      slice.push(this.buf[idx]!);
    }
    slice.sort((a, b) => a - b);
    const pick = (q: number) => slice[Math.min(n - 1, Math.floor(q * (n - 1)))]!;
    let over33 = 0;
    let over50 = 0;
    let over100 = 0;
    let over500 = 0;
    for (const v of slice) {
      if (v > 33) over33 += 1;
      if (v > 50) over50 += 1;
      if (v > 100) over100 += 1;
      if (v > 500) over500 += 1;
    }
    return {
      sampleCount: n,
      visualFps,
      rafHz,
      p50Ms: pick(0.5),
      p95Ms: pick(0.95),
      p99Ms: pick(0.99),
      maxMs: slice[n - 1]!,
      over33Ms: over33,
      over50Ms: over50,
      over100Ms: over100,
      over500Ms: over500,
    };
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }
}
