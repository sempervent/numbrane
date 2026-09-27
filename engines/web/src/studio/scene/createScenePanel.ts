/**
 * CREATE scene authoring chrome — primary Save / Load / Preview actions.
 */

import type { BehaviorPresetId } from "./behaviorPresets";
import type { CreativeMacroId, CreativeMacroValues } from "./creativeMacros";
import type { PersistedSceneRecipeV1 } from "./sceneRecipe";

export type BehaviorOption = {
  id: BehaviorPresetId;
  label: string;
  description?: string;
  disabled: boolean;
  reason?: string;
  selected: boolean;
};

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
  behaviorAvailable: BehaviorOption[];
  behaviorUnavailable: BehaviorOption[];
  macros: CreativeMacroValues;
  showCreativeControls: boolean;
};

const MACRO_LABELS: Record<CreativeMacroId, string> = {
  energy: "Energy",
  density: "Density",
  motion: "Motion",
  chaos: "Chaos",
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
      ${
        model.showCreativeControls
          ? `
      <h2>Behavior</h2>
      <label for="scene-behavior">Autonomous behavior</label>
      <select id="scene-behavior">
        <option value="">(piece default)</option>
        ${[...model.behaviorAvailable, ...model.behaviorUnavailable]
          .map(
            (b) =>
              `<option value="${b.id}" ${b.disabled ? "disabled" : ""} ${b.selected ? "selected" : ""} title="${escapeHtml(b.reason ?? b.description ?? b.label)}">${escapeHtml(b.label)}${b.disabled ? " (unavailable)" : ""}</option>`,
          )
          .join("")}
      </select>
      ${
        model.behaviorAvailable.find((b) => b.selected)?.description
          ? `<p class="muted behavior-hint">${escapeHtml(model.behaviorAvailable.find((b) => b.selected)?.description ?? "")}</p>`
          : ""
      }
      ${
        model.behaviorUnavailable.length
          ? `<details class="behavior-compat"><summary>Unavailable behaviors (${model.behaviorUnavailable.length})</summary><ul>${model.behaviorUnavailable
              .map(
                (b) =>
                  `<li><strong>${escapeHtml(b.label)}</strong> — ${escapeHtml(b.reason ?? "unsupported")}</li>`,
              )
              .join("")}</ul></details>`
          : ""
      }
      <h2>Creative controls</h2>
      ${(Object.keys(MACRO_LABELS) as CreativeMacroId[])
        .map(
          (id) => `
        <label for="scene-macro-${id}">${MACRO_LABELS[id]} ${Math.round(model.macros[id] * 100)}%</label>
        <input id="scene-macro-${id}" type="range" min="0" max="1" step="0.01" value="${model.macros[id].toFixed(2)}" data-macro="${id}" />`,
        )
        .join("")}
      <div class="row">
        <button type="button" id="scene-variation">Randomize variation</button>
      </div>
      <p class="muted">Variation changes seed and subtle params; Save to keep a version.</p>
      `
          : ""
      }
    </section>
    <h2>Visual</h2>
  `;
}
