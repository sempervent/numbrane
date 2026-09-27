/**
 * Saved Scene library — local persistence separate from Set documents.
 */

import type { SceneDef } from "../../live/types";
import {
  defaultSceneAuthoringSemantics,
  parseSceneRecipe,
  recipeFromLegacySceneDef,
  type PersistedSceneRecipeV1,
} from "./sceneRecipe";

const STORAGE_KEY = "numbrane.studio.sceneLibrary.v1";

export type SceneLibraryState = {
  version: 1;
  scenes: Record<string, PersistedSceneRecipeV1>;
  /** Most recently opened scene id (authoring convenience). */
  activeSceneId: string | null;
};

export function emptySceneLibrary(): SceneLibraryState {
  return { version: 1, scenes: {}, activeSceneId: null };
}

export function loadSceneLibrary(): SceneLibraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySceneLibrary();
    const parsed = JSON.parse(raw) as SceneLibraryState;
    if (parsed.version !== 1 || !parsed.scenes || typeof parsed.scenes !== "object") {
      return emptySceneLibrary();
    }
    const scenes: Record<string, PersistedSceneRecipeV1> = {};
    for (const [id, entry] of Object.entries(parsed.scenes)) {
      const v = parseSceneRecipe(entry);
      if (v.ok) {
        const recipe = v.recipe;
        if (!recipe.authoring) recipe.authoring = defaultSceneAuthoringSemantics();
        scenes[id] = recipe;
      }
    }
    return {
      version: 1,
      scenes,
      activeSceneId:
        parsed.activeSceneId && scenes[parsed.activeSceneId] ? parsed.activeSceneId : null,
    };
  } catch {
    return emptySceneLibrary();
  }
}

export function saveSceneLibrary(state: SceneLibraryState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function listSceneRecipes(state: SceneLibraryState): PersistedSceneRecipeV1[] {
  return Object.values(state.scenes).sort((a, b) => a.name.localeCompare(b.name));
}

export function upsertSceneRecipe(
  state: SceneLibraryState,
  recipe: PersistedSceneRecipeV1,
): SceneLibraryState {
  const next: SceneLibraryState = {
    ...state,
    scenes: { ...state.scenes, [recipe.id]: recipe },
    activeSceneId: recipe.id,
  };
  saveSceneLibrary(next);
  return next;
}

export function removeSceneRecipe(state: SceneLibraryState, id: string): SceneLibraryState {
  const scenes = { ...state.scenes };
  delete scenes[id];
  const next: SceneLibraryState = {
    ...state,
    scenes,
    activeSceneId: state.activeSceneId === id ? null : state.activeSceneId,
  };
  saveSceneLibrary(next);
  return next;
}

export function findSceneNameConflict(
  state: SceneLibraryState,
  name: string,
  exceptId?: string,
): PersistedSceneRecipeV1 | null {
  const norm = name.trim().toLowerCase();
  for (const s of Object.values(state.scenes)) {
    if (exceptId && s.id === exceptId) continue;
    if (s.name.trim().toLowerCase() === norm) return s;
  }
  return null;
}

/** Import legacy performance captured scenes once (idempotent by scene id). */
export function mergeLegacyCapturedScenes(
  state: SceneLibraryState,
  captured: SceneDef[],
): SceneLibraryState {
  let next = state;
  let changed = false;
  for (const cap of captured) {
    if (next.scenes[cap.id]) continue;
    const recipe = recipeFromLegacySceneDef(cap);
    if (!recipe) continue;
    next = {
      ...next,
      scenes: { ...next.scenes, [recipe.id]: recipe },
    };
    changed = true;
  }
  if (changed) saveSceneLibrary(next);
  return next;
}
