/**
 * Studio piece fidelity — no silent Metatron/shader fallback; seeds alter structure.
 */

import { describe, expect, it } from "vitest";
import {
  buildGeometryIr,
  geometryTopologyHash,
} from "../src/studio/geometry/generators";
import {
  getPieceRuntime,
  PIECE_RUNTIMES,
  SHADER_NATIVE_PIECES,
  supportsMode,
} from "../src/studio/runtime/registry";
import { studioSurface } from "../src/studio/runtime/surface";
import { UnsupportedLivePieceError } from "../src/live/pieces/registry";

describe("studio-piece-fidelity registry", () => {
  it("every catalog piece declares generate capability explicitly", () => {
    for (const [id, desc] of Object.entries(PIECE_RUNTIMES)) {
      expect(desc.pieceId).toBe(id);
      expect(desc.generate).not.toBeUndefined();
      if (desc.generate === "shader-native") {
        expect(SHADER_NATIVE_PIECES.has(id)).toBe(true);
      }
    }
  });

  it("unknown pieces are unsupported, not shader approximations", () => {
    const r = getPieceRuntime("fake/unknown-piece");
    expect(r.generate).toBe("unsupported");
    expect(r.animate).toBeNull();
    expect(supportsMode("fake/unknown-piece", "generate")).toBe(false);
    expect(studioSurface("fake/unknown-piece", "generate")).toBe("unsupported");
  });

  it("GENERATE for maintained catalog uses python-api or native, never silent fallback", () => {
    const critical = [
      "geometry/metatron",
      "geometry/sri-yantra",
      "fields/flow-hatching",
      "fractals/strange-attractors",
      "growth/slime-mold",
      "reaction-diffusion/reaction-diffusion",
      "tiling/truchet-tiles",
    ];
    for (const id of critical) {
      const r = getPieceRuntime(id);
      expect(r.generate === "python-api" || r.generate === "wasm" || r.generate === "geometry-ir").toBe(
        true,
      );
      expect(studioSurface(id, "generate")).toBe(
        r.generate === "python-api" ? "api-preview" : "live",
      );
    }
  });
});

describe("studio-piece-fidelity geometry IR", () => {
  const pieces = [
    "geometry/metatron",
    "geometry/seed-of-life",
    "geometry/flower-of-life",
    "geometry/sri-yantra",
    "geometry/isometric",
    "geometry/circle-packing",
  ];

  it("each geometry piece has distinct topology at same seed", () => {
    const hashes = pieces.map((id) => geometryTopologyHash(buildGeometryIr(id, 42, {})));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("seed changes topology or meta for seed-sensitive geometry", () => {
    for (const id of pieces) {
      const a = buildGeometryIr(id, 1, {});
      const b = buildGeometryIr(id, 137, {});
      const ha = geometryTopologyHash(a);
      const hb = geometryTopologyHash(b);
      // Either topology hash differs, or centers/primitives differ materially
      const sameTopo = ha === hb;
      if (sameTopo) {
        const sa = JSON.stringify(a.centers) + JSON.stringify(a.primitives ?? []);
        const sb = JSON.stringify(b.centers) + JSON.stringify(b.primitives ?? []);
        expect(sa).not.toBe(sb);
      }
    }
  });

  it("never falls back to shared Metatron for sri-yantra", () => {
    const sri = buildGeometryIr("geometry/sri-yantra", 42, {});
    const met = buildGeometryIr("geometry/metatron", 42, {});
    expect(sri.meta.kind).toBe("sri-yantra");
    expect(met.meta.kind).toBe("metatron");
    expect((sri.primitives?.length ?? 0) > 0).toBe(true);
    expect(met.edges.length).toBeGreaterThan(10);
  });
});

describe("studio-piece-fidelity live errors", () => {
  it("UnsupportedLivePieceError names the piece and mode", () => {
    const err = new UnsupportedLivePieceError("fields/flow-hatching", "react");
    expect(err.message).toContain("fields/flow-hatching");
    expect(err.message).toContain("react");
  });
});
