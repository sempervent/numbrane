import { describe, expect, it } from "vitest";
import { applySeedToParams } from "../src/live/seedLoad";

describe("seed load", () => {
  it("maps recipe parameters and seed", () => {
    const p = applySeedToParams({
      piece_id: "reaction-diffusion/reaction-diffusion",
      seed: 42,
      frame: 100,
      recipe: { parameters: { chaos: 0.3, "output.width": 512 } },
    });
    expect(p.seed).toBe(42);
    expect(p.frame).toBe(100);
    expect(p.chaos).toBe(0.3);
  });
});
