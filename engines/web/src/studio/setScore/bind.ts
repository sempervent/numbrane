import type { SetEdgeDef } from "../../live/types";
import type { SetScoreController } from "./controller";

export type SetScoreBindHost = {
  toast(msg: string): void;
  buildCurrentSceneDef(): Promise<import("../../live/types").SceneDef>;
  loadFixtureSet(): Promise<import("../../live/types").SetDef>;
  toggleFullscreen?(): void;
  onSetRuntimeChange(): void;
};

export function bindSetComposer(root: HTMLElement, ctrl: SetScoreController, host: SetScoreBindHost): void {
  root.querySelector("#set-name")?.addEventListener("change", (e) => {
    ctrl.setName((e.target as HTMLInputElement).value);
  });
  root.querySelector("#set-new")?.addEventListener("click", () => {
    ctrl.createNew("Untitled Set");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-save")?.addEventListener("click", () => {
    ctrl.save();
    host.toast(ctrl.validationErrors.length ? ctrl.validationErrors[0]! : "Set saved");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-dup")?.addEventListener("click", () => {
    ctrl.duplicate();
    host.toast("Set duplicated");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-load-select")?.addEventListener("change", (e) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id) {
      ctrl.loadSavedSetId(id);
      host.onSetRuntimeChange();
    }
  });
  root.querySelector("#set-load-fixture")?.addEventListener("click", () => {
    void host.loadFixtureSet().then((set) => {
      ctrl.loadFixtureJson(set);
      host.toast("Fixture loaded");
      host.onSetRuntimeChange();
    });
  });
  root.querySelector("#set-add-current")?.addEventListener("click", () => {
    void host.buildCurrentSceneDef().then((scene) => {
      ctrl.addScene(scene);
      host.onSetRuntimeChange();
    });
  });
  root.querySelector("#set-up")?.addEventListener("click", () => {
    ctrl.moveUp();
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-down")?.addEventListener("click", () => {
    ctrl.moveDown();
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-rm")?.addEventListener("click", () => {
    ctrl.removeSelected();
    host.onSetRuntimeChange();
  });
  root.querySelectorAll("[data-set-scene]").forEach((row) => {
    row.addEventListener("click", () => {
      ctrl.selectScene(Number((row as HTMLElement).dataset.setScene));
      host.onSetRuntimeChange();
    });
  });
  bindEdgeEditor(root, ctrl, host);
  root.querySelector("#set-rehearse-start")?.addEventListener("click", () => {
    void ctrl.startRehearse({ kind: "start" }).then(() => host.onSetRuntimeChange());
  });
  root.querySelector("#set-rehearse-scene")?.addEventListener("click", () => {
    const id = ctrl.getDocument().sequence[ctrl.getSelectedIndex()];
    if (id) void ctrl.startRehearse({ kind: "scene", scene_id: id }).then(() => host.onSetRuntimeChange());
  });
  root.querySelector("#set-rehearse-edge")?.addEventListener("click", () => {
    const doc = ctrl.getDocument();
    const i = ctrl.getSelectedIndex();
    const to = doc.sequence[i + 1];
    if (to) void ctrl.startRehearse({ kind: "before_transition", to_scene_id: to }).then(() => host.onSetRuntimeChange());
  });
  root.querySelector("#set-perform-enter")?.addEventListener("click", () => {
    void ctrl.startPerform().then(() => host.onSetRuntimeChange());
  });
  root.querySelector("#set-draft-apply")?.addEventListener("click", () => {
    ctrl.applyRehearsalDraft();
    host.toast("Draft applied");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-draft-discard")?.addEventListener("click", () => {
    ctrl.discardRehearsalDraft();
    host.toast("Draft discarded");
  });
  root.querySelectorAll("[data-cand-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.candAdd!;
      const scene = [...ctrl.savedCandidates(), ...ctrl.sessionCandidates()].find((s) => s.id === id);
      if (scene) {
        ctrl.addScene(scene);
        host.onSetRuntimeChange();
      }
    });
  });
  root.querySelectorAll("[data-cand-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.candSave!;
      const scene = ctrl.sessionCandidates().find((s) => s.id === id);
      if (scene) {
        ctrl.saveCandidate(scene);
        host.toast("Candidate saved");
        host.onSetRuntimeChange();
      }
    });
  });
  root.querySelectorAll("[data-cand-rm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctrl.discardCandidate((btn as HTMLElement).dataset.candRm!);
      host.onSetRuntimeChange();
    });
  });
}

function bindEdgeEditor(root: HTMLElement, ctrl: SetScoreController, host: SetScoreBindHost): void {
  const apply = (): void => {
    const idx = Number((root.querySelector("#set-edge-index") as HTMLInputElement | null)?.value);
    if (!Number.isFinite(idx)) return;
    const adv = (root.querySelector("#set-edge-adv") as HTMLSelectElement).value;
    const dwell = Number((root.querySelector("#set-edge-dwell") as HTMLInputElement).value);
    const quant = Number((root.querySelector("#set-edge-quant") as HTMLInputElement).value);
    const minDwell = Number((root.querySelector("#set-edge-min-dwell") as HTMLInputElement).value);
    const morphBars = Number((root.querySelector("#set-edge-morph-bars") as HTMLInputElement).value);
    const morphBeats = Number((root.querySelector("#set-edge-morph-beats") as HTMLInputElement).value);
    const morphSec = Number((root.querySelector("#set-edge-morph-sec") as HTMLInputElement).value);
    const patch: Partial<SetEdgeDef> = {
      advancement:
        adv === "automatic" ? { mode: "automatic", dwell_bars: dwell } : { mode: "manual" },
      launch_quantization_bars: quant,
      minimum_dwell_bars: minDwell,
      morph: {
        type: "crossfade",
        ...(morphBars > 0 ? { duration_bars: morphBars } : {}),
        ...(morphBeats > 0 ? { duration_beats: morphBeats } : {}),
        ...(morphSec > 0 ? { duration_seconds: morphSec } : {}),
      },
    };
    ctrl.updateEdge(idx, patch);
    host.onSetRuntimeChange();
  };
  for (const id of [
    "#set-edge-adv",
    "#set-edge-dwell",
    "#set-edge-quant",
    "#set-edge-min-dwell",
    "#set-edge-morph-bars",
    "#set-edge-morph-beats",
    "#set-edge-morph-sec",
  ]) {
    root.querySelector(id)?.addEventListener("change", apply);
  }
}

export function bindSetPerformChrome(root: HTMLElement, ctrl: SetScoreController, host: SetScoreBindHost): void {
  root.querySelector("#set-advance")?.addEventListener("click", () => {
    void ctrl.advance().then(() => host.onSetRuntimeChange());
  });
  root.querySelector("#set-capture")?.addEventListener("click", () => {
    const st = ctrl.status();
    const cap = ctrl.captureMorph(`Capture · ${st.activeSceneName}`);
    if (cap) {
      host.toast("Captured candidate (not in Set until saved)");
      host.onSetRuntimeChange();
    }
  });
  root.querySelector("#set-stop-runtime")?.addEventListener("click", () => {
    ctrl.stopRuntime();
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-fullscreen")?.addEventListener("click", () => {
    host.toggleFullscreen?.();
  });
}
