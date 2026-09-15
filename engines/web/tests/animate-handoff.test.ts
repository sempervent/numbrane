/**
 * Animate This / state continuity helpers (unit-level).
 */

import { describe, expect, it } from "vitest";

/** Mimic Generate → Animate handoff: frame N becomes animation startFrame N. */
function animateHandoff(state: {
  frame: number;
  seed: number;
  params: Record<string, number>;
  exported?: { json?: { frame?: number } };
}) {
  const startFrame = state.frame;
  const restoredFrame = state.exported?.json?.frame ?? startFrame;
  return {
    mode: "animate" as const,
    seed: state.seed,
    params: { ...state.params },
    startFrame,
    frame: restoredFrame,
    continuous: restoredFrame === state.frame,
  };
}

describe("animate this continuity", () => {
  it("preserves frame N for stateful handoff", () => {
    const h = animateHandoff({
      frame: 137,
      seed: 42,
      params: { density: 0.7 },
      exported: { json: { frame: 137 } },
    });
    expect(h.mode).toBe("animate");
    expect(h.startFrame).toBe(137);
    expect(h.frame).toBe(137);
    expect(h.continuous).toBe(true);
    expect(h.seed).toBe(42);
  });

  it("does not restart at frame 0 when handoff carries state", () => {
    const h = animateHandoff({ frame: 50, seed: 9, params: {} });
    expect(h.startFrame).not.toBe(0);
    expect(h.startFrame).toBe(50);
  });
});
