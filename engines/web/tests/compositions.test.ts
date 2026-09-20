import { describe, expect, it } from "vitest";
import { COMPOSITIONS, compositionById } from "../src/studio/compositions";

describe("PFL composition recipes", () => {
  it("includes geometry-sdf and yantra-sdf", () => {
    expect(compositionById("geometry-sdf")?.layerMethods?.L1).toBe("construction");
    expect(compositionById("yantra-sdf")?.layerMethods?.L0).toBe("slow-drift");
  });

  it("builds multi-layer sets for geometry-sdf", () => {
    const set = compositionById("geometry-sdf")!.build(42, { density: 0.5 });
    const layers = set.scenes[0]!.layers;
    expect(layers.length).toBe(2);
    expect(layers[0]!.piece).toBe("fractals/sdf-raymarch2d");
    expect(layers[1]!.piece).toBe("geometry/metatron");
    expect(layers[1]!.blend).toBe("screen");
  });

  it("rd-geometry remains two live layers", () => {
    const set = compositionById("rd-geometry")!.build(1, {});
    expect(set.scenes[0]!.layers.map((l) => l.piece)).toEqual([
      "reaction-diffusion/reaction-diffusion",
      "geometry/metatron",
    ]);
  });
});
