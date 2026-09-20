import { describe, expect, it } from "vitest";
import {
  cameraViewAtPerformanceTime,
  interpolateCamera,
  panPresetViews,
} from "../src/studio/animation/camera";
import {
  animationPhase,
  constructionProgress,
  DEFAULT_CAMERA_SPEC,
  exportLoopFlag,
} from "../src/studio/animation/spec";

describe("animationPhase", () => {
  it("hold clamps at 1", () => {
    expect(animationPhase(0, 2, "hold")).toBe(0);
    expect(animationPhase(1, 2, "hold")).toBe(0.5);
    expect(animationPhase(2, 2, "hold")).toBe(1);
    expect(animationPhase(4, 2, "hold")).toBe(1);
  });

  it("loop wraps with fract", () => {
    expect(animationPhase(1, 2, "loop")).toBeCloseTo(0.5);
    expect(animationPhase(2, 2, "loop")).toBeCloseTo(0);
    expect(animationPhase(3, 2, "loop")).toBeCloseTo(0.5);
  });

  it("ping-pong triangle wave", () => {
    expect(animationPhase(0, 2, "ping-pong")).toBe(0);
    expect(animationPhase(1, 2, "ping-pong")).toBeCloseTo(0.5);
    expect(animationPhase(2, 2, "ping-pong")).toBeCloseTo(1);
    expect(animationPhase(3, 2, "ping-pong")).toBeCloseTo(0.5);
    expect(animationPhase(4, 2, "ping-pong")).toBeCloseTo(0);
  });

  it("continuous does not wrap", () => {
    expect(animationPhase(5, 2, "continuous")).toBe(1);
  });
});

describe("camera pan", () => {
  it("left-right preset moves centerX", () => {
    const { start, end } = panPresetViews("left-right");
    const mid = interpolateCamera(
      { ...DEFAULT_CAMERA_SPEC, start, end, panPreset: "left-right", motion: "pan" },
      0.5,
      "linear",
    );
    expect(mid.centerX).toBeCloseTo(0, 1);
    expect(start.centerX).toBeLessThan(end.centerX);
  });

  it("live performance pan stays monotonic past cycle boundaries", () => {
    const { start, end } = panPresetViews("left-right");
    const spec = { ...DEFAULT_CAMERA_SPEC, start, end, panPreset: "left-right" as const, motion: "pan" as const };
    const cycle = 8;
    const samples = [7.5, 7.9, 8.0, 8.1, 8.5, 15.9, 16.1, 30];
    const xs = samples.map((t) => cameraViewAtPerformanceTime(spec, t, cycle, "linear").centerX);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]!).toBeGreaterThan(xs[i - 1]! - 1e-6);
    }
    expect(xs[xs.length - 1]!).toBeGreaterThan(end.centerX * 2);
  });
});

describe("export loop metadata", () => {
  it("maps end behavior to container loop", () => {
    expect(exportLoopFlag("loop")).toBe(true);
    expect(exportLoopFlag("ping-pong")).toBe(true);
    expect(exportLoopFlag("hold")).toBe(false);
    expect(exportLoopFlag("continuous")).toBe(false);
  });
});

describe("constructionProgress", () => {
  it("hold stays at terminal progress", () => {
    expect(constructionProgress(1, "hold")).toBe(1);
    expect(constructionProgress(1.5, "hold")).toBe(1);
  });
});
