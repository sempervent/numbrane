/**
 * Studio Set score — document authority, persistence, runtime wiring.
 */

import { resolveSetModel, toSetDefV2 } from "../../live/setModel";
import type { LiveSession } from "../../live/session";
import type {
  RehearsalEntry,
  SceneDef,
  SetDef,
  SetDefV2,
  SetEdgeDef,
  SetExecutionMode,
} from "../../live/types";
import {
  addCapturedScene,
  loadPersistedSets,
  savePersistedSets,
  upsertSet,
  type PersistedPerformanceSets,
} from "../setPerformance";
import {
  addSceneToSet,
  moveSceneInSet,
  removeSceneFromSet,
  validateSetV2,
} from "./edges";
import { buildSetStatusView, type SetStatusView } from "./statusView";

export type SetScoreSurface = "idle" | "composer" | "rehearse" | "perform";

export function emptySetV2(setId: string, name: string): SetDefV2 {
  return {
    protocol_version: "0.2.0",
    set_id: setId,
    name,
    scene_catalog: {},
    sequence: [],
    edges: [],
  };
}

export function newSetId(): string {
  return `studio-set-${Date.now().toString(36)}`;
}

export type SetSelectionFocus = "overview" | "scene" | "edge";

export type RehearseEntryChoice = "start" | "scene" | "before_transition";

export class SetScoreController {
  private document: SetDefV2 = emptySetV2("studio-set-draft", "Untitled Set");
  private persist: PersistedPerformanceSets = loadPersistedSets();
  private selectedIndex = 0;
  selectionFocus: SetSelectionFocus = "overview";
  rehearseEntry: RehearseEntryChoice = "start";
  surface: SetScoreSurface = "idle";
  private sessionRuntime = false;
  validationErrors: string[] = [];
  private savedDocumentJson = JSON.stringify(emptySetV2("studio-set-draft", "Untitled Set"));

  constructor(private getSession: () => LiveSession | null) {}

  getDocument(): SetDefV2 {
    return this.document;
  }

  getPersist(): PersistedPerformanceSets {
    return this.persist;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  selectScene(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(index, this.document.sequence.length - 1));
    this.selectionFocus = "scene";
  }

