/**
 * NUMBRANE LIVE session — wires transport, audio, MIDI, modulation, compositor.
 */

import { LiveRuntime } from "./runtime";
import { Compositor } from "./compositor";
import { createLivePiece, UnsupportedLivePieceError } from "./pieces/registry";
import { LIVE_PIECE_IDS } from "./pieces/pieceModes";
import { LiveAudioInput } from "./inputs/audioInput";
import {
  emptyFeatures,
  type AudioFeatures,
} from "./inputs/audioAnalysis";
import { MidiInputManager, MidiMapper, type MidiMessage } from "./inputs/midi";
import {
  EnvelopeBank,
  LfoBank,
  ModulationMatrix,
  type ModMapping,
} from "./modulation";
import {
  PerformanceRecorder,
  PerformanceReplayer,
  type PerformanceRecording,
  type PerfEvent,
} from "./recording/performance";
import type {
  BlendMode,
  PostDef,
  QualityProfile,
  ResolutionPreset,
  SceneDef,
  SetDef,
} from "./types";
import { parseResolution } from "./types";
import type { FrameState } from "./piece";
import {
  analyzeRgbaGrid,
  downsampleRgba,
  luminanceAt,
  type PixelFrame,
} from "./pixelMetrics";
import { AnimationRuntime } from "./animationRuntime";
import { FramePacingRing, type FramePacingSnapshot } from "./framePacing";
import type { AnimationSpec } from "../studio/animation/spec";
import { defaultAnimationSpec, hasComponent } from "../studio/animation/spec";
import { normalizeSpecForLivePerformance } from "../studio/animation/performance";
import {
  VisualLivenessWatchdog,
  type VisualLivenessSnapshot,
} from "./visualLiveness";
import { morphScenes } from "./sceneMorph";
import { captureSceneCandidate, type CaptureContext } from "./sceneCapture";
import { orderedScenes, resolveSetModel, singleSceneSet } from "./setModel";
import type { AdvanceResult } from "./setOrchestrator";
import type { RehearsalEntry, SetExecutionMode } from "./types";

export type HudStats = {
  fps: number;
  frameMs: number;
  glMs: number;
  audioMs: number;
  layers: number;
  quality: QualityProfile;
};

export type LiveDiagnostics = {
  rafCount: number;
  rafHz: number;
  rafLastTimestamp: number;
  tickCount: number;
  updateCount: number;
  renderCount: number;
  presentCount: number;
  logicalFrame: number;
  canvasWidth: number;
  canvasHeight: number;
  visibleCssWidth: number;
  visibleCssHeight: number;
  lastSuccessfulDrawMs: number;
  pixelDigest: string;
  presentedFrame: PixelFrame | null;
  webglError: string | null;
  simulationPaused: boolean;
  transportPlaying: boolean;
  visualFps: number;
  rafStalled: boolean;
  activeLayerCount: number;
  quality: QualityProfile;
  framePacing: FramePacingSnapshot;
  lastUpdateMs: number;
  lastRenderMs: number;
  lastAudioMs: number;
  liveSessionCount: 1;
  visualLiveness: VisualLivenessSnapshot;
  animationPhase: number;
  performanceMode: boolean;
};

const QUALITY_SCALE: Record<QualityProfile, number> = {
  low: 0.5,
  medium: 0.75,
  high: 1,
  ultra: 1.25,
};

export type LiveSessionOptions = {
  canvas: HTMLCanvasElement;
  seed?: number;
  fps?: number;
  outputOnly?: boolean;
  transparent?: boolean;
  /** Match compositor backing store to visible stage (Studio performance capture). */
  stageViewportFit?: boolean;
};

export type SetAnimationSpecOptions = {
  /** Keep monotonic performance clock when adjusting export/speed metadata. */
  preserveTime?: boolean;
  performanceMode?: boolean;
};

/** Scene load superseded by a newer request — not an operator-visible failure. */
export class StaleSceneLoadError extends Error {
  constructor() {
    super("stale scene load");
    this.name = "StaleSceneLoadError";
  }
}

type PreparedScene = {
  pieces: Map<string, import("./piece").LivePiece>;
  baseParams: Map<string, Record<string, number>>;
  layerOpacity: Map<string, number>;
  layerBlend: Map<string, BlendMode>;
  layerEnabled: Map<string, boolean>;
  layerRenderOrder: string[];
  basePost: PostDef;
  w: number;
  h: number;
  mappings: ModMapping[];
};

export type LiveSessionTimingDiagnostics = {
  lastScenePrepareMs: number;
  lastSceneCommitMs: number;
  longestMainThreadBlockMs: number;
  recentLongTaskCount: number;
  lastPieceUpdateMs: number;
  lastPieceRenderMs: number;
  lastReadPixelsMs: number;
  loadGeneration: number;
  digestSampleIntervalMs: number;
};

export class LiveSession {
  readonly runtime: LiveRuntime;
  readonly audio = new LiveAudioInput();
  readonly midi = new MidiInputManager();
  readonly midiMapper = new MidiMapper();
  readonly modulation = new ModulationMatrix();
  readonly lfos = new LfoBank();
  readonly envelopes = new EnvelopeBank();
  readonly recorder = new PerformanceRecorder();
  private compositor: Compositor;
  private canvas: HTMLCanvasElement;
  private features: AudioFeatures = emptyFeatures();
  private lastOnset = false;
  private quality: QualityProfile = "high";
  private resolution: ResolutionPreset = "1920x1080";
  private stageViewportFit = false;
  private resizeObserver: ResizeObserver | null = null;
  private raf = 0;
  private running = false;
  private hud: HudStats = {
    fps: 0,
    frameMs: 0,
    glMs: 0,
    audioMs: 0,
    layers: 0,
    quality: "high",
  };
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsLast = 0;
  private renderCount = 0;
  private presentCount = 0;
  private tickCount = 0;
  private rafCount = 0;
  private rafLastTimestamp = 0;
  private rafProgressMs = 0;
  private rafHz = 0;
  private rafHzFrames = 0;
  private rafHzLast = 0;
  private lastSuccessfulDrawMs = 0;
  private pixelDigest = "";
  private lastPresentedGrid: Uint8Array | null = null;
  private lastPresentedStats: PixelFrame | null = null;
  private baselinePresentedGrid: Uint8Array | null = null;
  private baselinePresentedStats: PixelFrame | null = null;
  private webglError: string | null = null;
  private lastDigestSampleMs = 0;
  private frozenPresentT = 0;
  /** Wall-clock delta source for animation envelope (preview/export seek uses explicit time). */
  private lastAnimWallMs = 0;
  readonly animationRuntime = new AnimationRuntime(defaultAnimationSpec());
  private baseParams = new Map<string, Record<string, number>>();
  private basePost: PostDef = {};
  private layerOpacity = new Map<string, number>();
  private layerBlend = new Map<string, BlendMode>();
  private layerEnabled = new Map<string, boolean>();
  private layerRenderOrder: string[] = [];
  private overlayAnimationRuntimes = new Map<string, AnimationRuntime>();
  private readonly visualLiveness = new VisualLivenessWatchdog();
  private sessionStartedPerfMs = performance.now();
  private readonly framePacing = new FramePacingRing(360);
  private lastUpdateMs = 0;
  private replayer: PerformanceReplayer | null = null;
  private midiCcSources = new Map<string, number>();
  private lastMidiClockMs: number | null = null;
  private postFrame: PostDef = {};
  outputOnly: boolean;
  showHud = true;
  onHud: ((h: HudStats) => void) | null = null;
  onStatus: ((s: Record<string, unknown>) => void) | null = null;
  private loadGeneration = 0;
  private digestSampleIntervalMs = 250;
  private lastScenePrepareMs = 0;
  private lastSceneCommitMs = 0;
  private longestMainThreadBlockMs = 0;
  private recentLongTaskCount = 0;
  private lastReadPixelsMs = 0;
  private morphToPrepared: PreparedScene | null = null;
  private morphToPieces = new Map<string, import("./piece").LivePiece>();
  private morphFromSceneId: string | null = null;
  private setPerformanceMode: SetExecutionMode = "perform";
  private capturedCandidates: SceneDef[] = [];
  private midiClockMissCount = 0;

