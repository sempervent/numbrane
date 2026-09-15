import { describe, expect, it } from "vitest";
import { animationExportBackend } from "../src/studio/export/exportBackend";
import { animationExportBackendFor } from "../src/studio/runtime/registry";

const RUNTIME_PIECES = [
  "flagship/latticefall",
  "fractals/sdf-raymarch2d",
  "fractals/escape-time",
  "reaction-diffusion/reaction-diffusion",
  "growth/slime-mold",
  "geometry/metatron",
  "fields/flow-hatching",
  "tiling/truchet-tiles",
];

describe("animation export backend registry", () => {
  for (const piece of RUNTIME_PIECES) {
    it(`${piece} uses runtime-frames export`, () => {
      expect(animationExportBackend(piece)).toBe("runtime-frames");
      expect(animationExportBackendFor(piece)).toBe("runtime-frames");
    });
  }

  it("python-api animate pieces use python-frames", () => {
    expect(animationExportBackend("mashups/attractor-calligraphy")).toBe("unsupported");
  });
});
