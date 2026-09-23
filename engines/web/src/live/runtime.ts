/**
 * NUMBRANE LIVE runtime — scene/set control and frame orchestration.
 * Compositor / modulation / I/O attach in later modules.
 */

import type { LivePiece, FrameState } from "./piece";
import { Transport, beatsFromTransition } from "./transport";
import type { CueDef, SceneDef, SetDef, TransitionDef } from "./types";

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
  private set: SetDef | null = null;
  private sceneIndex = 0;
  private pieces = new Map<string, LivePiece>();
  private fps: number;
  private seed: number;
  private frame = 0;
  private updateCount = 0;
  private blackout = false;
  /** When true, pieces still render but update() is skipped (Studio Pause). */
  private simulationPaused = false;
  private freezePieceUpdates = false;
  private transition: TransitionState = {
    active: false,
    type: "cut",
    progress: 1,
    fromSceneId: null,
    toSceneId: null,
    startBeat: 0,
    durationBeats: 0,
  };

  constructor(opts: LiveRuntimeOptions = {}) {
    this.fps = opts.fps ?? 60;
    this.seed = (opts.seed ?? 42) >>> 0;
  }

  loadSet(set: SetDef, sceneIndex = 0): void {
    this.set = set;
    this.sceneIndex = Math.max(0, Math.min(sceneIndex, set.scenes.length - 1));
    this.blackout = false;
    this.transition.active = false;
    if (set.bpm) this.transport.setBpm(set.bpm);
  }

  getSet(): SetDef | null {
    return this.set;
  }

  getScene(): SceneDef | null {
    if (!this.set) return null;
    return this.set.scenes[this.sceneIndex] ?? null;
  }

  getSceneIndex(): number {
    return this.sceneIndex;
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
    this.frame = 0;
    this.updateCount = 0;
    return previous;
  }

  nextScene(): void {
    if (!this.set) return;
    const next = Math.min(this.set.scenes.length - 1, this.sceneIndex + 1);
    if (next !== this.sceneIndex) this.gotoScene(next);
  }

  prevScene(): void {
    const prev = Math.max(0, this.sceneIndex - 1);
    if (prev !== this.sceneIndex) this.gotoScene(prev);
  }

  gotoScene(indexOrId: number | string): void {
    if (!this.set) return;
    let idx: number;
    if (typeof indexOrId === "string") {
      idx = this.set.scenes.findIndex((s) => s.id === indexOrId);
      if (idx < 0) return;
    } else {
      idx = Math.max(0, Math.min(this.set.scenes.length - 1, indexOrId));
    }
    if (idx === this.sceneIndex && !this.transition.active) return;

    const from = this.set.scenes[this.sceneIndex];
    const to = this.set.scenes[idx];
    if (!to) return;

    const tr: TransitionDef =
      to.transition ?? this.set.default_transition ?? { type: "crossfade", duration_beats: 2 };
    const snap = this.transport.getSnapshot();
    const durationBeats = beatsFromTransition({
      bpm: snap.bpm,
      duration_beats: tr.duration_beats,
      duration_bars: tr.duration_bars,
      duration_seconds: tr.duration_seconds,
      beatsPerBar: snap.beatsPerBar,
    });

    if (tr.type === "cut" || durationBeats <= 0) {
      this.sceneIndex = idx;
      this.transition = {
        active: false,
        type: "cut",
        progress: 1,
        fromSceneId: from?.id ?? null,
        toSceneId: to.id,
        startBeat: snap.beat,
        durationBeats: 0,
      };
      return;
    }

    this.transition = {
      active: true,
      type: tr.type,
      progress: 0,
      fromSceneId: from?.id ?? null,
      toSceneId: to.id,
      startBeat: snap.beat,
      durationBeats,
    };
    this.sceneIndex = idx;
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
        this.gotoScene(this.sceneIndex);
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

  /** Safe reset: clear blackout, stop transition, reset feedback-ish flags. */
  panic(): void {
    this.blackout = false;
    this.transition.active = false;
    this.transition.progress = 1;
  }

  getTransition(): TransitionState {
    return { ...this.transition };
  }

  /** Advance one frame. `wallNowMs` used only for internal transport. */
  tick(wallNowMs: number): FrameState {
    this.transport.advanceWall(wallNowMs);
    const snap = this.transport.getSnapshot();

    if (this.transition.active && this.transition.durationBeats > 0) {
      const p =
        (snap.beat - this.transition.startBeat) / this.transition.durationBeats;
      this.transition.progress = Math.min(1, Math.max(0, p));
      if (this.transition.progress >= 1) this.transition.active = false;
    }

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
