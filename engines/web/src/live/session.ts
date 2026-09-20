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

  async loadSet(set: SetDef, liveMode: "animate" | "react" = "animate"): Promise<void> {
    this.runtime.clearPieces();
    this.runtime.loadSet(set);
    await this.rebuildScenePieces(liveMode);
    this.emitStatus();
  }

  private async rebuildScenePieces(liveMode: "animate" | "react" = "animate"): Promise<void> {
    const scene = this.runtime.getScene();
    if (!scene) return;
    this.runtime.clearPieces();
    this.baseParams.clear();
    this.layerOpacity.clear();
    this.layerBlend.clear();
    this.layerEnabled.clear();
    this.layerRenderOrder = [];
    const gl = this.compositor.gl;
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
    this.compositor.resize(w, h);
    this.canvas.width = w;
    this.canvas.height = h;

    let loaded = 0;
    for (const layer of scene.layers) {
      let piece;
      try {
        piece = await createLivePiece(gl, layer.piece, liveMode);
      } catch (err) {
        if (err instanceof UnsupportedLivePieceError) {
          throw new Error(`${layer.piece}: ${err.message}`);
        }
        throw err;
      }
      loaded += 1;
      const seed = layer.seed ?? this.runtime.getSeed();
      await piece.initialize({ piece: layer.piece }, seed);
      piece.resize(w, h);
      if (layer.parameters) {
        for (const [k, v] of Object.entries(layer.parameters)) {
          piece.setParameter(k, v);
        }
      }
      this.runtime.registerPiece(layer.id, piece);
      this.baseParams.set(layer.id, { ...piece.getBaseParameters() });
      this.layerOpacity.set(layer.id, layer.opacity ?? 1);
      this.layerBlend.set(layer.id, layer.blend ?? "normal");
      this.layerEnabled.set(layer.id, true);
      this.layerRenderOrder.push(layer.id);
    }
    this.basePost = { ...(scene.post ?? {}) };
    this.postFrame = { ...this.basePost };
    this.modulation.setMappings(this.sceneMappings(scene));
    this.compositor.resetFeedback();
    if (loaded === 0) {
      throw new Error("No live runtimes loaded for scene");
    }
  }

  /** Paint one or more logical frames immediately (Studio first-frame guarantee). */
  paintFrames(count = 2, wallNowMs = performance.now()): void {
    for (let i = 0; i < count; i++) {
      this.frame(wallNowMs + i * (1000 / 60));
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
    for (const { layerId, spec } of entries) {
      const rt = new AnimationRuntime(spec);
      rt.performanceMode = true;
      this.overlayAnimationRuntimes.set(layerId, rt);
    }
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
      this.gotoRelative(1);
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

  async gotoScene(indexOrId: number | string): Promise<void> {
    const before = this.runtime.getScene()?.id;
    this.runtime.gotoScene(indexOrId);
    const after = this.runtime.getScene()?.id;
    if (after && after !== before) {
      const snap = this.runtime.transport.getSnapshot();
      this.recorder.pushEvent({
        type: "scene",
        t: this.runtime.getFrame() / 60,
        beat: snap.beat,
        scene_id: after,
      });
      await this.rebuildScenePieces();
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
    const gl = this.compositor.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const raw = new Uint8Array(Math.max(1, cw * ch * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, raw);
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
    if (wallNowMs - this.lastDigestSampleMs > 250) {
      this.lastDigestSampleMs = wallNowMs;
      try {
        // Digest-only — do not advance the comparison chain used by tests/diagnostics.
        this.readPresentedPixels(64, 36, false);
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
    const post = this.postFrame.exposure != null || Object.keys(this.postFrame).length
      ? this.postFrame
      : this.basePost;
    const tr = this.runtime.getTransition();
    const animSt = this.animationRuntime.evaluate();
    const spec = this.animationRuntime.spec;
    const cameraActive = hasComponent(spec, "camera");
    const camera = cameraActive ? animSt.camera : null;

    if (!animSt.useSourceSnapshot) {
      this.compositor.beginFrame();
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
          opacity *= tr.progress;
        }
        this.compositor.compositeLayer(
          this.layerBlend.get(layer.id) ?? layer.blend ?? "normal",
          opacity,
        );
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
