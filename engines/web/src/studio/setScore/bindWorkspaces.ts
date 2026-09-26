import type { RehearseEntryChoice } from "./controller";
import type { SetScoreController } from "./controller";
import type { SetScoreBindHost } from "./bind";
import {
  edgeFromTransitionForm,
  type LaunchQuantOption,
  type MorphUnit,
} from "./transitionEdit";

export type WorkflowBindHost = SetScoreBindHost & {
  gotoWorkflow(workflow: "create" | "set" | "rehearse" | "perform"): void;
  onRehearseStarted?(): void;
  onPerformStarted?(): void;
};

function bindSetActions(root: ParentNode, ctrl: SetScoreController, host: WorkflowBindHost): void {
  root.querySelector("#set-name")?.addEventListener("change", (e) => {
    ctrl.setName((e.target as HTMLInputElement).value);
    host.onSetRuntimeChange();
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
  root.querySelectorAll("[data-set-scene]").forEach((el) => {
    el.addEventListener("click", () => {
      ctrl.selectScene(Number((el as HTMLElement).dataset.setScene));
      host.onSetRuntimeChange();
    });
  });
  root.querySelectorAll("[data-set-edge]").forEach((el) => {
    el.addEventListener("click", () => {
      ctrl.selectEdge(Number((el as HTMLElement).dataset.setEdge));
      host.onSetRuntimeChange();
    });
  });
  root.querySelectorAll("[data-goto-workflow]").forEach((el) => {
    el.addEventListener("click", () => {
      const w = (el as HTMLElement).dataset.gotoWorkflow as "set" | "rehearse" | "perform";
      host.gotoWorkflow(w);
    });
  });
  bindCandidates(root, ctrl, host);
}

function bindCandidates(root: ParentNode, ctrl: SetScoreController, host: SetScoreBindHost): void {
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

function bindEdgeInspector(root: ParentNode, ctrl: SetScoreController, host: SetScoreBindHost): void {
  const apply = (): void => {
    const idx = Number((root.querySelector("#set-edge-index") as HTMLInputElement | null)?.value);
    if (!Number.isFinite(idx)) return;
    const autoBlock = root.querySelector("#set-edge-auto-block");
    const autoOn = !autoBlock?.classList.contains("hidden");
    const dwell = Number((root.querySelector("#set-edge-dwell") as HTMLInputElement | null)?.value ?? 16);
    const quant = (root.querySelector("#set-edge-quant") as HTMLSelectElement).value as LaunchQuantOption;
    const morphVal = Number((root.querySelector("#set-edge-morph-val") as HTMLInputElement).value);
    const morphUnit = (root.querySelector("#set-edge-morph-unit") as HTMLSelectElement).value as MorphUnit;
    const minDwell = Number((root.querySelector("#set-edge-min-dwell") as HTMLInputElement | null)?.value ?? 1);
    ctrl.updateEdge(
      idx,
      edgeFromTransitionForm({
        automatic: autoOn,
        dwellBars: dwell,
        quant,
        morphValue: morphVal,
        morphUnit,
        minDwellBars: minDwell,
      }),
    );
    host.onSetRuntimeChange();
  };

  root.querySelectorAll("[data-edge-adv]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = (btn as HTMLElement).dataset.edgeAdv;
      const block = root.querySelector("#set-edge-auto-block");
      root.querySelectorAll("[data-edge-adv]").forEach((b) => b.classList.toggle("on", b === btn));
      if (mode === "automatic") block?.classList.remove("hidden");
      else block?.classList.add("hidden");
      apply();
    });
  });

  for (const sel of ["#set-edge-dwell", "#set-edge-quant", "#set-edge-morph-val", "#set-edge-morph-unit", "#set-edge-min-dwell"]) {
    root.querySelector(sel)?.addEventListener("change", apply);
  }
}

function bindRuntimeControls(root: ParentNode, ctrl: SetScoreController, host: WorkflowBindHost): void {
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
  root.querySelector("#set-draft-apply")?.addEventListener("click", () => {
    ctrl.applyRehearsalDraft();
    host.toast("Draft applied to Set");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-draft-discard")?.addEventListener("click", () => {
    ctrl.discardRehearsalDraft();
    host.toast("Draft discarded");
    host.onSetRuntimeChange();
  });
  root.querySelector("#set-perform-enter")?.addEventListener("click", () => {
    void ctrl.startPerform().then(() => {
      host.onPerformStarted?.();
      host.onSetRuntimeChange();
    });
  });
  root.querySelector("#set-rehearse-go")?.addEventListener("click", () => {
    void ctrl.startRehearseFromUi().then(() => {
      host.onRehearseStarted?.();
      host.onSetRuntimeChange();
    });
  });
  root.querySelector("#set-rehearse-entry")?.addEventListener("change", (e) => {
    ctrl.rehearseEntry = (e.target as HTMLSelectElement).value as RehearseEntryChoice;
  });
}

export function bindSetWorkspacePanels(
  rail: HTMLElement,
  inspector: HTMLElement,
  ctrl: SetScoreController,
  host: WorkflowBindHost,
): void {
  bindSetActions(rail, ctrl, host);
  bindSetActions(inspector, ctrl, host);
  bindEdgeInspector(inspector, ctrl, host);
}

export function bindRehearsePanel(root: HTMLElement, ctrl: SetScoreController, host: WorkflowBindHost): void {
  bindSetActions(root, ctrl, host);
  bindRuntimeControls(root, ctrl, host);
}

export function bindPerformPanel(root: HTMLElement, ctrl: SetScoreController, host: WorkflowBindHost): void {
  bindSetActions(root, ctrl, host);
  bindRuntimeControls(root, ctrl, host);
}
