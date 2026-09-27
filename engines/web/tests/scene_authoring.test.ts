import { describe, expect, it } from "vitest";
import { buildStudioSetDef } from "../src/studio/desiredState";
import { orderedScenes } from "../src/live/setModel";
import { defaultSpecForPiece } from "../src/studio/animation/capabilities";
import { applyAnimationMethod, defaultAnimationMethodId } from "../src/studio/animation/methods";
import { normalizeSpecForLivePerformance } from "../src/studio/animation/performance";
import {
  applyRecipeToCapture,
  captureFromStudio,
  isSceneDirty,
  markSceneSaved,
  newAuthoringSession,
} from "../src/studio/scene/sceneAuthoring";
import {
  captureSceneRecipe,
  parseSceneRecipe,
  sceneDefFromRecipe,
  stableRecipeJson,
  type PersistedSceneRecipeV1,
} from "../src/studio/scene/sceneRecipe";
import {
  findSceneNameConflict,
  emptySceneLibrary,
  type SceneLibraryState,
} from "../src/studio/scene/sceneLibrary";
import { addSceneToSet } from "../src/studio/setScore/edges";
import { emptySetV2 } from "../src/studio/setScore/controller";
import { defaultColorConfig } from "../src/studio/color/model";
import { defaultSceneAuthoringSemantics } from "../src/studio/scene/sceneRecipe";

function sampleCapture(pieceId = "fractals/strange-attractors") {
  const method = defaultAnimationMethodId(pieceId);
  const spec = normalizeSpecForLivePerformance(
    pieceId,
    applyAnimationMethod(pieceId, method),
    "animate",
  );
  return {
    mode: "animate" as const,
    pieceId,
    seed: 4242,
    compositionId: null,
    params: { chaos: 0.4, density: 0.6, zoom: 1, hue: 0.1, exposure: 1, rotation: 0 },
    color: defaultColorConfig(),
    animationMethodId: method,
    activeAnimationMethodId: method,
    reactSensitivity: "balanced" as const,
    animationSpec: spec,
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
    authoring: defaultSceneAuthoringSemantics(),
  };
}

describe("Scene recipe persistence", () => {
  it("round-trips through JSON validation", () => {
    const recipe = captureSceneRecipe(sampleCapture(), "scene-test", "Attractors live");
    const parsed = parseSceneRecipe(JSON.parse(stableRecipeJson(recipe)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.desired.seed).toBe(4242);
    expect(parsed.recipe.animationSpec.endBehavior).toBe("continuous");
  });

  it("emits SceneDef compatible with buildStudioSetDef", () => {
    const recipe = captureSceneRecipe(sampleCapture(), "scene-a", "A");
    const fromRecipe = sceneDefFromRecipe(recipe);
    const fromLive = orderedScenes(
      buildStudioSetDef({
        ...recipe.desired,
        playing: true,
      }),
    )[0]!;
    expect(fromRecipe.layers[0]?.piece).toBe(fromLive.layers[0]?.piece);
    expect(fromRecipe.layers[0]?.seed).toBe(fromLive.layers[0]?.seed);
  });

  it("Save As leaves original recipe untouched", () => {
    const original = captureSceneRecipe(sampleCapture(), "scene-orig", "Original");
    const variation = captureSceneRecipe(
      { ...sampleCapture(), seed: 9999 },
      "scene-var",
      "Variation",
    );
    const state: SceneLibraryState = {
      version: 1,
      activeSceneId: "scene-var",
      scenes: { "scene-orig": original, "scene-var": variation },
    };
    expect(state.scenes["scene-orig"]!.desired.seed).toBe(4242);
    expect(state.scenes["scene-var"]!.desired.seed).toBe(9999);
  });

  it("detects dirty vs saved authoring session", () => {
    const session = newAuthoringSession("Draft");
    const capture = sampleCapture();
    expect(isSceneDirty(session, capture)).toBe(true);
    const recipe = captureFromStudio(capture, { ...session, activeSceneId: "scene-1" });
    const saved = markSceneSaved({ ...session, activeSceneId: "scene-1" }, recipe);
    expect(isSceneDirty(saved, capture)).toBe(false);
    expect(isSceneDirty(saved, { ...capture, seed: 1 })).toBe(true);
  });

  it("Set insertion snapshots scene at add time (catalog copy)", () => {
    let set = emptySetV2("set-1", "Test");
    const recipe = captureSceneRecipe(sampleCapture("geometry/metatron"), "scene-m", "Metatron");
    const scene = sceneDefFromRecipe(recipe);
    set = addSceneToSet(set, scene);
    expect(set.scene_catalog["scene-m"]!.layers[0]?.piece).toBe("geometry/metatron");
    recipe.desired.seed = 1;
    expect(set.scene_catalog["scene-m"]!.layers[0]?.seed).toBe(4242);
  });

  it("rejects duplicate scene names on save", () => {
    const lib: SceneLibraryState = {
      ...emptySceneLibrary(),
      scenes: { s1: captureSceneRecipe(sampleCapture(), "s1", "Midnight") },
    };
    const conflict = findSceneNameConflict(lib, "Midnight", "s2");
    expect(conflict?.id).toBe("s1");
  });

  it("production-style attractor piece preserves animation config", () => {
    const pieceId = "fractals/strange-attractors";
    const capture = sampleCapture(pieceId);
    capture.animationSpec = defaultSpecForPiece(pieceId);
    const recipe = captureSceneRecipe(capture, "scene-prod", "Attractor calligraphy");
    const { capture: restored } = applyRecipeToCapture(recipe);
    expect(restored.animationSpec.source).toBe(capture.animationSpec.source);
    expect(restored.pieceId).toBe(pieceId);
  });
});
