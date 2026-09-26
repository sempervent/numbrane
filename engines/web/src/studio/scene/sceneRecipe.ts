/**
 * Persisted Scene recipe — authoring state for CREATE, emitted as SceneDef for Sets.
 * Runtime animation clock / transport positions are not part of the recipe.
 */

import type { SceneDef } from "../../live/types";
import { orderedScenes } from "../../live/setModel";
import { buildStudioSetDef, type StudioDesiredState } from "../desiredState";
import type { AnimationSpec } from "../animation/spec";
import type { ColorConfig } from "../color/model";
import type { MetaAxis } from "../explore/variants";
import type { ReactSensitivity } from "../audio/profiles";
import type { StudioMode } from "../keyboard/registry";
import { defaultColorConfig } from "../color/model";
import type { BehaviorPresetId } from "./behaviorPresets";
import { DEFAULT_MACRO_VALUES, type CreativeMacroValues } from "./creativeMacros";

export const SCENE_RECIPE_VERSION = 1 as const;

export type SceneAuthoringSemantics = {
  behaviorPresetId: BehaviorPresetId | "";
  creativeMacros: CreativeMacroValues;
  variationIndex: number;
};

/** Authoring snapshot stored in the Scene library (not live transport state). */
export type PersistedSceneRecipeV1 = {
  version: typeof SCENE_RECIPE_VERSION;
  id: string;
  name: string;
  desired: Omit<StudioDesiredState, "playing">;
  animationSpec: AnimationSpec;
  generateFrame: number;
  meta: Record<MetaAxis, number>;
  pflStyleId: string;
  authoring?: SceneAuthoringSemantics;
};

export type SceneRecipeCapture = {
  mode: StudioMode;
  pieceId: string;
  seed: number;
  compositionId: string | null;
  params: Record<string, number | string | boolean>;
  color: ColorConfig;
  animationMethodId: string;
  activeAnimationMethodId: string;
  reactSensitivity: ReactSensitivity;
  animationSpec: AnimationSpec;
  generateFrame: number;
  meta: Record<MetaAxis, number>;
  pflStyleId: string;
  authoring: SceneAuthoringSemantics;
};

export function defaultSceneAuthoringSemantics(): SceneAuthoringSemantics {
  return {
    behaviorPresetId: "",
    creativeMacros: { ...DEFAULT_MACRO_VALUES },
    variationIndex: 0,
  };
}

export type SceneRecipeValidation =
  | { ok: true; recipe: PersistedSceneRecipeV1 }
  | { ok: false; errors: string[] };

export function newSceneId(): string {
  return `scene-${Date.now().toString(36)}`;
}

export function defaultSceneName(pieceId: string): string {
  const tail = pieceId.split("/").pop() ?? pieceId;
  return tail.replace(/-/g, " ");
}

export function captureSceneRecipe(
  capture: SceneRecipeCapture,
  id: string,
  name: string,
): PersistedSceneRecipeV1 {
  return {
    version: SCENE_RECIPE_VERSION,
    id,
    name,
    desired: {
      mode: capture.mode,
      pieceId: capture.pieceId,
      seed: capture.seed,
      compositionId: capture.compositionId,
      params: { ...capture.params },
      color: structuredClone(capture.color),
      animationMethodId: capture.animationMethodId,
      activeAnimationMethodId: capture.activeAnimationMethodId,
      reactSensitivity: capture.reactSensitivity,
    },
    animationSpec: structuredClone(capture.animationSpec),
    generateFrame: capture.generateFrame,
    meta: { ...capture.meta },
    pflStyleId: capture.pflStyleId,
    authoring: {
      behaviorPresetId: capture.authoring.behaviorPresetId,
      creativeMacros: { ...capture.authoring.creativeMacros },
      variationIndex: capture.authoring.variationIndex,
    },
  };
}

export function stableRecipeJson(recipe: PersistedSceneRecipeV1): string {
  return JSON.stringify(recipe);
}

export function recipesEqual(a: PersistedSceneRecipeV1, b: PersistedSceneRecipeV1): boolean {
  return stableRecipeJson(a) === stableRecipeJson(b);
}

export function parseSceneRecipe(raw: unknown): SceneRecipeValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Scene recipe must be an object"] };
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== SCENE_RECIPE_VERSION) {
    errors.push(`Unsupported scene recipe version: ${String(o.version)}`);
  }
  if (typeof o.id !== "string" || !o.id.trim()) errors.push("Scene id required");
  if (typeof o.name !== "string" || !o.name.trim()) errors.push("Scene name required");
  const desired = o.desired;
  if (!desired || typeof desired !== "object") {
    errors.push("desired state required");
  } else {
    const d = desired as Record<string, unknown>;
    if (typeof d.pieceId !== "string" || !d.pieceId) errors.push("desired.pieceId required");
    if (typeof d.seed !== "number") errors.push("desired.seed must be a number");
    if (!["generate", "animate", "react"].includes(String(d.mode))) {
      errors.push("desired.mode must be generate, animate, or react");
    }
  }
  if (!o.animationSpec || typeof o.animationSpec !== "object") {
    errors.push("animationSpec required");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, recipe: raw as PersistedSceneRecipeV1 };
}

/** Build runtime SceneDef — same shape CREATE uses when loading into LiveSession. */
export function sceneDefFromRecipe(recipe: PersistedSceneRecipeV1): SceneDef {
  const desired: StudioDesiredState = {
    ...recipe.desired,
    playing: true,
  };
  const set = buildStudioSetDef(desired);
  const base = orderedScenes(set)[0]!;
  return {
    ...base,
    id: recipe.id,
    name: recipe.name,
  };
}

/** Migrate legacy captured SceneDef from performance storage into a recipe when possible. */
export function recipeFromLegacySceneDef(scene: SceneDef, mode: StudioMode = "animate"): PersistedSceneRecipeV1 | null {
  const layer = scene.layers[0];
  if (!layer?.piece) return null;
  const params = { ...(layer.parameters ?? {}) };
  return captureSceneRecipe(
    {
      mode,
      pieceId: layer.piece,
      seed: layer.seed ?? 42,
      compositionId: null,
      params,
      color: defaultColorConfig(),
      animationMethodId: "pan-left-right",
      activeAnimationMethodId: "pan-left-right",
      reactSensitivity: "balanced",
      animationSpec: {
        source: "generative",
        components: ["generative"],
        motion: "drift",
        durationSec: 8,
        endBehavior: "continuous",
        easing: "linear",
        camera: {
          motion: "pan",
          panPreset: "left-right",
          zoomMode: "none",
          start: { centerX: -0.22, centerY: 0, scale: 1, rotation: 0 },
          end: { centerX: 0.22, centerY: 0, scale: 1, rotation: 0 },
          anchorX: 0.5,
          anchorY: 0.5,
        },
      },
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
    },
    scene.id,
    scene.name,
  );
}