  constructor(opts: LiveSessionOptions) {
    this.canvas = opts.canvas;
    this.stageViewportFit = opts.stageViewportFit ?? false;
    this.compositor = new Compositor(opts.canvas);
    this.compositor.transparent = opts.transparent ?? false;
    this.runtime = new LiveRuntime({ seed: opts.seed, fps: opts.fps });
    this.outputOnly = opts.outputOnly ?? false;
    this.lfos.setDefs([
      { id: "lfo.slow", wave: "sine", rateBars: 4, sync: "bars", seed: 1 },
      { id: "lfo.beat", wave: "triangle", rateBeats: 1, sync: "beats", seed: 2 },
      { id: "lfo.sh", wave: "sample_hold", rateBeats: 2, sync: "beats", seed: 3 },
    ]);
    this.envelopes.setDefs([
      { id: "env.flash", kind: "pulse", attack: 0.01, decay: 0.18 },
      { id: "env.snare", kind: "ad", attack: 0.005, decay: 0.25 },
      { id: "env.adsr", kind: "adsr", attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.4 },
    ]);
  }

  async init(): Promise<void> {
    await this.compositor.init();
    if (this.stageViewportFit) {
      this.fitStageViewport();
      this.resizeObserver = new ResizeObserver(() => this.fitStageViewport());
      this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    } else {
      this.applyResolution(this.resolution);
    }
    this.audio.onStatusChange = () => this.emitStatus();
    // MIDI is optional — do not request access on startup.
    this.emitStatus({
      midiOk: false,
      midiEnabled: false,
      audioStatus: this.audio.statusMessage,
    });
  }

  /** Optional Web MIDI enable (never required for performance). */
  async enableMidi(): Promise<{ ok: boolean; error?: string }> {
    const midi = await this.midi.init();
    this.midi.onMessage = (msg, deviceId) => this.handleMidi(msg, deviceId);
    this.midi.onDevicesChanged = () => this.emitStatus();
    this.emitStatus({ midiOk: midi.ok, midiEnabled: midi.ok, midiError: midi.error });
    return midi;
  }

  /** Begin or join a scene load generation (latest token wins at commit). */
  beginSceneLoad(): number {
    this.loadGeneration += 1;
    return this.loadGeneration;
  }

  getLoadGeneration(): number {
    return this.loadGeneration;
  }

  isLoadCurrent(token: number): boolean {
    return token === this.loadGeneration;
  }

  setProductionCaptureMode(enabled: boolean): void {
    this.digestSampleIntervalMs = enabled ? 1200 : 250;
  }

  getSessionTimingDiagnostics(): LiveSessionTimingDiagnostics {
    return {
      lastScenePrepareMs: this.lastScenePrepareMs,
      lastSceneCommitMs: this.lastSceneCommitMs,
      longestMainThreadBlockMs: this.longestMainThreadBlockMs,
      recentLongTaskCount: this.recentLongTaskCount,
      lastPieceUpdateMs: this.lastUpdateMs,
      lastPieceRenderMs: this.hud.glMs,
      lastReadPixelsMs: this.lastReadPixelsMs,
      loadGeneration: this.loadGeneration,
      digestSampleIntervalMs: this.digestSampleIntervalMs,
    };
  }

  noteMainThreadBlock(ms: number): void {
    if (ms > this.longestMainThreadBlockMs) this.longestMainThreadBlockMs = ms;
    if (ms >= 50) this.recentLongTaskCount += 1;
  }

  async loadSet(
    set: SetDef,
    liveMode: "animate" | "react" = "animate",
    loadToken?: number,
  ): Promise<void> {
    const token = loadToken ?? this.beginSceneLoad();
    if (!this.isLoadCurrent(token)) {
      throw new StaleSceneLoadError();
    }
    const t0 = performance.now();
    let prepared: PreparedScene | null = null;
    try {
      prepared = await this.prepareScenePieces(set, liveMode, token);
      this.lastScenePrepareMs = performance.now() - t0;
      if (!this.isLoadCurrent(token)) {
        this.disposePreparedScene(prepared);
        throw new StaleSceneLoadError();
      }
      const c0 = performance.now();
      this.commitPreparedScene(set, prepared);
      this.lastSceneCommitMs = performance.now() - c0;
      this.emitStatus();
    } catch (err) {
      if (prepared) this.disposePreparedScene(prepared);
      if (err instanceof StaleSceneLoadError) throw err;
      throw err;
    }
  }

  private async rebuildScenePieces(liveMode: "animate" | "react" = "animate"): Promise<void> {
    const set = this.runtime.getSet();
    if (!set) return;
    await this.loadSet(set, liveMode);
  }

  private renderDimensions(): { w: number; h: number } {
    let w: number;
    let h: number;
    if (this.stageViewportFit) {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = QUALITY_SCALE[this.quality];
      w = Math.max(1, Math.floor(rect.width * dpr * Math.min(1, scale)));
      h = Math.max(1, Math.floor(rect.height * dpr * Math.min(1, scale)));
    } else {
      const scale = QUALITY_SCALE[this.quality];
      const { width, height } = parseResolution(this.resolution);
      w = Math.max(1, Math.floor(width * Math.min(1, scale)));
      h = Math.max(1, Math.floor(height * Math.min(1, scale)));
    }
    return { w, h };
  }

