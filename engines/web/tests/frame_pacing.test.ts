import { describe, expect, it } from "vitest";
import { FramePacingRing } from "../src/live/framePacing";

describe("FramePacingRing", () => {
  it("reports empty snapshot with zero samples", () => {
    const ring = new FramePacingRing(64);
    const s = ring.snapshot(60, 60);
    expect(s.sampleCount).toBe(0);
    expect(s.p95Ms).toBe(0);
    expect(s.over500Ms).toBe(0);
  });

  it("tracks percentiles and long-frame counters", () => {
    const ring = new FramePacingRing(64);
    for (let i = 0; i < 40; i++) ring.push(16);
    ring.push(40);
    ring.push(80);
    ring.push(120);
    ring.push(600);
    const s = ring.snapshot(55, 60);
    expect(s.sampleCount).toBe(44);
    expect(s.p50Ms).toBeLessThanOrEqual(16);
    expect(s.maxMs).toBe(600);
    expect(s.over33Ms).toBeGreaterThanOrEqual(4);
    expect(s.over50Ms).toBeGreaterThanOrEqual(3);
    expect(s.over100Ms).toBeGreaterThanOrEqual(2);
    expect(s.over500Ms).toBe(1);
  });

  it("caps capacity and resets cleanly", () => {
    // Constructor enforces a minimum capacity of 32.
    const ring = new FramePacingRing(8);
    for (let i = 0; i < 40; i++) ring.push(10 + i);
    expect(ring.snapshot(0, 0).sampleCount).toBe(32);
    ring.reset();
    expect(ring.snapshot(0, 0).sampleCount).toBe(0);
  });
});
