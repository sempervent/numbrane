import type { SetEdgeDef } from "../../live/types";
import type { SetScoreController } from "./controller";
import { edgeSummary } from "./statusView";
import {
  edgeFromTransitionForm,
  launchQuantFromBars,
  launchQuantToBars,
  readMorphDuration,
  type LaunchQuantOption,
  type MorphUnit,
} from "./transitionEdit";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function renderScoreChain(ctrl: SetScoreController): string {
  const doc = ctrl.getDocument();
  if (doc.sequence.length === 0) {
    return `<p class="wf-empty">No scenes yet. Add from Create or Open a saved Set.</p>`;
  }
  const parts: string[] = [];
  doc.sequence.forEach((id, i) => {
    const scene = doc.scene_catalog[id];
    const sceneSel = ctrl.selectionFocus !== "edge" && i === ctrl.getSelectedIndex();
    parts.push(`
      <button type="button" class="set-chain-scene${sceneSel ? " selected" : ""}" data-set-scene="${i}">
        <span class="set-chain-idx">${String(i + 1).padStart(2, "0")}</span>
        ${escapeHtml(scene?.name ?? id)}
      </button>`);
    if (i < doc.sequence.length - 1) {
      const edgeSel = ctrl.selectionFocus === "edge" && i === ctrl.getSelectedIndex();
      parts.push(`
        <button type="button" class="set-chain-edge${edgeSel ? " selected" : ""}" data-set-edge="${i}" title="Transition">
          →
        </button>`);
    }
  });
  return `<div class="set-score-chain" role="list">${parts.join("")}</div>`;
}