  private async prepareScenePieces(
    set: SetDef,
    liveMode: "animate" | "react",
    token: number,
  ): Promise<PreparedScene> {
    const scenes = orderedScenes(set);
    const sceneIndex =
      scenes.length === 1 ? 0 : Math.min(this.runtime.getSceneIndex(), scenes.length - 1);
    const scene = scenes[sceneIndex] ?? scenes[0];
    if (!scene) {
      throw new Error("Set has no scenes");
    }
    const { w, h } = this.renderDimensions();
    const gl = this.compositor.gl;
    const pieces = new Map<string, import("./piece").LivePiece>();
    const baseParams = new Map<string, Record<string, number>>();
    const layerOpacity = new Map<string, number>();
    const layerBlend = new Map<string, BlendMode>();
    const layerEnabled = new Map<string, boolean>();
    const layerRenderOrder: string[] = [];

    for (const layer of scene.layers) {
      if (!this.isLoadCurrent(token)) {
        this.disposePreparedScene({
          pieces,
          baseParams,
          layerOpacity,
          layerBlend,
          layerEnabled,
          layerRenderOrder,
          basePost: {},
          w,
          h,
          mappings: [],
        });
        throw new StaleSceneLoadError();
      }
      let piece;
      try {
        piece = await createLivePiece(gl, layer.piece, liveMode);
      } catch (err) {
        this.disposePreparedScene({
          pieces,
          baseParams,
          layerOpacity,
          layerBlend,
          layerEnabled,
          layerRenderOrder,
          basePost: {},
          w,
          h,
          mappings: [],
        });
        if (err instanceof UnsupportedLivePieceError) {
          throw new Error(`${layer.piece}: ${err.message}`);
        }
        throw err;
      }
      const seed = layer.seed ?? this.runtime.getSeed();
      await piece.initialize({ piece: layer.piece }, seed);
      if (!this.isLoadCurrent(token)) {
        piece.dispose();
        this.disposePreparedScene({
          pieces,
          baseParams,
          layerOpacity,
          layerBlend,
          layerEnabled,
          layerRenderOrder,
          basePost: {},
          w,
          h,
          mappings: [],
        });
        throw new StaleSceneLoadError();
      }
      piece.resize(w, h);
      if (layer.parameters) {
        for (const [k, v] of Object.entries(layer.parameters)) {
          piece.setParameter(k, v);
        }
      }
      pieces.set(layer.id, piece);
      baseParams.set(layer.id, { ...piece.getBaseParameters() });
      layerOpacity.set(layer.id, layer.opacity ?? 1);
      layerBlend.set(layer.id, layer.blend ?? "normal");
      layerEnabled.set(layer.id, true);
      layerRenderOrder.push(layer.id);
    }
    if (pieces.size === 0) {
      throw new Error("No live runtimes loaded for scene");
    }
    return {
      pieces,
      baseParams,
      layerOpacity,
      layerBlend,
      layerEnabled,
      layerRenderOrder,
      basePost: { ...(scene.post ?? {}) },
      w,
      h,
      mappings: this.sceneMappings(scene),
    };
  }

  private commitPreparedScene(set: SetDef, prepared: PreparedScene): void {
    this.compositor.resize(prepared.w, prepared.h);
    this.canvas.width = prepared.w;
    this.canvas.height = prepared.h;
    const scenes = orderedScenes(set);
    const sceneIndex =
      scenes.length === 1 ? 0 : Math.min(this.runtime.getSceneIndex(), scenes.length - 1);
    this.runtime.loadSet(set, sceneIndex);
    const previous = this.runtime.replacePieces(prepared.pieces);
    this.baseParams = prepared.baseParams;
    this.layerOpacity = prepared.layerOpacity;
    this.layerBlend = prepared.layerBlend;
    this.layerEnabled = prepared.layerEnabled;
    this.layerRenderOrder = prepared.layerRenderOrder;
    this.basePost = prepared.basePost;
    this.postFrame = { ...this.basePost };
    this.modulation.setMappings(prepared.mappings);
    this.compositor.resetFeedback();
    for (const p of previous) {
      p.dispose();
    }
    this.sessionStartedPerfMs = performance.now();
    this.visualLiveness.reset(this.pixelDigest, this.sessionStartedPerfMs);
  }

  private disposePreparedScene(prepared: PreparedScene): void {
    for (const p of prepared.pieces.values()) {
      p.dispose();
    }
  }

  /** Paint one or more logical frames immediately (Studio first-frame guarantee). */
  paintFrames(count = 2, wallNowMs = performance.now()): void {
    for (let i = 0; i < count; i++) {
      this.frame(wallNowMs + i * (1000 / 60));
    }
  }

  /** Capture stable parameter bases for animation arcs (immune to per-frame modulation). */
  refreshAnimationBaseParams(): void {
    const scene = this.runtime.getScene();
    if (!scene) return;
    for (const layer of scene.layers) {
      const piece = this.runtime.getPiece(layer.id);
      if (piece) this.baseParams.set(layer.id, { ...piece.getBaseParameters() });
    }
  }

  setAnimationSpec(spec: AnimationSpec, opts?: SetAnimationSpecOptions): void {
    const prevTime = this.animationRuntime.animationTimeSec;
    this.animationRuntime.setSpec(spec);
    const perf =
      opts?.performanceMode ??
      (spec.endBehavior === "continuous" && spec.durationSec <= 0);
    this.animationRuntime.performanceMode = perf;
    if (opts?.preserveTime) {
      this.animationRuntime.seekTime(prevTime);
    } else {
      this.animationRuntime.reset();
      this.lastAnimWallMs = 0;
    }
    this.refreshAnimationBaseParams();
  }

  getAnimationSpec(): AnimationSpec {
    return this.animationRuntime.spec;
  }

  clearOverlayLayerAnimations(): void {
    this.overlayAnimationRuntimes.clear();
  }

  setOverlayLayerAnimations(
    entries: Array<{ layerId: string; spec: AnimationSpec }>,
  ): void {
    this.clearOverlayLayerAnimations();
    const t = this.animationRuntime.animationTimeSec;
    for (const { layerId, spec } of entries) {
      const rt = new AnimationRuntime(spec);
      rt.performanceMode = true;
      rt.seekTime(t);
      this.overlayAnimationRuntimes.set(layerId, rt);
    }
  }

  /** Non-destructive recovery when live output stalls while transport is playing. */
  attemptLiveLivenessRecovery(liveMode: "animate" | "react" = "animate"): boolean {
    const scene = this.runtime.getScene();
    if (!scene) return false;
    const primaryPiece = scene.layers[0]?.piece ?? "";
    const normalized = normalizeSpecForLivePerformance(
      primaryPiece,
      this.animationRuntime.spec,
      liveMode,
    );
    this.animationRuntime.setSpec(normalized);
    this.animationRuntime.performanceMode = true;
    this.animationRuntime.seekTime(this.animationRuntime.animationTimeSec);
    this.runtime.setFreezePieceUpdates(false);
    this.runtime.setSimulationPaused(false);
    this.visualLiveness.markRecovering(performance.now());
    return true;
  }

