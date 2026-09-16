import { describe, expect, it } from "vitest";
import { interpolateCamera, panPresetViews } from "../src/studio/animation/camera";
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
