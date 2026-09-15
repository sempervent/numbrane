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

  it("composition_mode construction strips edges for stills", () => {
    const full = buildGeometryIr("geometry/metatron", 42, { composition_mode: "canonical" });
    const cons = buildGeometryIr("geometry/metatron", 42, { composition_mode: "construction" });
    expect(full.edges.length).toBeGreaterThan(0);
    expect(cons.edges.length).toBe(0);
    expect(cons.meta.construction).toBe(true);
  });

  it("construction animation reveals progressive IR phases", () => {
    const early = buildGeometryIr(
      "geometry/metatron",
      42,
      { composition_mode: "construction" },
      { forAnimation: true, constructionProgress: 0.1 },
    );
    expect(early.meta.construction_phase).toBe("centers");
    expect(early.edges.length).toBe(0);

    const circles = buildGeometryIr(
      "geometry/flower-of-life",
      42,
      { composition_mode: "construction" },
      { forAnimation: true, constructionProgress: 0.35 },
    );
    expect(circles.meta.construction_phase).toBe("circles");

    const edges = buildGeometryIr(
      "geometry/metatron",
      42,
      { composition_mode: "construction" },
      { forAnimation: true, constructionProgress: 0.6 },
    );
    expect(edges.meta.construction_phase).toBe("edges");
    expect(edges.edges.length).toBeGreaterThan(0);

    const layers = buildGeometryIr(
      "geometry/seed-of-life",
      42,
      { composition_mode: "construction" },
      { forAnimation: true, constructionProgress: 0.95 },
    );
    expect(layers.meta.construction_phase).toBe("layers");
  });

  it("GEOM pieces expose composition_mode in paramSchema", () => {
    for (const id of [
      "geometry/metatron",
      "geometry/seed-of-life",
      "geometry/flower-of-life",
      "geometry/sri-yantra",
      "geometry/isometric",
    ]) {
      const schema = getPieceRuntime(id).paramSchema;
      const field = schema.find((f) => f.key === "composition_mode");
      expect(field?.type).toBe("choice");
      expect(field?.choices).toContain("construction");
      expect(field?.choices).toContain("fragment");
      expect(field?.choices).toContain("layered");
    }
  });
});

describe("studio-piece-fidelity live errors", () => {
  it("UnsupportedLivePieceError names the piece and mode", () => {
    const err = new UnsupportedLivePieceError("fields/flow-hatching", "react");
    expect(err.message).toContain("fields/flow-hatching");
    expect(err.message).toContain("react");
  });
});
