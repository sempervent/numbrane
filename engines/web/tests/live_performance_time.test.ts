import { describe, expect, it } from "vitest";
import { AnimationRuntime } from "../src/live/animationRuntime";
import { applyAnimationMethod } from "../src/studio/animation/methods";
import { livePerformanceTimeAt } from "../src/studio/animation/livePerformanceTime";
import { normalizeSpecForLivePerformance } from "../src/studio/animation/performance";
import { defaultAnimationSpec } from "../src/studio/animation/spec";

const SAMPLE_SEC = [0, 1, 7.9, 8.1, 16, 30, 60, 300, 3600];

describe("live performance time", () => {
  it("cycle phase never saturates at 1 in performance mode", () => {
    const spec = normalizeSpecForLivePerformance(
      "mashups/attractor-calligraphy",
      applyAnimationMethod("mashups/attractor-calligraphy", "composite-evolution"),
      "animate",
    );
    for (const t of SAMPLE_SEC) {
      const live = livePerformanceTimeAt(t, spec, true);
      expect(live.cyclePhase).toBeGreaterThanOrEqual(0);
      expect(live.cyclePhase).toBeLessThanOrEqual(1);
      if (t >= 8.1 && t <= 3600) {
        expect(live.cyclePhase).not.toBeCloseTo(1, 2);
      }
    }
  });

  it("parameter-drift method keeps varying phase past export duration", () => {
    const spec = normalizeSpecForLivePerformance(
      "fractals/strange-attractors",
      applyAnimationMethod("fractals/strange-attractors", "parameter-drift"),
      "animate",
    );
    const rt = new AnimationRuntime(spec);
    rt.performanceMode = true;
    const phases: number[] = [];
    for (const t of SAMPLE_SEC) {
      rt.seekTime(t);
      phases.push(rt.evaluate().phase);
    }
    expect(phases[0]).toBeCloseTo(0, 1);
    expect(phases[3]).not.toBeCloseTo(phases[2]!, 2);
    expect(phases[phases.length - 1]).not.toBeCloseTo(phases[phases.length - 2]!, 2);
  });

  it("export mode still clamps hold/stop envelopes", () => {
    const spec = { ...defaultAnimationSpec(), durationSec: 8, endBehavior: "hold" as const };
    const at16 = livePerformanceTimeAt(16, spec, false);
    expect(at16.exportPhase).toBe(1);
  });

  it("construction completes once then holds at 1 in performance mode", () => {
    const spec = normalizeSpecForLivePerformance(
      "geometry/metatron",
      applyAnimationMethod("geometry/metatron", "construction"),
      "animate",
    );
    const early = livePerformanceTimeAt(2, spec, true);
    const late = livePerformanceTimeAt(60, spec, true);
    expect(early.constructionPhase).toBeLessThan(1);
    expect(late.constructionPhase).toBe(1);
    expect(livePerformanceTimeAt(60, spec, true).cyclePhase).not.toBeCloseTo(1, 2);
  });
});
