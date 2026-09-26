/**
 * NUMBRANE LIVE runtime — scene/set control and frame orchestration.
 * Set navigation is owned by SetOrchestrator (queue, dwell, morph progress).
 */

import type { LivePiece, FrameState } from "./piece";
import { Transport } from "./transport";
import type { CueDef, SceneDef, SetDef, TransitionDef } from "./types";
import { resolveSetModel, sceneIndex } from "./setModel";
import {
  SetOrchestrator,
  type AdvanceResult,
  type OrchestratorTransition,
} from "./setOrchestrator";

export type TransitionState = {
  active: boolean;
  type: TransitionDef["type"];
  /** 0..1 */
  progress: number;
  fromSceneId: string | null;
  toSceneId: string | null;
  startBeat: number;
  durationBeats: number;
};

export type LiveRuntimeOptions = {
  fps?: number;
  seed?: number;
};

export class LiveRuntime {
  readonly transport = new Transport();
  readonly orchestrator = new SetOrchestrator();
  private set: SetDef | null = null;
  private pieces = new Map<string, LivePiece>();
  private fps: number;
  private seed: number;
  private frame = 0;
  private updateCount = 0;
  private blackout = false;
  /** When true, pieces still render but update() is skipped (Studio Pause). */
  private simulationPaused = false;
  private freezePieceUpdates = false;
  private midiClockHealthy = true;
  private lastOrchestratorResults: AdvanceResult[] = [];

  constructor(opts: LiveRuntimeOptions = {}) {
    this.fps = opts.fps ?? 60;
    this.seed = (opts.seed ?? 42) >>> 0;
  }

  loadSet(set: SetDef, sceneIndex = 0): void {
    this.set = set;
    this.orchestrator.loadSet(set);
    const model = resolveSetModel(set);
    const idx = Math.max(0, Math.min(sceneIndex, model.scenes.length - 1));
    const sceneId = model.scenes[idx]?.id;
    if (sceneId && idx > 0) {
      this.orchestrator.seekRehearsal({ kind: "scene", scene_id: sceneId });
    }
    this.blackout = false;
    if (set.bpm) this.transport.setBpm(set.bpm);
  }

  getSet(): SetDef | null {
    return this.set;
  }

  getScene(): SceneDef | null {
    const model = this.orchestrator.getModel();
    if (!model) return null;
    const id = this.orchestrator.getActiveSceneId();
    return model.scenes.find((s) => s.id === id) ?? null;
  }

  getSceneById(sceneId: string): SceneDef | null {
    const model = this.orchestrator.getModel();
    if (!model) return null;
    return model.scenes.find((s) => s.id === sceneId) ?? null;
  }

  getSceneIndex(): number {
    const model = this.orchestrator.getModel();
    if (!model) return 0;
    return sceneIndex(model, this.orchestrator.getActiveSceneId());
  }

  registerPiece(layerId: string, piece: LivePiece): void {
    this.pieces.set(layerId, piece);
  }

  getPiece(layerId: string): LivePiece | undefined {
    return this.pieces.get(layerId);
  }

  getPieces(): LivePiece[] {
    return [...this.pieces.values()];
  }

  clearPieces(): void {
    for (const p of this.pieces.values()) p.dispose();
    this.pieces.clear();
    this.frame = 0;
    this.updateCount = 0;
  }

  /** Atomically install prepared pieces; returns previous instances for deferred disposal. */
  replacePieces(next: Map<string, LivePiece>): LivePiece[] {
    const previous = [...this.pieces.values()];
    this.pieces = new Map(next);
    return previous;
  }

  nextScene(): AdvanceResult {
    return this.advanceSet();
  }

  prevScene(): AdvanceResult {
    const model = this.orchestrator.getModel();
    if (!model) return { action: "none" };
    const idx = this.getSceneIndex();
    if (idx <= 0) return { action: "none" };
    const dest = model.scenes[idx - 1]!.id;
    return this.orchestrator.requestAdvance(dest);
  }

