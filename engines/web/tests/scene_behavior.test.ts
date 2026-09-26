import { describe, expect, it } from "vitest";
import { behaviorCompatibility, listCompatibleBehaviors } from "../src/studio/scene/behaviorPresets";
import {
  applyCreativeMacros,
  DEFAULT_MACRO_VALUES,
} from "../src/studio/scene/creativeMacros";
import { applyVariationToParams, variationSeed } from "../src/studio/scene/sceneVariation";
import { filterCreateCatalogPieces, pieceDisplayLabel } from "../src/studio/scene/pieceDiscovery";
import type { PieceInfo } from "../src/studio/catalog";
import { captureSceneRecipe, parseSceneRecipe } from "../src/studio/scene/sceneRecipe";
import { defaultColorConfig } from "../src/studio/color/model";
import { defaultSpecForPiece } from "../src/studio/animation/capabilities";
import { defaultAnimationMethodId } from "../src/studio/animation/methods";

describe("Scene behavior presets and macros", () => {
  it("resolves compatible behavior for attractors", () => {
    const c = behaviorCompatibility("fractals/strange-attractors", "drift");
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.methodId).toBeTruthy();
  });

  it("lists disabled behaviors with reasons for incompatible families", () => {
    const list = listCompatibleBehaviors("geometry/metatron");
    expect(list.some((b) => b.id === "evolve" && !b.disabled)).toBe(true);
  });

  it("maps macros deterministically and clamps", () => {
    const base = { density: 0.5, chaos: 0.2, exposure: 1, zoom: 1 };
    const high = applyCreativeMacros(
      "fractals/strange-attractors",
      base,
      { density: 0.5, chaos: 0.3, organic: 0.4, kinetic: 0.5, saturated: 0.5, massive: 0.5 },
      { ...DEFAULT_MACRO_VALUES, density: 1, chaos: 1, energy: 1, motion: 1 },
    );
    expect(Number(high.params.density)).toBeGreaterThan(Number(base.density));
    expect(Number(high.params.chaos)).toBeGreaterThan(Number(base.chaos));
  });

  it("variation seed is stable and changes with index", () => {
    expect(variationSeed(42, 1)).toBe(variationSeed(42, 1));
    expect(variationSeed(42, 1)).not.toBe(variationSeed(42, 2));
  });

  it("persists authoring block on recipe round-trip", () => {
    const recipe = captureSceneRecipe(
      {
        mode: "animate",
        pieceId: "geometry/metatron",
        seed: 42,
        compositionId: null,
        params: { density: 0.7, chaos: 0.2, zoom: 1, hue: 0.1, exposure: 1, rotation: 0 },
        color: defaultColorConfig(),
        animationMethodId: defaultAnimationMethodId("geometry/metatron"),
        activeAnimationMethodId: defaultAnimationMethodId("geometry/metatron"),
        reactSensitivity: "balanced",
        animationSpec: defaultSpecForPiece("geometry/metatron"),
        generateFrame: 0,
        meta: {
          density: 0.7,
          chaos: 0.3,
          organic: 0.4,
          kinetic: 0.5,
          saturated: 0.55,
          massive: 0.5,
        },
        pflStyleId: "",
        authoring: {
          behaviorPresetId: "evolve",
          creativeMacros: { ...DEFAULT_MACRO_VALUES, energy: 0.8 },
          variationIndex: 2,
        },
      },
      "scene-x",
      "Metatron evolve",
    );
    const parsed = parseSceneRecipe(JSON.parse(JSON.stringify(recipe)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recipe.authoring?.behaviorPresetId).toBe("evolve");
      expect(parsed.recipe.authoring?.variationIndex).toBe(2);
    }
  });

  it("filters create catalog by family without losing labels", () => {
    const pieces: PieceInfo[] = [
      {
        piece_id: "geometry/metatron",
        title: "Metatron",
        capabilities: { animated: true },
      },
      {
        piece_id: "fractals/strange-attractors",
        title: "Strange Attractors",
        capabilities: { animated: true },
      },
    ];
    const fractalOnly = filterCreateCatalogPieces(pieces, "animate", "fractal");
    expect(fractalOnly).toHaveLength(1);
    expect(pieceDisplayLabel(fractalOnly[0]!)).toBe("Strange Attractors");
  });

  it("applyVariationToParams changes numeric params deterministically", () => {
    const a = applyVariationToParams({ density: 0.5, chaos: 0.2 }, "geometry/metatron", 99, 1);
    const b = applyVariationToParams({ density: 0.5, chaos: 0.2 }, "geometry/metatron", 99, 1);
    expect(a).toEqual(b);
    expect(a.density).not.toBe(0.5);
  });
});
