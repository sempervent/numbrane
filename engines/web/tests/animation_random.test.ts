import { describe, expect, it } from "vitest";
import { animationMethodsForPiece } from "../src/studio/animation/methods";
import { RandomAnimationSequencer } from "../src/studio/animation/randomSequencer";

describe("RandomAnimationSequencer", () => {
  const methods = animationMethodsForPiece("geometry/metatron");
  const allowed = methods.map((m) => m.id);

  it("same sequence seed yields identical method order", () => {
    const a = RandomAnimationSequencer.create(42, 2, allowed, methods).sequence(6);
    const b = RandomAnimationSequencer.create(42, 2, allowed, methods).sequence(6);
    expect(a).toEqual(b);
  });

  it("different sequence seed usually differs", () => {
    const a = RandomAnimationSequencer.create(42, 2, allowed, methods).sequence(6);
    const b = RandomAnimationSequencer.create(99, 2, allowed, methods).sequence(6);
    expect(a).not.toEqual(b);
  });

  it("avoids immediate repeat when pool size >= 2", () => {
    const seq = RandomAnimationSequencer.create(7, 2, allowed, methods).sequence(12);
    for (let i = 1; i < seq.length; i++) {
      if (allowed.length > 1) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });
});