function renderTransitionInspector(edgeIndex: number, edge: SetEdgeDef): string {
  const auto = edge.advancement?.mode === "automatic";
  const dwell = edge.advancement?.mode === "automatic" ? edge.advancement.dwell_bars : 16;
  const quant = launchQuantFromBars(edge.launch_quantization_bars);
  const morph = readMorphDuration(edge);
  const minDwell = edge.minimum_dwell_bars ?? 1;
  const quantOptions: { id: LaunchQuantOption; label: string }[] = [
    { id: "immediate", label: "Immediate" },
    { id: "next_bar", label: "Next bar" },
    { id: "2_bars", label: "2 bars" },
    { id: "4_bars", label: "4 bars" },
    { id: "8_bars", label: "8 bars" },
  ];
  return `
    <input type="hidden" id="set-edge-index" value="${edgeIndex}" />
    <p class="wf-kicker">Transition ${edgeIndex + 1} → ${edgeIndex + 2}</p>
    <h3 class="wf-section">Advance</h3>
    <div class="wf-segment" role="group" aria-label="Advance mode">
      <button type="button" class="wf-seg${!auto ? " on" : ""}" data-edge-adv="manual">Manual</button>
      <button type="button" class="wf-seg${auto ? " on" : ""}" data-edge-adv="automatic">Automatic</button>
    </div>
    <div id="set-edge-auto-block" class="${auto ? "" : "hidden"}">
      <label>Hold scene for</label>
      <div class="wf-inline">
        <input id="set-edge-dwell" type="number" min="1" step="1" value="${dwell}" />
        <span class="wf-unit">bars</span>
      </div>
    </div>
    <h3 class="wf-section">Start transition</h3>
    <label class="sr-only" for="set-edge-quant">Quantization</label>
    <select id="set-edge-quant">
      ${quantOptions.map((o) => `<option value="${o.id}" ${quant === o.id ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>
    <h3 class="wf-section">Morph</h3>
    <label>Duration</label>
    <div class="wf-inline">
      <input id="set-edge-morph-val" type="number" min="0" step="0.5" value="${morph.value}" />
      <select id="set-edge-morph-unit">
        ${(["bars", "beats", "seconds"] as MorphUnit[]).map(
          (u) => `<option value="${u}" ${morph.unit === u ? "selected" : ""}>${u}</option>`,
        ).join("")}
      </select>
    </div>
    <details class="advanced">
      <summary>Advanced</summary>
      <label>Minimum time on destination (bars)</label>
      <input id="set-edge-min-dwell" type="number" min="0" step="1" value="${minDwell}" />
    </details>
    <p class="muted wf-summary">${edgeSummary(edge)}</p>
  `;
}

export function renderSetScoreRailHtml(ctrl: SetScoreController, devTools: boolean): string {
  const doc = ctrl.getDocument();
  const dirty = ctrl.isDocumentDirty() ? " · unsaved" : "";
  return `
    <header class="wf-header">
      <h1 class="wf-title">Set</h1>
      <p class="wf-sub">${escapeHtml(doc.name)}${dirty}</p>
    </header>
    <div class="wf-actions row">
      <button type="button" id="set-new">New</button>
      <button type="button" id="set-save" class="primary">Save</button>
    </div>
    <div class="row">
      <select id="set-load-select" aria-label="Open Set">
        <option value="">Open Set…</option>
        ${ctrl.listSavedSetIds().map((id) => `<option value="${escapeHtml(id)}" ${id === doc.set_id ? "selected" : ""}>${escapeHtml(id)}</option>`).join("")}
      </select>
      <button type="button" id="set-dup">Duplicate</button>
    </div>
    <button type="button" id="set-add-current" class="wf-block">Add current scene from Create</button>
    ${devTools ? `<button type="button" id="set-load-fixture" class="wf-dev">Load fixture (dev)</button>` : ""}
    ${ctrl.validationErrors.length ? `<p class="wf-error">${ctrl.validationErrors.map(escapeHtml).join("; ")}</p>` : ""}
    <h2 class="wf-section">Score</h2>
    ${renderScoreChain(ctrl)}
    <div class="row wf-reorder">
      <button type="button" id="set-up">Move up</button>
      <button type="button" id="set-down">Move down</button>
      <button type="button" id="set-rm">Remove</button>
    </div>
    <div class="wf-nav-links">
      <button type="button" class="primary" data-goto-workflow="rehearse" ${ctrl.hasViableSet() ? "" : "disabled"}>Rehearse this Set →</button>
    </div>
  `;
}

export function renderSetInspectorHtml(ctrl: SetScoreController): string {
  const doc = ctrl.getDocument();
  const sel = ctrl.getSelectedIndex();
  const focus = ctrl.selectionFocus;

  if (doc.sequence.length === 0) {
    return `
      <h2 class="wf-section">Overview</h2>
      <p class="muted">No Set is open. Create a new Set or open a saved one from the score rail.</p>
    `;
  }

  if (focus === "edge" && sel < doc.sequence.length - 1) {
    const edge = doc.edges?.[sel];
    if (edge) return renderTransitionInspector(sel, edge);
  }

  if (focus === "scene" || focus === "edge") {
    const id = doc.sequence[sel]!;
    const scene = doc.scene_catalog[id];
    const hasOut = sel < doc.sequence.length - 1;
    return `
      <h2 class="wf-section">Scene</h2>
      <p class="wf-scene-name">${escapeHtml(scene?.name ?? id)}</p>
      <p class="muted">Position ${sel + 1} of ${doc.sequence.length}</p>
      ${hasOut ? `<button type="button" class="wf-block" data-set-edge="${sel}">Edit transition → next</button>` : `<p class="muted">Final scene — no outgoing transition.</p>`}
      <label>Set title</label>
      <input id="set-name" type="text" value="${escapeHtml(doc.name)}" />
    `;
  }

  return `
    <h2 class="wf-section">Overview</h2>
    <label>Set title</label>
    <input id="set-name" type="text" value="${escapeHtml(doc.name)}" />
    <p class="muted">${doc.sequence.length} scenes · select a scene or → arrow to edit transitions.</p>
    <details class="advanced" id="set-candidates-panel">
      <summary>Captured scenes (${[...ctrl.savedCandidates(), ...ctrl.sessionCandidates()].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i).length})</summary>
      <div id="set-candidates">${renderCandidatesList(ctrl)}</div>
    </details>
  `;
}

function renderCandidatesList(ctrl: SetScoreController): string {
  const candidates = [...ctrl.savedCandidates(), ...ctrl.sessionCandidates()].filter(
    (c, i, a) => a.findIndex((x) => x.id === c.id) === i,
  );
  if (!candidates.length) return `<p class="muted">None — capture during Rehearse morph.</p>`;
  return candidates
    .map(
      (c) => `
    <div class="wf-cand row">
      <span>${escapeHtml(c.name)}</span>
      <button type="button" data-cand-add="${escapeHtml(c.id)}">Add</button>
      <button type="button" data-cand-save="${escapeHtml(c.id)}">Save</button>
      <button type="button" data-cand-rm="${escapeHtml(c.id)}">×</button>
    </div>`,
    )
    .join("");
}

export function renderRehearseWorkspaceHtml(ctrl: SetScoreController): string {
  const doc = ctrl.getDocument();
  const st = ctrl.status();
  const running = ctrl.surface === "rehearse";
  const viable = ctrl.hasViableSet();

  if (!viable) {
    return `
      <header class="wf-header"><h1 class="wf-title">Rehearse</h1></header>
      <p class="wf-empty">Add at least one valid scene to a Set before rehearsing.</p>
      <button type="button" class="primary wf-block" data-goto-workflow="set">Go to Set</button>
    `;
  }

  const entry = ctrl.rehearseEntry;
  return `
    <header class="wf-header">
      <h1 class="wf-title">Rehearse</h1>
      <p class="wf-sub">${escapeHtml(doc.name)}</p>
    </header>
    ${
      running
        ? `
      <div class="wf-status-card">
        <div><span class="muted">Now</span><br/><strong>${escapeHtml(st.activeSceneName)}</strong></div>
        <div><span class="muted">Next</span><br/>${escapeHtml(st.nextSceneName ?? "—")}</div>
        <div><span class="muted">Position</span><br/>${st.position} / ${st.length}</div>
        <div><span class="muted">State</span><br/>${st.phaseLabel}</div>
      </div>
      <button type="button" class="primary wf-hero" id="set-advance">Advance</button>
      ${
        st.transitioning
          ? `<button type="button" id="set-capture" class="wf-block">Capture This</button>`
          : ""
      }
      <button type="button" id="set-stop-runtime" class="wf-block">Stop rehearsal</button>
      ${
        st.draftActive
          ? `
        <p class="wf-draft">Unsaved rehearsal changes</p>
        <div class="row">
          <button type="button" id="set-draft-apply" class="primary">Apply to Set</button>
          <button type="button" id="set-draft-discard">Discard</button>
        </div>`
          : ""
      }
      `
        : `
      <label for="set-rehearse-entry">Start from</label>
      <select id="set-rehearse-entry">
        <option value="start" ${entry === "start" ? "selected" : ""}>Beginning</option>
        <option value="scene" ${entry === "scene" ? "selected" : ""}>Selected scene (in Set)</option>
        <option value="before_transition" ${entry === "before_transition" ? "selected" : ""}>Before selected transition</option>
      </select>
      <button type="button" class="primary wf-hero" id="set-rehearse-go">Rehearse</button>
      <button type="button" class="wf-block" data-goto-workflow="perform">Go to Perform →</button>
      <button type="button" class="wf-block" data-goto-workflow="set">Edit Set</button>
      `
    }
  `;
}

export function renderPerformWorkspaceHtml(ctrl: SetScoreController): string {
  const doc = ctrl.getDocument();
  const st = ctrl.status();
  const running = ctrl.surface === "perform";
  const viable = ctrl.hasViableSet();
  const timing = st.musicalTimingHealthy ? "MIDI healthy" : "MIDI fallback · internal timing";

  if (!viable) {
    return `
      <header class="wf-header"><h1 class="wf-title">Perform</h1></header>
      <p class="wf-empty">Choose a valid Set before performing.</p>
      <button type="button" class="primary wf-block" data-goto-workflow="set">Go to Set</button>
    `;
  }

  if (!running) {
    return `
      <header class="wf-header">
        <h1 class="wf-title">Perform</h1>
        <p class="wf-sub">${escapeHtml(doc.name)}</p>
      </header>
      <p class="muted">Sparse live surface — advance the score, artwork stays clean on output.</p>
      <button type="button" class="primary wf-hero" id="set-perform-enter">Enter Perform</button>
      <button type="button" class="wf-block" data-goto-workflow="rehearse">Rehearse first →</button>
    `;
  }

  return `
    <header class="wf-header">
      <h1 class="wf-title">Perform</h1>
      <p class="wf-sub">${escapeHtml(doc.name)}</p>
    </header>
    <div class="wf-status-card">
      <div><span class="muted">Now</span><br/><strong>${escapeHtml(st.activeSceneName)}</strong></div>
      <div><span class="muted">Next</span><br/>${escapeHtml(st.nextSceneName ?? "—")}</div>
      <div><span class="muted">Position</span><br/>${st.position} / ${st.length}</div>
      <div><span class="muted">State</span><br/>${st.phaseLabel}${st.transitioning ? ` · ${(st.transitionProgress * 100).toFixed(0)}%` : ""}</div>
    </div>
    <p class="muted">${timing}</p>
    <button type="button" class="primary wf-hero" id="set-advance">Advance</button>
    <div class="row">
      <button type="button" id="set-fullscreen">Output fullscreen</button>
      <button type="button" id="set-stop-runtime">Exit Perform</button>
    </div>
  `;
}

/** @internal for tests */
export { edgeFromTransitionForm, launchQuantToBars };
