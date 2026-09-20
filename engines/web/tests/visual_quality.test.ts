import { describe, expect, it } from "vitest";
import { classifyVisualQuality, snapshotFromFrame } from "../src/live/visualQuality";
import type { PixelFrame } from "../src/live/pixelMetrics";

function flatFrame(lum: number, varL = 1): PixelFrame {
  return {
    gridW: 8,
    gridH: 8,
    meanLuminance: lum,
    luminanceVariance: varL,
    occupiedFraction: 1,
    alphaOccupancy: 1,
    changedPixelFraction: 0.001,
    rmsDifference: 0.5,
    digest: "flat",
  };
}

describe("visual quality classification", () => {
  it("flags dense/intense degenerate dark fields", () => {
    const snap = {
      ...snapshotFromFrame(flatFrame(3, 2)),
      occupiedFraction: 0.95,
    };
    const q = classifyVisualQuality(
      snap,
      { density: "dense", motion: "intense" },
      12,
      true,
      10,
    );
    expect(q.status).toBe("degenerate-dark");
  });

  it("allows calm pieces with moderate variance", () => {
    const snap = snapshotFromFrame(flatFrame(40, 24));
    const q = classifyVisualQuality(
      snap,
      { density: "sparse", motion: "calm" },
      1,
      true,
      10,
    );
    expect(q.status).toBe("healthy");
  });
});
