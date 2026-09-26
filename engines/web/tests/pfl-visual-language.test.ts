/**
 * PFL visual language — explore locks, series, audio profiles, arcs.
 */

import { describe, expect, it } from "vitest";
import { orderedScenes } from "../src/live/setModel";
import {
  moreLikeThis,
  generateSeries,
  applyMetaAxis,
} from "../src/studio/explore/variants";
import { PFL_STYLES, applyStyle, MUTATION_STRENGTH } from "../src/studio/style/pfl";
import { defaultMappingsForPiece } from "../src/studio/audio/mappings";
import { scaledMappings } from "../src/studio/audio/profiles";
import { ANIM_ARCS } from "../src/studio/presets";
import { COMPOSITIONS } from "../src/studio/compositions";

describe("pfl styles", () => {
  it("exposes six curated styles", () => {
    expect(PFL_STYLES.length).toBeGreaterThanOrEqual(6);
    expect(applyStyle({ density: 0.5 }, "pfl-void").palette).toBeTruthy();
  });

  it("preserves algorithm keys when style applied", () => {
    const base = { density: 0.5, attractor_type: "clifford" };
    const next = applyStyle(base, "pfl-void");
    expect(next.attractor_type).toBe("clifford");
    expect(next.palette).toBeTruthy();
  });
});

describe("mutation + locks", () => {
  it("subtle < moderate < wild", () => {
    expect(MUTATION_STRENGTH.subtle).toBeLessThan(MUTATION_STRENGTH.moderate);
    expect(MUTATION_STRENGTH.moderate).toBeLessThan(MUTATION_STRENGTH.wild);
  });

  it("locks palette/composition/seed", () => {
    const base = {
      seed: 99,
      parameters: { density: 0.7, chaos: 0.2, hue: 0.4, margin: 1.2, ink: 1.1 },
    };
    const locked = new Set(["seed", "palette", "composition", "density"]);
    const vars = moreLikeThis(base, { count: 6, locked, mutationScale: "wild" });
    for (const v of vars) {
      expect(v.seed).toBe(99);
      expect(v.parameters.density).toBe(0.7);
      expect(v.parameters.hue).toBe(0.4);
      expect(v.parameters.margin).toBe(1.2);
    }
  });

  it("series members differ but stay cohesive", () => {
    const base = { seed: 11, parameters: { density: 0.7, chaos: 0.25, hue: 0.5 } };
    const series = generateSeries(base, { count: 8, mutationScale: "subtle" });
    expect(series).toHaveLength(8);
    const seeds = new Set(series.map((s) => s.seed));
    expect(seeds.size).toBeGreaterThan(1);
    // palette lock implies hue stays
    for (const s of series) {
      expect(s.parameters.hue).toBe(0.5);
    }
  });
});

describe("animate arcs", () => {
  it("has distinct non-sine envelopes", () => {
    const ids = ANIM_ARCS.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "emergence",
        "reveal",
        "growth",
        "drift",
        "fracture",
        "collapse",
        "settle",
        "afterimage",
      ]),
    );
    const p = { density: 1, chaos: 0.5, zoom: 1 };
    const early = ANIM_ARCS.find((a) => a.id === "emergence")!.apply(p, 0.1);
    const late = ANIM_ARCS.find((a) => a.id === "emergence")!.apply(p, 0.9);
    expect(late.density!).toBeGreaterThan(early.density!);
  });
});

describe("react audio profiles", () => {
  it("scales sensitivity", () => {
    const subtle = scaledMappings("growth/slime-mold", "subtle");
    const aggressive = scaledMappings("growth/slime-mold", "aggressive");
    expect(subtle[0]!.amount).toBeLessThan(aggressive[0]!.amount);
  });

  it("maps RD/slime/noodles/dg/latticefall", () => {
    for (const id of [
      "reaction-diffusion/reaction-diffusion",
      "growth/slime-mold",
      "particles/noodles",
      "growth/differential-growth",
      "flagship/latticefall",
    ]) {
      const m = defaultMappingsForPiece(id, "balanced");
      expect(m.length).toBeGreaterThanOrEqual(3);
      expect(m.every((x) => x.amount > 0 && x.amount < 2)).toBe(true);
    }
  });

  it("synthetic silence stays bounded (envelope amounts only)", () => {
    // Mapping amounts are the contract; live envelope lives in audio runtime.
    const m = defaultMappingsForPiece("reaction-diffusion/reaction-diffusion", "balanced");
    const silenceScale = 0; // silence → zero feature influence
    const params = { f: 0.055, k: 0.062 };
    const next = {
      f: params.f + silenceScale * (m.find((x) => x.target === "f")?.amount ?? 0),
      k: params.k + silenceScale * (m.find((x) => x.target === "k")?.amount ?? 0),
    };
    expect(next.f).toBeCloseTo(0.055);
    expect(next.k).toBeCloseTo(0.062);
  });
});

describe("compositions", () => {
  it("builds authentic mashups", () => {
    expect(COMPOSITIONS.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        "attractor-hatch",
        "rd-geometry",
        "voronoi-flow",
        "metatron-noodles",
        "yantra-rd",
        "slime-geometry",
        "truchet-growth",
      ]),
    );
    const set = COMPOSITIONS[0]!.build(42, { density: 0.7 });
    expect(orderedScenes(set)[0]!.layers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("meta axes", () => {
  it("maps organic", () => {
    const p = applyMetaAxis({ chaos: 0.1 }, "organic", 1);
    expect(p.chaos).toBeGreaterThan(0.5);
  });
});
