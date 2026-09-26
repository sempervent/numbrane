/**
 * Scene authoring — dirty tracking and apply recipe to Studio capture shape.
 */

import { normalizeSpecForLivePerformance } from "../animation/performance";
import { normalizeAnimationMethodForPiece } from "../desiredState";
import {
  captureSceneRecipe,
  stableRecipeJson,
  type PersistedSceneRecipeV1,
  type SceneRecipeCapture,
} from "./sceneRecipe";

/** Stable persistence snapshot — normalizes animation/method fields that drift at runtime. */
export function normalizeSceneRecipeCapture(capture: SceneRecipeCapture): SceneRecipeCapture {
  const norm = normalizeAnimationMethodForPiece(
    capture.pieceId,
    capture.animationMethodId,
    capture.activeAnimationMethodId,
  );
  let animationSpec = capture.animationSpec;
  if (capture.mode === "animate" || capture.mode === "react") {
    animationSpec = normalizeSpecForLivePerformance(
      capture.pieceId,
      animationSpec,
      capture.mode,
    );
  }
  return {
    ...capture,
    animationMethodId: norm.animationMethodId,
    activeAnimationMethodId: norm.activeAnimationMethodId,
    animationSpec: structuredClone(animationSpec),
    params: { ...capture.params },
    color: structuredClone(capture.color),
    meta: { ...capture.meta },
  };
}

export type SceneAuthoringSession = {
  activeSceneId: string | null;
  sceneName: string;
  /** JSON of last persisted recipe for active scene (null = never saved / new). */
  savedSnapshot: string | null;
};

export function newAuthoringSession(defaultName: string): SceneAuthoringSession {
  return {
    activeSceneId: null,
    sceneName: defaultName,
    savedSnapshot: null,
  };
}

export function captureFromStudio(state: SceneRecipeCapture, session: SceneAuthoringSession): PersistedSceneRecipeV1 {
  const normalized = normalizeSceneRecipeCapture(state);
  const id = session.activeSceneId ?? `draft-${state.pieceId}`;
  return captureSceneRecipe(normalized, id, session.sceneName.trim() || id);
}

function roundRecordNumbers(record: Record<string, number | string | boolean>): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v;
  }
  return out;
}

function recipeCompareFingerprint(recipe: PersistedSceneRecipeV1): string {
  const clone = JSON.parse(stableRecipeJson(recipe)) as PersistedSceneRecipeV1;
  clone.desired.params = roundRecordNumbers(clone.desired.params);
  return stableRecipeJson(clone);
}

export function isSceneDirty(
  session: SceneAuthoringSession,
  capture: SceneRecipeCapture,
): boolean {
  if (!session.savedSnapshot) return true;
  const current = recipeCompareFingerprint(captureFromStudio(capture, session));
  const saved = recipeCompareFingerprint(JSON.parse(session.savedSnapshot) as PersistedSceneRecipeV1);
  return current !== saved;
}

export function markSceneSaved(
  session: SceneAuthoringSession,
  recipe: PersistedSceneRecipeV1,
): SceneAuthoringSession {
  return {
    activeSceneId: recipe.id,
    sceneName: recipe.name,
    savedSnapshot: recipeCompareFingerprint(recipe),
  };
}

export function beginNewScene(session: SceneAuthoringSession, name: string): SceneAuthoringSession {
  return {
    activeSceneId: null,
    sceneName: name,
    savedSnapshot: null,
  };
}

export function applyRecipeToCapture(recipe: PersistedSceneRecipeV1): {
  capture: SceneRecipeCapture;
  session: SceneAuthoringSession;
} {
  return {
    capture: {
      mode: recipe.desired.mode,
      pieceId: recipe.desired.pieceId,
      seed: recipe.desired.seed,
      compositionId: recipe.desired.compositionId,
      params: { ...recipe.desired.params },
      color: structuredClone(recipe.desired.color),
      animationMethodId: recipe.desired.animationMethodId,
      activeAnimationMethodId: recipe.desired.activeAnimationMethodId,
      reactSensitivity: recipe.desired.reactSensitivity,
      animationSpec: structuredClone(recipe.animationSpec),
      generateFrame: recipe.generateFrame,
      meta: { ...recipe.meta },
      pflStyleId: recipe.pflStyleId,
    },
    session: markSceneSaved(
      { activeSceneId: recipe.id, sceneName: recipe.name, savedSnapshot: null },
      recipe,
    ),
  };
}
