import type { SetDefV2, SetEdgeDef } from "../../live/types";
import { edgeSummary } from "./statusView";
import type { SetScoreController } from "./controller";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function renderSetComposerHtml(ctrl: SetScoreController): string {
  const doc = ctrl.getDocument();
  const sel = ctrl.getSelectedIndex();
  const errors = ctrl.validationErrors;
  const savedIds = ctrl.listSavedSetIds();
  const candidates = [...ctrl.savedCandidates(), ...ctrl.sessionCandidates()];
  const uniqueCandidates = candidates.filter(
    (c, i, a) => a.findIndex((x) => x.id === c.id) === i,
  );

  const rows = doc.sequence
    .map((id, i) => {
      const scene = doc.scene_catalog[id];
      const edge = doc.edges?.[i];
      const arrow = i < doc.sequence.length - 1 ? " →" : "";
      const selected = i === sel ? " set-scene-selected" : "";
      return `
        <div class="set-scene-row${selected}" data-set-scene="${i}">
          <span class="muted">${String(i + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(scene?.name ?? id)}</strong>${arrow}
          <div class="muted" style="font-size:10px">${edge ? edgeSummary(edge) : "end"}</div>
        </div>`;
    })
    .join("");

  const edgeIndex = sel;
  const edge: SetEdgeDef | undefined = doc.edges?.[edgeIndex];
  const edgeEditor =
    sel < doc.sequence.length - 1 && edge
      ? renderEdgeEditor(edgeIndex, edge)
      : `<p class="muted">Select a scene with an outgoing transition to edit edge ${sel + 1} → ${sel + 2}.</p>`;

  return `
    <details id="set-score-panel" open>
      <summary><h2 style="display:inline">Visual Set</h2></summary>
      <p class="muted">Ordered score · edges own transitions · save before perform</p>
      ${errors.length ? `<p style="color:#f87171">${errors.map(escapeHtml).join("; ")}</p>` : ""}
      <label>Set name</label>
      <input id="set-name" type="text" value="${escapeHtml(doc.name)}" />
      <div class="row">
        <select id="set-load-select">
          <option value="">Load saved…</option>
          ${savedIds.map((id) => `<option value="${escapeHtml(id)}" ${id === doc.set_id ? "selected" : ""}>${escapeHtml(id)}</option>`).join("")}
        </select>
        <button type="button" id="set-new">New</button>
        <button type="button" id="set-save">Save</button>
        <button type="button" id="set-dup">Duplicate</button>
      </div>
      <div class="row">
        <button type="button" id="set-load-fixture">Load fixture</button>
        <button type="button" id="set-add-current">Add current scene</button>
      </div>
      <h3 style="font-size:11px;color:var(--mute)">Sequence</h3>
      <div id="set-sequence">${rows || `<p class="muted">Empty — add scenes</p>`}</div>
      <div class="row">
        <button type="button" id="set-up" ${sel <= 0 ? "disabled" : ""}>Move up</button>
        <button type="button" id="set-down" ${sel >= doc.sequence.length - 1 ? "disabled" : ""}>Move down</button>
        <button type="button" id="set-rm">Remove</button>
      </div>
      <h3 style="font-size:11px;color:var(--mute)">Transition</h3>
      ${edgeEditor}
      <h3 style="font-size:11px;color:var(--mute)">Rehearse</h3>
      <div class="row">
        <button type="button" class="primary" id="set-rehearse-start">From start</button>
        <button type="button" id="set-rehearse-scene">From scene</button>
        <button type="button" id="set-rehearse-edge">Before next transition</button>
      </div>
      <div class="row">
        <button type="button" id="set-draft-apply">Apply draft</button>
        <button type="button" id="set-draft-discard">Discard draft</button>
      </div>
      <h3 style="font-size:11px;color:var(--mute)">Perform</h3>
      <button type="button" class="primary" id="set-perform-enter">Enter Perform</button>
      <h3 style="font-size:11px;color:var(--mute)">Captured candidates</h3>
      <div id="set-candidates">
        ${uniqueCandidates
          .map(
            (c) => `
          <div class="row" style="margin:0.25rem 0">
            <span>${escapeHtml(c.name)}</span>
            <button type="button" data-cand-add="${escapeHtml(c.id)}">Add to Set</button>
            <button type="button" data-cand-save="${escapeHtml(c.id)}">Save</button>
            <button type="button" data-cand-rm="${escapeHtml(c.id)}">×</button>
          </div>`,
          )
          .join("") || `<p class="muted">None yet — Capture during morph</p>`}
      </div>
    </details>`;
}

