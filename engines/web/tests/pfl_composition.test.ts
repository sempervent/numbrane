import { describe, expect, it } from "vitest";
import { compositionFromSeed, nextVariationSeed } from "../src/pfl/composition";

describe("PFL composition bundles", () => {
  it("produces distinct archetypes across seeds", () => {
    const seen = new Set<string>();
    for (let s = 1; s < 80; s++) {
      seen.add(compositionFromSeed(s * 9973).archetype);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("nextVariationSeed changes seed and composition digest", () => {
    const a = compositionFromSeed(424242);
    const next = nextVariationSeed(424242);
    expect(next).not.toBe(424242);
    const b = compositionFromSeed(next);
    expect(
      a.archetype !== b.archetype ||
        a.palette.name !== b.palette.name ||
        a.fieldScale !== b.fieldScale,
    ).toBe(true);
  });
});
