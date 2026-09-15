/**
 * PFL pack workflow unit tests.
 */

import { describe, expect, it } from "vitest";
import {
  emptyPack,
  itemFromLook,
  packToPerformanceSet,
  reorderItems,
  slugify,
} from "../src/studio/pack/types";

describe("pfl pack", () => {
  it("slugifies names", () => {
    expect(slugify("PFL Episode 12")).toBe("pfl-episode-12");
  });

  it("reorders items", () => {
    const a = itemFromLook({ pieceId: "a/x", seed: 1, parameters: {} });
    const b = itemFromLook({ pieceId: "b/y", seed: 2, parameters: {} });
    const c = itemFromLook({ pieceId: "c/z", seed: 3, parameters: {} });
    const next = reorderItems([a, b, c], 0, 2);
    expect(next.map((i) => i.seed)).toEqual([2, 3, 1]);
  });

  it("builds performance set from animation sections", () => {
    const pack = emptyPack("Show");
    pack.items = [
      itemFromLook({
        pieceId: "fractals/strange-attractors",
        seed: 113,
        parameters: { pfl_style: "pfl-ritual" },
        kind: "still",
      }),
      itemFromLook({
        pieceId: "growth/slime-mold",
        seed: 7,
        parameters: {},
        kind: "animation",
      }),
      itemFromLook({
        pieceId: "particles/noodles",
        seed: 9,
        parameters: {},
        kind: "react",
      }),
    ];
    const set = packToPerformanceSet(pack) as {
      scenes: Array<{ layers: Array<{ piece: string; seed: number }>; modulation: unknown[] }>;
    };
    expect(set.scenes.length).toBe(2);
    expect(set.scenes[0]!.layers[0]!.piece).toBe("growth/slime-mold");
    expect(set.scenes[1]!.modulation.length).toBeGreaterThan(0);
  });

  it("preserves recipe fields on items", () => {
    const item = itemFromLook({
      pieceId: "fields/flow-hatching",
      seed: 42,
      frame: 12,
      styleId: "pfl-signal",
      parameters: { mask: "ring", density: 0.7 },
    });
    expect(item.frame).toBe(12);
    expect(item.styleId).toBe("pfl-signal");
    expect(item.parameters.mask).toBe("ring");
  });
});