function renderEdgeEditor(index: number, edge: SetEdgeDef): string {
  const auto = edge.advancement?.mode === "automatic";
  const dwell = edge.advancement?.mode === "automatic" ? edge.advancement.dwell_bars : 8;
  const quant = edge.launch_quantization_bars ?? 0;
  const minDwell = edge.minimum_dwell_bars ?? 1;
  const morphBars = edge.morph?.duration_bars ?? "";
  const morphBeats = edge.morph?.duration_beats ?? "";
  const morphSec = edge.morph?.duration_seconds ?? "";
  return `
    <input type="hidden" id="set-edge-index" value="${index}" />
    <label>Advancement</label>
    <select id="set-edge-adv">
      <option value="manual" ${!auto ? "selected" : ""}>Manual</option>
      <option value="automatic" ${auto ? "selected" : ""}>Automatic</option>
    </select>
    <label>Dwell (bars, automatic)</label>
    <input id="set-edge-dwell" type="number" min="0" step="1" value="${dwell}" />
    <label>Launch quantization (bars, 0=immediate)</label>
    <input id="set-edge-quant" type="number" min="0" step="1" value="${quant}" />
    <label>Minimum destination dwell (bars)</label>
    <input id="set-edge-min-dwell" type="number" min="0" step="1" value="${minDwell}" />
    <label>Morph duration (bars)</label>
    <input id="set-edge-morph-bars" type="number" min="0" step="1" value="${morphBars}" />
    <label>Morph duration (beats)</label>
    <input id="set-edge-morph-beats" type="number" min="0" step="0.5" value="${morphBeats}" />
    <label>Morph duration (seconds, free-time)</label>
    <input id="set-edge-morph-sec" type="number" min="0" step="0.1" value="${morphSec}" />
    <p class="muted">${edgeSummary(edge)}</p>
  `;
}

export function renderSetPerformChromeHtml(ctrl: SetScoreController): string {
  const st = ctrl.status();
  const prog =
    st.transitioning && st.transitionTo
      ? ` · morph ${(st.transitionProgress * 100).toFixed(0)}%`
      : "";
  const auto =
    st.autoAdvanceAtBeat != null
      ? ` · auto @ beat ${st.autoAdvanceAtBeat.toFixed(1)}`
      : "";
  const midi = st.musicalTimingHealthy ? "MIDI OK" : "MIDI fallback";
  return `
    <div id="set-perform-inner">
      <strong>${escapeHtml(st.setName)}</strong>
      <span>${st.position} / ${st.length}</span>
      <span>${st.phaseLabel}${prog}</span>
      <span>Now: ${escapeHtml(st.activeSceneName)}</span>
      <span>Next: ${escapeHtml(st.nextSceneName ?? "—")}</span>
      ${st.queuedSceneName ? `<span>Queued: ${escapeHtml(st.queuedSceneName)}</span>` : ""}
      <span class="muted">${midi} · ${st.transportSource}</span>
      <button type="button" class="primary" id="set-advance">Advance</button>
      <button type="button" id="set-capture">Capture This</button>
      <button type="button" id="set-stop-runtime">Stop</button>
      <button type="button" id="set-fullscreen" title="Artwork-only full screen (Tab hides chrome)">Output</button>
      ${st.draftActive ? `<span class="muted">Rehearsal draft</span>` : ""}
      <span class="muted">${auto}</span>
    </div>`;
}
