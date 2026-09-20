import { describe, expect, it } from "vitest";
import { FramePacingRing } from "../src/live/framePacing";

describe("FramePacingRing", () => {
  it("keeps bounded sample count", () => {
    const ring = new FramePacingRing(64);
    for (let i = 0; i < 200; i++) ring.push(16 + (i % 5));
    const snap = ring.snapshot(60, 60);
    expect(snap.sampleCount).toBe(64);
  });

  it("counts slow frames", () => {
    const ring = new FramePacingRing(32);
    for (let i = 0; i < 20; i++) ring.push(16);
    ring.push(120);
    ring.push(40);
    const snap = ring.snapshot(30, 58);
    expect(snap.over100Ms).toBeGreaterThanOrEqual(1);
    expect(snap.over33Ms).toBeGreaterThanOrEqual(1);
  });
});
