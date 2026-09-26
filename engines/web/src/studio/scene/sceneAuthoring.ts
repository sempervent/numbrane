/**
 * Scene authoring — dirty tracking and apply recipe to Studio capture shape.
 */

import {
  captureSceneRecipe,
  stableRecipeJson,
  type PersistedSceneRecipeV1,
  type SceneRecipeCapture,
} from "./sceneRecipe";

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
  const id = session.activeSceneId ?? `draft-${state.pieceId}`;
  return captureSceneRecipe(state, id, session.sceneName.trim() || id);
}

export function isSceneDirty(
  session: SceneAuthoringSession,
  capture: SceneRecipeCapture,
): boolean {
  if (!session.savedSnapshot) return true;
  const current = stableRecipeJson(captureFromStudio(capture, session));
  return current !== session.savedSnapshot;
}

export function markSceneSaved(
  session: SceneAuthoringSession,
  recipe: PersistedSceneRecipeV1,
): SceneAuthoringSession {
  return {
    activeSceneId: recipe.id,
    sceneName: recipe.name,
    savedSnapshot: stableRecipeJson(recipe),
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