  selectEdge(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(index, this.document.sequence.length - 1));
    this.selectionFocus = "edge";
  }

  selectOverview(): void {
    this.selectionFocus = "overview";
  }

  isDocumentDirty(): boolean {
    return JSON.stringify(this.document) !== this.savedDocumentJson;
  }

  hasViableSet(): boolean {
    this.refreshValidation();
    return this.document.sequence.length > 0 && this.validationErrors.length === 0;
  }

  resolveRehearsalEntry(): RehearsalEntry {
    if (this.rehearseEntry === "start") return { kind: "start" };
    if (this.rehearseEntry === "scene") {
      const id = this.document.sequence[this.selectedIndex];
      if (id) return { kind: "scene", scene_id: id };
      return { kind: "start" };
    }
    const to = this.document.sequence[this.selectedIndex + 1];
    if (to) return { kind: "before_transition", to_scene_id: to };
    return { kind: "start" };
  }

  private markSavedSnapshot(): void {
    this.savedDocumentJson = JSON.stringify(this.document);
  }

  status(): SetStatusView {
    const session = this.getSession();
    const mode: SetExecutionMode | "idle" = this.sessionRuntime
      ? (session?.getSetExecutionMode() ?? "perform")
      : "idle";
    const draft =
      this.surface === "rehearse" &&
      Boolean(session?.runtime.orchestrator.getModel()?.setId !== this.document.set_id);
    return buildSetStatusView(session, this.document, mode, draft);
  }

  refreshValidation(): void {
    this.validationErrors = validateSetV2(this.document);
  }

  loadPersisted(): void {
    this.persist = loadPersistedSets();
    const id = this.persist.activeSetId;
    if (id && this.persist.sets[id]) {
      this.loadDocument(this.persist.sets[id]!);
    }
  }

  loadDocument(set: SetDef): void {
    const model = resolveSetModel(set);
    this.document = toSetDefV2(model);
    this.selectedIndex = 0;
    this.selectionFocus = "overview";
    this.refreshValidation();
    this.markSavedSnapshot();
  }

  loadFixtureJson(set: SetDef): void {
    this.loadDocument(set);
    this.persist = upsertSet(this.persist, this.document);
    this.persist.activeSetId = this.document.set_id;
    savePersistedSets(this.persist);
  }

  createNew(name: string): void {
    this.document = emptySetV2(newSetId(), name);
    this.selectedIndex = 0;
    this.selectionFocus = "overview";
    this.refreshValidation();
    this.markSavedSnapshot();
  }

  save(): void {
    this.refreshValidation();
    if (this.validationErrors.length) return;
    this.persist = upsertSet(this.persist, this.document);
    this.persist.activeSetId = this.document.set_id;
    savePersistedSets(this.persist);
    this.markSavedSnapshot();
  }

  duplicate(): void {
    const copy: SetDefV2 = {
      ...JSON.parse(JSON.stringify(this.document)),
      set_id: newSetId(),
      name: `${this.document.name} (copy)`,
    };
    this.document = copy;
    this.persist = upsertSet(this.persist, this.document);
    this.persist.activeSetId = copy.set_id;
    savePersistedSets(this.persist);
    this.markSavedSnapshot();
  }

  setName(name: string): void {
    this.document = { ...this.document, name };
  }

  addScene(scene: SceneDef): void {
    this.document = addSceneToSet(this.document, scene);
    this.selectedIndex = this.document.sequence.length - 1;
    this.refreshValidation();
  }

  removeSelected(): void {
    this.document = removeSceneFromSet(this.document, this.selectedIndex);
    this.selectedIndex = Math.min(this.selectedIndex, this.document.sequence.length - 1);
    this.refreshValidation();
  }

  moveUp(): void {
    if (this.selectedIndex <= 0) return;
    this.document = moveSceneInSet(this.document, this.selectedIndex, this.selectedIndex - 1);
    this.selectedIndex -= 1;
    this.refreshValidation();
  }

  moveDown(): void {
    if (this.selectedIndex >= this.document.sequence.length - 1) return;
    this.document = moveSceneInSet(this.document, this.selectedIndex, this.selectedIndex + 1);
    this.selectedIndex += 1;
    this.refreshValidation();
  }

  updateEdge(index: number, patch: Partial<SetEdgeDef>): void {
    const edges = [...(this.document.edges ?? [])];
    const base = edges[index] ?? {
      to_scene_id: this.document.sequence[index + 1] ?? "",
      advancement: { mode: "manual" as const },
    };
    edges[index] = { ...base, ...patch };
    this.document = { ...this.document, edges };
    this.refreshValidation();
  }

  listSavedSetIds(): string[] {
    return Object.keys(this.persist.sets);
  }

  loadSavedSetId(id: string): void {
    const s = this.persist.sets[id];
    if (s) {
      this.loadDocument(s);
      this.persist.activeSetId = id;
      savePersistedSets(this.persist);
    }
  }

  savedCandidates(): SceneDef[] {
    return [...this.persist.capturedScenes];
  }

  sessionCandidates(): SceneDef[] {
    return this.getSession()?.getCapturedSceneCandidates() ?? [];
  }

  saveCandidate(scene: SceneDef): void {
    this.persist = addCapturedScene(this.persist, scene);
  }

  discardCandidate(id: string): void {
    this.persist = {
      ...this.persist,
      capturedScenes: this.persist.capturedScenes.filter((s) => s.id !== id),
    };
    savePersistedSets(this.persist);
  }

  renameCandidate(id: string, name: string): void {
    this.persist = {
      ...this.persist,
      capturedScenes: this.persist.capturedScenes.map((s) =>
        s.id === id ? { ...s, name } : s,
      ),
    };
    savePersistedSets(this.persist);
  }

  async startRehearseFromUi(): Promise<void> {
    await this.startRehearse(this.resolveRehearsalEntry());
  }

  async startRehearse(entry: RehearsalEntry): Promise<void> {
    const session = this.getSession();
    if (!session) return;
    this.refreshValidation();
    if (this.validationErrors.length) return;
    this.surface = "rehearse";
    this.sessionRuntime = true;
    session.setSetExecutionMode("rehearse");
    session.runtime.orchestrator.setRehearsalDraft(null);
    await session.loadSet(this.document);
    await session.seekRehearsal(entry);
    session.runtime.transport.start();
    session.startLoop();
  }

  async startPerform(): Promise<void> {
    const session = this.getSession();
    if (!session) return;
    this.refreshValidation();
    if (this.validationErrors.length) return;
    this.surface = "perform";
    this.sessionRuntime = true;
    session.setSetExecutionMode("perform");
    session.runtime.orchestrator.setRehearsalDraft(null);
    await session.loadSet(this.document);
    session.runtime.transport.start();
    session.startLoop();
  }

  stopRuntime(): void {
    this.surface = "idle";
    this.sessionRuntime = false;
    const session = this.getSession();
    session?.runtime.orchestrator.setRehearsalDraft(null);
  }

  async advance(): Promise<void> {
    await this.getSession()?.advanceSet();
  }

  captureMorph(defaultName: string): SceneDef | null {
    const session = this.getSession();
    if (!session) return null;
    const id = `capture-${Date.now().toString(36)}`;
    return session.captureMorphScene(defaultName, id);
  }

  applyRehearsalDraft(): void {
    const session = this.getSession();
    if (!session) return;
    const applied = session.runtime.orchestrator.applyRehearsalDraft();
    if (applied) {
      this.loadDocument(applied);
      this.save();
    }
  }

  discardRehearsalDraft(): void {
    this.getSession()?.runtime.orchestrator.setRehearsalDraft(null);
  }

  injectSimulatedMidiLoss(lost: boolean): void {
    this.getSession()?.runtime.setMidiClockHealthy(!lost);
  }
}
