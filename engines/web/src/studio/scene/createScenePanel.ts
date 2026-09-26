/**
 * CREATE scene authoring chrome — primary Save / Load / Preview actions.
 */

import type { PersistedSceneRecipeV1 } from "./sceneRecipe";

export type CreateScenePanelModel = {
  sceneName: string;
  dirty: boolean;
  playing: boolean;
  pieceLabel: string;
  mode: string;
  savedScenes: PersistedSceneRecipeV1[];
  activeSceneId: string | null;
  canAddToSet: boolean;
  addToSetHint: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function renderCreateScenePanel(model: CreateScenePanelModel): string {
  const dirtyMark = model.dirty ? " *" : "";
  const loadOptions = [
    `<option value="">Load scene…</option>`,
    ...model.savedScenes.map(
      (s) =>
        `<option value="${escapeHtml(s.id)}" ${s.id === model.activeSceneId ? "selected" : ""}>${escapeHtml(s.name)}</option>`,
    ),
  ].join("");
  const addDisabled = model.canAddToSet ? "" : " disabled";
  return `
    <section class="scene-authoring" aria-label="Scene authoring">
      <h1 class="wf-title">Create</h1>
      <p class="muted scene-lede">Author a Scene · ${model.mode.toUpperCase()} · ${escapeHtml(model.pieceLabel)}</p>
      <label for="scene-name">Scene</label>
      <input id="scene-name" type="text" value="${escapeHtml(model.sceneName)}" placeholder="Scene name" />
      <p class="muted scene-dirty-hint">${dirtyMark ? "Unsaved changes" : "Saved"}</p>
      <label for="scene-load">Library</label>
      <select id="scene-load">${loadOptions}</select>
      <div class="row scene-actions">
        <button type="button" class="primary" id="scene-save">Save Scene</button>
        <button type="button" id="scene-save-as">Save As</button>
        <button type="button" id="scene-add-set"${addDisabled} title="${escapeHtml(model.addToSetHint)}">Add to Set</button>
      </div>
      <h2>Preview</h2>
      <div class="row">
        <button type="button" class="primary" id="cfg-preview-play">${model.playing ? "Pause" : "Play"}</button>
        <button type="button" id="cfg-restart-scene">Restart</button>
      </div>
      <p class="muted">Live preview uses the same runtime path as Rehearse and Perform.</p>
    </section>
    <h2>Visual</h2>
  `;
}