  /** Legacy immediate navigation — prefer advanceSet for performance semantics. */
  gotoScene(indexOrId: number | string): AdvanceResult {
    const model = this.orchestrator.getModel();
    if (!model) return { action: "none" };
    let sceneId: string;
    if (typeof indexOrId === "string") {
      sceneId = indexOrId;
    } else {
      sceneId = model.scenes[indexOrId]?.id ?? "";
    }
    if (!sceneId) return { action: "none" };
    return this.orchestrator.requestAdvance(sceneId);
  }

  advanceSet(): AdvanceResult {
    return this.orchestrator.requestAdvance();
  }

  consumeOrchestratorResults(): AdvanceResult[] {
    const r = this.lastOrchestratorResults;
    this.lastOrchestratorResults = [];
    return r;
  }

  getOrchestratorTransition(): OrchestratorTransition | null {
    return this.orchestrator.getTransition();
  }

  setMidiClockHealthy(healthy: boolean): void {
    this.midiClockHealthy = healthy;
    this.orchestrator.setMusicalTimingHealthy(healthy);
  }

  applyCue(cue: CueDef): void {
    switch (cue.action) {
      case "next_scene":
        this.nextScene();
        break;
      case "prev_scene":
        this.prevScene();
        break;
      case "goto_scene":
        if (cue.scene_id) this.gotoScene(cue.scene_id);
        break;
      case "blackout":
        this.setBlackout(true);
        break;
      case "panic":
        this.panic();
        break;
      case "reload":
        this.orchestrator.seekRehearsal({ kind: "scene", scene_id: this.orchestrator.getActiveSceneId() });
        break;
      default:
        break;
    }
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
  }

  isBlackout(): boolean {
    return this.blackout;
  }

  setSimulationPaused(paused: boolean): void {
    this.simulationPaused = paused;
  }

  isSimulationPaused(): boolean {
    return this.simulationPaused;
  }

  setFreezePieceUpdates(frozen: boolean): void {
    this.freezePieceUpdates = frozen;
  }

  isPieceUpdatesFrozen(): boolean {
    return this.freezePieceUpdates;
  }

  panic(): void {
    this.blackout = false;
    const id = this.orchestrator.getActiveSceneId();
    if (id) this.orchestrator.seekRehearsal({ kind: "scene", scene_id: id });
  }

  getTransition(): TransitionState {
    const tr = this.orchestrator.getTransition();
    if (!tr) {
      return {
        active: false,
        type: "cut",
        progress: 1,
        fromSceneId: null,
        toSceneId: null,
        startBeat: 0,
        durationBeats: 0,
      };
    }
    return {
      active: tr.progress < 1,
      type: (tr.morphType as TransitionDef["type"]) ?? "crossfade",
      progress: tr.progress,
      fromSceneId: tr.fromSceneId,
      toSceneId: tr.toSceneId,
      startBeat: tr.startBeat,
      durationBeats: tr.durationBeats,
    };
  }

  /** Advance one frame. `wallNowMs` used only for internal transport. */
  tick(wallNowMs: number): FrameState {
    this.transport.advanceWall(wallNowMs);
    const snap = this.transport.getSnapshot();
    const musical =
      snap.source !== "midi-clock" || this.midiClockHealthy;
    this.lastOrchestratorResults = this.orchestrator.tick({
      beat: snap.beat,
      bpm: snap.bpm,
      beatsPerBar: snap.beatsPerBar,
      musicalTimingHealthy: musical,
      dtSec: 1 / this.fps,
    });

    const dt = this.simulationPaused ? 0 : 1 / this.fps;
    const frame: FrameState = {
      frame: this.frame,
      t: this.frame / this.fps,
      dt,
      fps: this.fps,
      beat: snap.beat,
      bar: snap.bar,
      beatPhase: snap.beatPhase,
      bpm: snap.bpm,
    };

    if (!this.simulationPaused && !this.freezePieceUpdates) {
      for (const piece of this.pieces.values()) {
        piece.update(frame);
      }
      this.frame += 1;
      this.updateCount += 1;
    }
    return frame;
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  getSeed(): number {
    return this.seed;
  }

  getFps(): number {
    return this.fps;
  }

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
  }

  getFrame(): number {
    return this.frame;
  }
}
