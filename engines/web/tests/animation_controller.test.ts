/**
 * Proves API animation self-cancellation and validates backpressured controller.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BufferedFrameAnimationController,
  countCompletedUnderAbortStorm,
} from "../src/studio/animate/controller";
import { GeneratePreviewController } from "../src/studio/generate/preview";

describe("API animation self-cancellation", () => {
  it("proves 30fps timer + abort-on-run completes ~0 frames when fetch is 500ms", () => {
    // Model of startApiAnim + GeneratePreviewController.run abort behavior
    const stats = countCompletedUnderAbortStorm(2000, 1000 / 30, 500);
    expect(stats.started).toBeGreaterThan(40);
    expect(stats.completed).toBe(0);
    expect(stats.aborted).toBeGreaterThan(40);
  });

  it("GeneratePreviewController.run aborts prior in-flight fetch", async () => {
    const ctrl = new GeneratePreviewController();
    const abortFlags: boolean[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      return await new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(
            new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), {
              status: 200,
            }),
          );
        }, 200);
        signal?.addEventListener("abort", () => {
          abortFlags.push(true);
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    }) as typeof fetch;

    const done: number[] = [];
    void ctrl.run(
      {
        piece: "fractals/sdf-raymarch2d",
        seed: 1,
        frame: 0,
        width: 64,
        height: 64,
        parameters: {},
      },
      () => {},
      () => done.push(0),
      () => {},
    );
    await new Promise((r) => setTimeout(r, 20));
    void ctrl.run(
      {
        piece: "fractals/sdf-raymarch2d",
        seed: 1,
        frame: 1,
        width: 64,
        height: 64,
        parameters: {},
      },
      () => {},
      () => done.push(1),
      () => {},
    );
    await new Promise((r) => setTimeout(r, 250));
    expect(abortFlags.length).toBeGreaterThanOrEqual(1);
    expect(done).toEqual([1]); // first never completes
    ctrl.dispose();
    globalThis.fetch = originalFetch;
  });
});

describe("BufferedFrameAnimationController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never aborts a completed sequence for pacing — paints monotonic frames", async () => {
    const paints: number[] = [];
    let active = 0;
    let maxActive = 0;
    const ctrl = new BufferedFrameAnimationController(
      {
        fetchFrame: async (req) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 40));
          active -= 1;
          return {
            blob: new Blob([`f${req.frame}`]),
            recipeDigest: "r",
            renderDigest: `d${req.frame}`,
            renderMs: 40,
          };
        },
        onPaint: (r) => paints.push(r.logicalFrame),
        onError: () => {},
      },
      { maxInFlight: 1 },
    );
    ctrl.start(
      {
        piece: "x",
        seed: 1,
        width: 32,
        height: 32,
        quality: "draft",
        parameters: {},
      },
      0,
    );
    await vi.advanceTimersByTimeAsync(250);
    ctrl.pause();
    await vi.advanceTimersByTimeAsync(100);
    expect(paints.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < paints.length; i++) {
      expect(paints[i]!).toBe(paints[i - 1]! + 1);
    }
    expect(maxActive).toBe(1);
    ctrl.dispose();
  });
});