  getLayerPerformanceStates(): Array<{
    id: string;
    piece: string;
    opacity: number;
    blend: BlendMode;
    enabled: boolean;
  }> {
    const scene = this.runtime.getScene();
    if (!scene) return [];
    return scene.layers.map((layer) => ({
      id: layer.id,
      piece: layer.piece,
      opacity: this.layerOpacity.get(layer.id) ?? layer.opacity ?? 1,
      blend: this.layerBlend.get(layer.id) ?? layer.blend ?? "normal",
      enabled: this.layerEnabled.get(layer.id) !== false,
    }));
  }

  setLayerPerformanceState(
    layerId: string,
    patch: { opacity?: number; blend?: BlendMode; enabled?: boolean },
  ): void {
    if (patch.opacity != null) this.layerOpacity.set(layerId, patch.opacity);
    if (patch.blend != null) this.layerBlend.set(layerId, patch.blend);
    if (patch.enabled != null) this.layerEnabled.set(layerId, patch.enabled);
  }

  swapLayerOrder(a: string, b: string): boolean {
    const scene = this.runtime.getScene();
    if (!scene || scene.layers.length < 2) return false;
    const order =
      this.layerRenderOrder.length === scene.layers.length
        ? [...this.layerRenderOrder]
        : scene.layers.map((l) => l.id);
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia < 0 || ib < 0) return false;
    [order[ia], order[ib]] = [order[ib]!, order[ia]!];
    this.layerRenderOrder = order;
    return true;
  }

  getFramePacingSnapshot(): FramePacingSnapshot {
    return this.framePacing.snapshot(this.hud.fps, this.rafHz);
  }

  private orderedLayers(scene: SceneDef): SceneDef["layers"] {
    if (this.layerRenderOrder.length !== scene.layers.length) return scene.layers;
    const byId = new Map(scene.layers.map((l) => [l.id, l]));
    return this.layerRenderOrder.map((id) => byId.get(id)).filter(Boolean) as SceneDef["layers"];
  }

  getDiagnostics(): LiveDiagnostics {
    const rect = this.canvas.getBoundingClientRect();
    const snap = this.runtime.transport.getSnapshot();
    const now = performance.now();
    return {
      rafCount: this.rafCount,
      rafHz: this.rafHz,
      rafLastTimestamp: this.rafLastTimestamp,
      tickCount: this.tickCount,
      updateCount: this.runtime.getUpdateCount(),
      renderCount: this.renderCount,
      presentCount: this.presentCount,
      logicalFrame: this.runtime.getFrame(),
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      visibleCssWidth: rect.width,
      visibleCssHeight: rect.height,
      lastSuccessfulDrawMs: this.lastSuccessfulDrawMs,
      pixelDigest: this.pixelDigest,
      presentedFrame: this.lastPresentedStats,
      webglError: this.webglError,
      simulationPaused: this.runtime.isSimulationPaused(),
      transportPlaying: snap.playing,
      visualFps: this.hud.fps,
      rafStalled:
        this.running &&
        this.rafCount > 20 &&
        now - this.rafProgressMs > 1500,
      activeLayerCount: this.runtime.getScene()?.layers.length ?? 0,
      quality: this.quality,
      framePacing: this.getFramePacingSnapshot(),
      lastUpdateMs: this.lastUpdateMs,
      lastRenderMs: this.hud.glMs,
      lastAudioMs: this.hud.audioMs,
      liveSessionCount: 1,
      visualLiveness: this.visualLiveness.snapshot(
        performance.now(),
        snap.playing,
        this.runtime.isSimulationPaused(),
        this.animationRuntime.animationTimeSec,
        this.sessionStartedPerfMs,
      ),
      animationPhase: this.animationRuntime.evaluate().phase,
      performanceMode: this.animationRuntime.performanceMode,
    };
  }

  private sceneMappings(scene: SceneDef): ModMapping[] {
    return (scene.modulation ?? []).map((m, i) => ({
      id: m.id ?? `mod-${i}`,
      source: m.source,
      destination: m.destination,
      amount: m.amount ?? 1,
      offset: m.offset ?? 0,
      min: m.min ?? 0,
      max: m.max ?? 1,
      curve: m.curve ?? 1,
      invert: m.invert ?? false,
      smoothing: m.smoothing ?? 0.2,
    }));
  }

  private handleMidi(msg: MidiMessage, _deviceId: string): void {
    const transport = this.runtime.transport;
    if (msg.kind === "clock") {
      transport.setSource("midi-clock");
      const now = performance.now();
      if (this.lastMidiClockMs != null) {
        const dt = (now - this.lastMidiClockMs) / 1000;
        transport.estimateBpmFromClockInterval(dt);
      }
      this.lastMidiClockMs = now;
      this.midiClockMissCount = 0;
      this.runtime.setMidiClockHealthy(true);
      transport.onMidiClock();
      return;
    }
    if (msg.kind === "start") {
      transport.setSource("midi-clock");
      transport.reset();
      transport.start();
      return;
    }
    if (msg.kind === "continue") {
      transport.setSource("midi-clock");
      transport.continue();
      return;
    }
    if (msg.kind === "stop") {
      transport.stop();
      return;
    }

    const events = this.midiMapper.handle(msg);
    for (const ev of events) {
      this.applyControl(ev.target, ev.value, ev.kind);
      this.recorder.pushEvent({
        type: "midi",
        t: this.runtime.getFrame() / 60,
        beat: transport.getSnapshot().beat,
        target: ev.target,
        value: ev.value,
      });
    }
  }

  /** Test/replay adapter for synthetic MIDI. */
  injectMidi(msg: MidiMessage): void {
    this.handleMidi(msg, "test");
  }

  applyControl(target: string, value: number, kind: string): void {
    if (target.startsWith("midi.cc.")) {
      this.midiCcSources.set(target, value);
      return;
    }
    if (target === "action.next_scene" || (kind === "scene" && target === "next")) {
      void this.advanceSet();
      return;
    }
    if (target === "action.prev_scene") {
      this.gotoRelative(-1);
      return;
    }
    if (target === "action.blackout") {
      this.runtime.setBlackout(true);
      return;
    }
    if (target === "action.panic") {
      this.panic();
      return;
    }
    if (target === "action.record_toggle") {
      this.toggleRecord();
      return;
    }
    if (target.startsWith("scene.")) {
      const id = target.slice(6);
      void this.gotoScene(id);
      return;
    }
    if (target.startsWith("cue.")) {
      const set = this.runtime.getSet();
      const cue = set?.cues?.find((c) => c.id === target.slice(4));
      if (cue) {
        if (cue.action === "record_toggle") this.toggleRecord();
        else this.runtime.applyCue(cue);
        if (cue.action === "next_scene" || cue.action === "prev_scene" || cue.action === "goto_scene") {
          void this.rebuildScenePieces();
        }
      }
      return;
    }
    // continuous params stored as midi sources for modulation
    this.midiCcSources.set(target, value);
  }

  private gotoRelative(delta: number): void {
    const idx = this.runtime.getSceneIndex() + delta;
    void this.gotoScene(idx);
  }

  setSetExecutionMode(mode: SetExecutionMode): void {
    this.setPerformanceMode = mode;
    this.runtime.orchestrator.setExecutionMode(mode);
  }

  getSetExecutionMode(): SetExecutionMode {
    return this.setPerformanceMode;
  }

  async seekRehearsal(entry: RehearsalEntry): Promise<void> {
    this.runtime.orchestrator.seekRehearsal(entry);
    await this.rebuildScenePieces();
  }

  async advanceSet(): Promise<void> {
    const result = this.runtime.advanceSet();
    await this.handleAdvanceResult(result);
  }

  async gotoScene(indexOrId: number | string): Promise<void> {
    const result = this.runtime.gotoScene(indexOrId);
    await this.handleAdvanceResult(result);
  }

  getCapturedSceneCandidates(): SceneDef[] {
    return [...this.capturedCandidates];
  }

  captureMorphScene(name: string, id?: string): SceneDef | null {
    const tr = this.runtime.getOrchestratorTransition();
    const from = tr
      ? this.runtime.getSceneById(tr.fromSceneId)
      : this.runtime.getScene();
    const to = tr ? this.runtime.getSceneById(tr.toSceneId) : null;
    if (!from) return null;
    const ctx: CaptureContext = {
      fromScene: from,
      toScene: to,
      morphProgress: tr?.progress ?? null,
      performanceTimeSec: this.animationRuntime.animationTimeSec,
      globalSeed: this.runtime.getSeed(),
    };
    const captured = captureSceneCandidate(
      ctx,
      id ?? `capture-${this.capturedCandidates.length + 1}`,
      name,
    );
    this.capturedCandidates.push(captured);
    return captured;
  }

  getSetOrchestratorSnapshot() {
    return this.runtime.orchestrator.snapshot();
  }

  private async handleAdvanceResult(result: AdvanceResult): Promise<void> {
    if (result.action === "queue") return;
    if (result.action === "prepare_transition") {
      await this.prepareMorphDestination(result.toSceneId);
      this.runtime.orchestrator.markDestinationPrepared(result.toSceneId);
      this.morphFromSceneId = result.fromSceneId;
      return;
    }
    if (result.action === "complete_transition") {
      await this.commitMorphDestination(result.toSceneId);
      const snap = this.runtime.transport.getSnapshot();
      this.recorder.pushEvent({
        type: "scene",
        t: this.runtime.getFrame() / 60,
        beat: snap.beat,
        scene_id: result.toSceneId,
      });
    }
  }

  private async prepareMorphDestination(toSceneId: string): Promise<void> {
    const scene = this.runtime.getSceneById(toSceneId);
    const set = this.runtime.getSet();
    if (!scene || !set) return;
    const token = this.beginSceneLoad();
    try {
      const prepared = await this.prepareScenePieces(singleSceneSet(scene), "animate", token);
      if (!this.isLoadCurrent(token)) {
        this.disposePreparedScene(prepared);
        return;
      }
      if (this.morphToPrepared) this.disposePreparedScene(this.morphToPrepared);
      this.morphToPrepared = prepared;
      this.morphToPieces = new Map(prepared.pieces);
    } catch {
      if (this.morphToPrepared) this.disposePreparedScene(this.morphToPrepared);
      this.morphToPrepared = null;
      this.morphToPieces.clear();
    }
  }

  private async commitMorphDestination(toSceneId: string): Promise<void> {
    if (!this.morphToPrepared) {
      await this.rebuildScenePieces();
      return;
    }
    const prepared = this.morphToPrepared;
    this.morphToPrepared = null;
    this.morphToPieces.clear();
    this.morphFromSceneId = null;
    const set = this.runtime.getSet();
    if (!set) return;
    this.compositor.resize(prepared.w, prepared.h);
    const previous = this.runtime.replacePieces(prepared.pieces);
    this.baseParams = prepared.baseParams;
    this.layerOpacity = prepared.layerOpacity;
    this.layerBlend = prepared.layerBlend;
    this.layerEnabled = prepared.layerEnabled;
    this.layerRenderOrder = prepared.layerRenderOrder;
    this.basePost = prepared.basePost;
    this.postFrame = { ...this.basePost };
    this.modulation.setMappings(prepared.mappings);
    for (const p of previous) p.dispose();
    void toSceneId;
  }

  private async processOrchestratorTickResults(): Promise<void> {
    for (const result of this.runtime.consumeOrchestratorResults()) {
      await this.handleAdvanceResult(result);
    }
  }

  panic(): void {
    this.runtime.panic();
    this.compositor.resetFeedback();
    this.envelopes.setDefs([
      { id: "env.flash", kind: "pulse", attack: 0.01, decay: 0.18 },
      { id: "env.snare", kind: "ad", attack: 0.005, decay: 0.25 },
      { id: "env.adsr", kind: "adsr", attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.4 },
    ]);
    this.midiCcSources.clear();
    // restore base post exposure
    this.basePost = {
      ...(this.runtime.getScene()?.post ?? {}),
      exposure: Math.min(1.2, this.runtime.getScene()?.post?.exposure ?? 1),
      feedback: Math.min(0.35, this.runtime.getScene()?.post?.feedback ?? 0.2),
      bloom: Math.min(0.35, this.runtime.getScene()?.post?.bloom ?? 0.15),
    };
    this.emitStatus();
  }

  toggleRecord(): PerformanceRecording | null {
    if (this.recorder.isRecording()) {
      return this.recorder.stop();
    }
    const set = this.runtime.getSet();
    if (!set) return null;
    const snap = this.runtime.transport.getSnapshot();
    this.recorder.start(set, this.runtime.getSeed(), 60, snap.beat);
    return null;
  }

  startReplay(rec: PerformanceRecording): void {
    this.replayer = new PerformanceReplayer(rec);
    this.runtime.transport.setSource("replay");
    this.runtime.transport.reset();
    this.runtime.transport.start();
    void this.loadSet(rec.set);
  }

  stopReplay(): void {
    this.replayer = null;
  }

  setQuality(q: QualityProfile): void {
    this.quality = q;
    this.hud.quality = q;
    void this.rebuildScenePieces();
  }

  applyResolution(preset: ResolutionPreset): void {
    this.resolution = preset;
    if (this.stageViewportFit) {
      this.fitStageViewport();
      return;
    }
    const { width, height } = parseResolution(preset);
    this.applyRenderSize(width, height);
  }

  /** Backing store = visible stage × DPR (performance full-bleed). */
  fitStageViewport(): void {
    const parent = this.canvas.parentElement?.getBoundingClientRect();
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(1, parent?.width || rect.width || window.innerWidth);
    const cssH = Math.max(1, parent?.height || rect.height || window.innerHeight);
    this.applyRenderSize(cssW, cssH, dpr);
  }

  private applyRenderSize(cssWidth: number, cssHeight: number, dpr = 1): void {
    const scale = QUALITY_SCALE[this.quality];
    const w = Math.max(1, Math.floor(cssWidth * dpr * Math.min(1, scale)));
    const h = Math.max(1, Math.floor(cssHeight * dpr * Math.min(1, scale)));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.compositor.resize(w, h);
    const scene = this.runtime.getScene();
    if (scene) {
      for (const layer of scene.layers) {
        this.runtime.getPiece(layer.id)?.resize(w, h);
      }
    }
  }

  setTransparent(on: boolean): void {
    this.compositor.transparent = on;
  }

  injectFeatures(f: AudioFeatures): void {
    this.audio.inject(f);
    this.features = f;
  }

  /** Start or recover the RAF driver (re-schedule if heartbeat stalled). */
  startLoop(force = false): void {
    const now = performance.now();
    const stalled = this.running && now - this.rafLastTimestamp > 500;
    if (this.running && !force && !stalled) return;
    if (this.running) {
      cancelAnimationFrame(this.raf);
    }
    this.running = true;
    this.fpsLast = performance.now();
    this.rafHzLast = this.fpsLast;
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  ensureLoopRunning(): void {
    this.startLoop(this.running && performance.now() - this.rafLastTimestamp > 500);
  }

  stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Pin last presented grid as baseline for cross-cycle comparison. */
  pinPresentedBaseline(): void {
    if (!this.lastPresentedGrid || !this.lastPresentedStats) return;
    this.baselinePresentedGrid = this.lastPresentedGrid.slice();
    this.baselinePresentedStats = this.lastPresentedStats;
  }

  /** Fraction of pixels changed vs stored baseline grid. */
  comparePresentedToBaseline(gridW = 64, gridH = 36): number | null {
    if (!this.baselinePresentedGrid) return null;
    const gl = this.compositor.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const raw = new Uint8Array(Math.max(1, cw * ch * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const grid = downsampleRgba(raw, cw, ch, gridW, gridH);
    const stats = analyzeRgbaGrid(grid, gridW, gridH, {
      pixels: this.baselinePresentedGrid,
      stats: this.baselinePresentedStats!,
    });
    return stats.changedPixelFraction;
  }

  /** Corner luminance from presented frame (grid space — catches letterboxed scope). */
  readPresentedScopeMetrics(gridW = 32, gridH = 18): {
    borderMeanLuma: number;
    innerMeanLuma: number;
    corners: { tl: number; tr: number; bl: number; br: number };
  } {
    const gl = this.compositor.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const raw = new Uint8Array(Math.max(1, cw * ch * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const grid = downsampleRgba(raw, cw, ch, gridW, gridH);
    let borderSum = 0;
    let borderN = 0;
    let innerSum = 0;
    let innerN = 0;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const lum = luminanceAt(grid, gy * gridW + gx);
        const border = gx === 0 || gy === 0 || gx === gridW - 1 || gy === gridH - 1;
        if (border) {
          borderSum += lum;
          borderN += 1;
        } else {
          innerSum += lum;
          innerN += 1;
        }
      }
    }
    const cell = (gx: number, gy: number) => luminanceAt(grid, gy * gridW + gx);
    return {
      borderMeanLuma: borderSum / Math.max(1, borderN),
      innerMeanLuma: innerSum / Math.max(1, innerN),
      corners: {
        bl: cell(0, 0),
        br: cell(gridW - 1, 0),
        tl: cell(0, gridH - 1),
        tr: cell(gridW - 1, gridH - 1),
      },
    };
  }

  readPresentedCornerLuminances(gridW = 32, gridH = 18): {
    tl: number;
    tr: number;
    bl: number;
    br: number;
  } {
    const gl = this.compositor.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const raw = new Uint8Array(Math.max(1, cw * ch * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    return this.readPresentedScopeMetrics(gridW, gridH).corners;
  }

  /** Read the visible #stage canvas after compositor present (actual RGBA pixels). */
  readPresentedPixels(gridW = 64, gridH = 36, trackForComparison = true): PixelFrame {
    const rp0 = performance.now();
    const gl = this.compositor.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const raw = new Uint8Array(Math.max(1, cw * ch * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    this.lastReadPixelsMs = performance.now() - rp0;
    this.noteMainThreadBlock(this.lastReadPixelsMs);
    const grid = downsampleRgba(raw, cw, ch, gridW, gridH);
    const prior =
      trackForComparison && this.lastPresentedGrid
        ? { pixels: this.lastPresentedGrid, stats: this.lastPresentedStats! }
        : undefined;
    const stats = analyzeRgbaGrid(grid, gridW, gridH, prior);
    if (trackForComparison) {
      this.lastPresentedGrid = grid;
      this.lastPresentedStats = stats;
    }
    this.pixelDigest = stats.digest;
    return stats;
  }

  /** Single deterministic tick (tests / smoke). */
  frame(wallNowMs: number): FrameState {
    this.rafCount += 1;
    this.rafLastTimestamp = performance.now();
    this.rafProgressMs = this.rafLastTimestamp;
    this.rafHzFrames += 1;
    if (this.rafLastTimestamp - this.rafHzLast >= 500) {
      this.rafHz =
        (this.rafHzFrames * 1000) / Math.max(1, this.rafLastTimestamp - this.rafHzLast);
      this.rafHzFrames = 0;
      this.rafHzLast = this.rafLastTimestamp;
    }
    this.tickCount += 1;
    const t0 = performance.now();
    // Audio
    const a0 = performance.now();
    if (this.replayer) {
      const beat = this.runtime.transport.getSnapshot().beat;
      // advance replay transport via wall when source is replay — drive by wall like internal
      this.runtime.transport.setSource("internal");
      const feats = this.replayer.featuresAt(beat);
      if (feats) this.features = feats;
      for (const ev of this.replayer.eventsThrough(beat)) {
        this.applyReplayEvent(ev);
      }
    } else if (this.audio.isActive()) {
      this.features = this.audio.poll();
    } else {
      this.features = this.audio.getFeatures();
    }
    this.hud.audioMs = performance.now() - a0;

    if (this.features.onset && !this.lastOnset) {
      this.envelopes.trigger("env.flash", this.runtime.getFrame() / 60);
      this.envelopes.trigger("env.snare", this.runtime.getFrame() / 60);
    }
    this.lastOnset = this.features.onset;

    const snap = this.runtime.transport.getSnapshot();
    const simPaused = this.runtime.isSimulationPaused();
    const animWallDt =
      this.lastAnimWallMs > 0
        ? Math.min(0.25, Math.max(0, (wallNowMs - this.lastAnimWallMs) / 1000))
        : 0;
    this.lastAnimWallMs = wallNowMs;
    this.animationRuntime.tick(animWallDt, snap.playing && !simPaused);
    for (const rt of this.overlayAnimationRuntimes.values()) {
      rt.tick(animWallDt, snap.playing && !simPaused);
    }
    const animSt = this.animationRuntime.evaluate();
    const multiOverlay = this.overlayAnimationRuntimes.size > 0;
    if (multiOverlay) {
      const l0 = this.runtime.getPiece("L0");
      if (l0) this.animationRuntime.applyToPiece(l0, this.baseParams);
      for (const [layerId, rt] of this.overlayAnimationRuntimes) {
        const piece = this.runtime.getPiece(layerId);
        if (piece) rt.applyToPiece(piece, this.baseParams);
      }
      this.runtime.setFreezePieceUpdates(false);
    } else {
      this.animationRuntime.applyToPieces(this.runtime.getPieces(), this.baseParams);
      this.runtime.setFreezePieceUpdates(animSt.useSourceSnapshot);
    }

    const u0 = performance.now();
    const frame = this.runtime.tick(wallNowMs);
    this.lastUpdateMs = performance.now() - u0;
    if (
      this.runtime.transport.getSnapshot().source === "midi-clock" &&
      this.lastMidiClockMs != null &&
      wallNowMs - this.lastMidiClockMs > 500
    ) {
      this.midiClockMissCount += 1;
      if (this.midiClockMissCount > 3) {
        this.runtime.setMidiClockHealthy(false);
      }
    }
    void this.processOrchestratorTickResults();
    if (this.morphToPieces.size > 0 && !this.runtime.isSimulationPaused()) {
      for (const piece of this.morphToPieces.values()) {
        piece.update(frame);
      }
    }

    // On beat edges trigger subtle envelope
    if (frame.beatPhase < 0.05 && snap.playing) {
      // no-op pulse already from onset; beat available as source
    }

    const lfo = this.lfos.sample(frame.beat, frame.bpm);
    const env = this.envelopes.sample(frame.t);
    const sources: Record<string, number> = {
      "audio.energy": this.features.energy,
      "audio.peak": this.features.peak,
      "audio.low": this.features.low,
      "audio.mid": this.features.mid,
      "audio.high": this.features.high,
      "audio.centroid": this.features.centroid,
      "audio.flux": this.features.flux,
      "audio.onset": this.features.onset ? 1 : 0,
      "transport.beat": frame.beatPhase,
      "transport.beatPhase": frame.beatPhase,
      "transport.bar": frame.bar % 1 === 0 ? frame.beatPhase : (frame.beat / 4) % 1,
      "transport.phase": frame.beatPhase,
      ...Object.fromEntries(
        Object.entries(lfo).map(([k, v]) => [k.startsWith("lfo.") ? k : `lfo.${k}`, v]),
      ),
      ...Object.fromEntries(
        Object.entries(env).map(([k, v]) => [k.startsWith("env.") ? k : `env.${k}`, v]),
      ),
      ...Object.fromEntries(this.midiCcSources),
    };
    // alias LFO ids from defs
    for (const [k, v] of Object.entries(lfo)) sources[k] = v;
    for (const [k, v] of Object.entries(env)) sources[k] = v;

    const mods = this.modulation.evaluate(sources);
    this.applyMods(mods);

    // Push audio into pieces
    const scene = this.runtime.getScene();
    if (scene) {
      for (const layer of scene.layers) {
        const piece = this.runtime.getPiece(layer.id);
        if (!piece) continue;
        piece.setParameter("audio.energy", this.features.energy);
        piece.setParameter("audio.low", this.features.low);
        piece.setParameter("audio.mid", this.features.mid);
        piece.setParameter("audio.high", this.features.high);
        piece.setParameter("audio.onset", this.features.onset ? 1 : 0);
      }
    }

    this.recorder.pushFeatures(frame.t, frame.beat, this.features);

    const g0 = performance.now();
    this.renderFrame(frame);
    this.hud.glMs = performance.now() - g0;
    this.renderCount += 1;
    this.lastSuccessfulDrawMs = performance.now();
    if (wallNowMs - this.lastDigestSampleMs > this.digestSampleIntervalMs) {
      this.lastDigestSampleMs = wallNowMs;
      try {
        // Digest-only — do not advance the comparison chain used by tests/diagnostics.
        this.readPresentedPixels(64, 36, false);
        this.visualLiveness.noteDigest(
          this.pixelDigest,
          performance.now(),
          snap.playing,
          simPaused,
        );
        const live = this.visualLiveness.snapshot(
          performance.now(),
          snap.playing,
          simPaused,
          this.animationRuntime.animationTimeSec,
          this.sessionStartedPerfMs,
        );
        if (
          live.status === "stalled" &&
          this.animationRuntime.performanceMode &&
          snap.playing &&
          !simPaused
        ) {
          this.attemptLiveLivenessRecovery("animate");
        }
      } catch {
        /* readPixels may fail during resize; keep last digest */
      }
    }
    const err = this.compositor.gl.getError();
    if (err !== this.compositor.gl.NO_ERROR) {
      this.webglError = `GL ${err}`;
    }
    this.hud.frameMs = performance.now() - t0;
    this.hud.layers = scene?.layers.length ?? 0;
    this.framePacing.push(this.hud.frameMs);

    this.fpsFrames += 1;
    this.fpsAccum += this.hud.frameMs;
    if (wallNowMs - this.fpsLast >= 500) {
      this.hud.fps = (this.fpsFrames * 1000) / Math.max(1, wallNowMs - this.fpsLast);
      this.fpsFrames = 0;
      this.fpsLast = wallNowMs;
      this.onHud?.(this.hud);
    }

    return frame;
  }

  private applyReplayEvent(ev: PerfEvent): void {
    if (ev.type === "scene") void this.gotoScene(ev.scene_id);
    if (ev.type === "blackout") this.runtime.setBlackout(ev.on);
    if (ev.type === "midi") this.applyControl(ev.target, ev.value, "cc");
    if (ev.type === "param") this.midiCcSources.set(ev.path, ev.value);
  }

  /** Blend mod matrix output with stored base — silence must not zero simulation params. */
  private modulatedValue(base: number, modValue: number): number {
    if (modValue <= 1e-6) return base;
    return base * (1 + modValue);
  }

  private applyMods(mods: Record<string, number>): void {
    const post: PostDef = { ...this.basePost };
    for (const [dest, value] of Object.entries(mods)) {
      if (dest.startsWith("post.")) {
        const key = dest.slice(5) as keyof PostDef;
        const baseVal = (this.basePost as Record<string, number>)[key] ?? 0;
        (post as Record<string, number>)[key] = this.modulatedValue(baseVal, value);
        continue;
      }
      if (dest.startsWith("layer.")) {
        const rest = dest.slice(6);
        const dot = rest.indexOf(".");
        if (dot < 0) continue;
        const layerId = rest.slice(0, dot);
        const param = rest.slice(dot + 1);
        if (param === "opacity") {
          this.layerOpacity.set(layerId, value);
          continue;
        }
        const piece = this.runtime.getPiece(layerId);
        if (!piece) continue;
        const baseMap = this.baseParams.get(layerId);
        const baseVal = baseMap?.[param];
        if (typeof baseVal === "number") {
          piece.setParameter(param, this.modulatedValue(baseVal, value));
        } else {
          piece.setParameter(param, value);
        }
      }
    }
    this.postFrame = post;
  }

  private renderFrame(frame: FrameState): void {
    if (!this.compositor.isReady()) return;
    const scene = this.runtime.getScene();
    if (!scene) return;
    let post = this.postFrame.exposure != null || Object.keys(this.postFrame).length
      ? this.postFrame
      : this.basePost;
    const tr = this.runtime.getTransition();
    const orchTr = this.runtime.getOrchestratorTransition();
    const animSt = this.animationRuntime.evaluate();
    const spec = this.animationRuntime.spec;
    const cameraActive = hasComponent(spec, "camera");
    const camera = cameraActive ? animSt.camera : null;

    if (!animSt.useSourceSnapshot) {
      this.compositor.beginFrame();
      const morphActive =
        orchTr &&
        orchTr.progress < 1 &&
        this.morphToPieces.size > 0 &&
        this.morphFromSceneId;
      if (morphActive) {
        const fromScene = this.runtime.getSceneById(this.morphFromSceneId!);
        const toScene = this.runtime.getSceneById(orchTr.toSceneId);
        if (fromScene && toScene) {
          const morphed = morphScenes(fromScene, toScene, orchTr.progress);
          post = { ...morphed.post };
          for (const ml of morphed.layers) {
            if (ml.presence <= 0.001) continue;
            const fromPiece = this.runtime.getPiece(ml.id);
            const toPiece = this.morphToPieces.get(ml.id);
            const piece = toPiece ?? fromPiece;
            if (!piece) continue;
            if (this.layerEnabled.get(ml.id) === false && !toPiece) continue;
            const target = this.compositor.getLayerTarget();
            piece.render({
              framebuffer: target.framebuffer,
              width: target.width,
              height: target.height,
              transparent: this.compositor.transparent,
            });
            this.compositor.compositeLayer(ml.blend ?? "normal", ml.opacity * ml.presence);
          }
        }
      } else {
        for (const layer of this.orderedLayers(scene)) {
          const piece = this.runtime.getPiece(layer.id);
          if (!piece) continue;
          if (this.layerEnabled.get(layer.id) === false) continue;
          const target = this.compositor.getLayerTarget();
          piece.render({
            framebuffer: target.framebuffer,
            width: target.width,
            height: target.height,
            transparent: this.compositor.transparent,
          });
          let opacity = this.layerOpacity.get(layer.id) ?? layer.opacity ?? 1;
          if (tr.active && tr.type === "crossfade") {
            opacity *= 1 - tr.progress;
          }
          this.compositor.compositeLayer(
            this.layerBlend.get(layer.id) ?? layer.blend ?? "normal",
            opacity,
          );
        }
      }
    }
    // Transition overlays via post exposure for fade-through-black
    const postOut = { ...post };
    if (tr.active) {
      if (tr.type === "fade-through-black") {
        const dim = tr.progress < 0.5 ? 1 - tr.progress * 2 : (tr.progress - 0.5) * 2;
        postOut.exposure = (postOut.exposure ?? 1) * dim;
      }
      if (tr.type === "voronoi-fracture" || tr.type === "dissolve" || tr.type === "wipe") {
        postOut.grain = (postOut.grain ?? 0.1) + tr.progress * 0.3;
        postOut.chromatic = (postOut.chromatic ?? 0) + tr.progress * 0.5;
      }
    }
    const paused = this.runtime.isSimulationPaused();
    const envelopeComplete =
      !this.animationRuntime.performanceMode &&
      (spec.endBehavior === "hold" || spec.endBehavior === "stop") &&
      animSt.phase >= 0.999 &&
      !hasComponent(spec, "generative");
    const freezePost = paused || envelopeComplete;
    if (!freezePost) this.frozenPresentT = frame.t;
    const presentT = freezePost ? this.frozenPresentT : frame.t;
    const postPresent = freezePost
      ? { ...postOut, grain: 0, feedback: 0, chromatic: 0 }
      : postOut;
    this.compositor.endFrame(
      postPresent,
      this.runtime.isBlackout(),
      presentT,
      true,
      camera,
      animSt.useSourceSnapshot,
    );
    if (animSt.freezeGenerative && !animSt.useSourceSnapshot) {
      this.compositor.capturePresentationSnapshot();
      this.animationRuntime.markSnapshotReady(this.pixelDigest);
    }
    if (animSt.sourceDigest) {
      this.animationRuntime.noteSourceDigest(animSt.sourceDigest);
    }
    this.presentCount += 1;
  }

  getFeatures(): AudioFeatures {
    return { ...this.features };
  }

  getHud(): HudStats {
    return { ...this.hud };
  }

  getLivePieceIds(): string[] {
    return LIVE_PIECE_IDS;
  }

  semanticDigest(): string {
    const scene = this.runtime.getScene();
    const snap = this.runtime.transport.getSnapshot();
    const parts = [
      scene?.id ?? "none",
      this.runtime.getSceneIndex().toString(),
      snap.beat.toFixed(3),
      this.runtime.isBlackout() ? "1" : "0",
      this.features.energy.toFixed(3),
      this.features.onset ? "1" : "0",
      String(this.runtime.getFrame()),
    ];
    // FNV-1a style
    let h = 2166136261;
    const s = parts.join("|");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  private emitStatus(extra: Record<string, unknown> = {}): void {
    this.onStatus?.({
      scene: this.runtime.getScene()?.id,
      sceneIndex: this.runtime.getSceneIndex(),
      set: this.runtime.getSet()?.set_id,
      setName: this.runtime.getSet()?.name,
      blackout: this.runtime.isBlackout(),
      recording: this.recorder.isRecording(),
      transport: this.runtime.transport.getSnapshot(),
      audioActive: this.audio.isActive(),
      audioStatus: this.audio.statusMessage,
      audioDevice: this.audio.getSelectedDeviceId(),
      audioPermission: this.audio.status,
      midiDevices: this.midi.listDevices(),
      latencyMs: this.audio.latencyMs,
      ...extra,
    });
  }

  setSeed(seed: number): void {
    this.runtime.setSeed(seed);
  }

  async dispose(): Promise<void> {
    this.stopLoop();
    this.runtime.clearPieces();
    await this.audio.stop();
  }
}

/** Bind set cues that declare MIDI to the mapper. */
export function installSetMidiCues(session: LiveSession, set: SetDef): void {
  for (const cue of set.cues ?? []) {
    if (!cue.midi) continue;
    if (cue.midi.type === "note") {
      session.midiMapper.bindings.push({
        id: `cue-${cue.id}`,
        type: "note",
        channel: cue.midi.channel,
        note: cue.midi.number,
        target: `cue.${cue.id}`,
        mode: "cue",
      });
    } else {
      session.midiMapper.bindings.push({
        id: `cue-${cue.id}`,
        type: "cc",
        channel: cue.midi.channel,
        controller: cue.midi.number,
        target: `cue.${cue.id}`,
        mode: "continuous",
      });
    }
  }
}
