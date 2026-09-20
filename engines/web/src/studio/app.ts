/**
 * NUMBRANE Studio — Generate / Animate / React visual instrument.
 */

import { LiveSession } from "../live/session";
import type { BlendMode, SetDef, QualityProfile, ResolutionPreset as LiveRes } from "../live/types";
import { createLivePiece } from "../live/pieces/registry";
import {
  createStudioRegistry,
  type CommandContext,
  type StudioMode,
} from "./keyboard/registry";
import { ExploreHistory, loadPrefs, savePrefs, type StudioPrefs } from "./prefs";
import { fetchPieceCatalog, type PieceInfo } from "./catalog";
import {
  filterPerformanceCatalog,
  performanceMeta,
  type PerformanceBrowserFilter,
} from "./performance/catalog";
import {
  loadThumbQueue,
  thumbCacheKey,
  type BrowserThumbQueueStats,
} from "./performance/browserThumbs";
import { classifyVisualQuality, snapshotFromFrame } from "../live/visualQuality";
import { BrowserPreviewSession } from "./performance/browserPreviewSession";
import { BUILD_SHA, BUILD_TIME, buildInfoLine } from "./buildInfo";
import {
  resolveStudioDescriptor,
  type StudioPieceDescriptor,
} from "./descriptor/resolve";
import {
  moreLikeThis,
  generateSeries,
  applyMetaAxis,
  type MetaAxis,
} from "./explore/variants";
import { COMPOSITIONS, compositionById } from "./compositions";
import { presetsForPiece } from "./presets";
import {
  animationCapabilitiesFor,
  defaultSpecForPiece,
  normalizeSpecForPiece,
} from "./animation/capabilities";
import { panPresetViews } from "./animation/camera";
import {
  RANDOM_METHOD_ID,
  animationMethodsForPiece,
  applyAnimationMethod,
  defaultAnimationMethodId,
} from "./animation/methods";
import { RandomAnimationSequencer } from "./animation/randomSequencer";
import {
  defaultLayerLiveMethodId,
  normalizeSpecForLivePerformance,
  resolveLivePerformanceMethodSpec,
  VisualSwitchSequencer,
  type PerformanceTransition,
} from "./animation/performance";
import {
  exportLoopFlag,
  hasComponent,
  type AnimationEasing,
  type AnimationEndBehavior,
  type AnimationSource,
  type AnimationSpec,
  type CameraView,
  type PanPreset,
} from "./animation/spec";
import {
  applyPreviewCameraStyle,
  samplePreviewImageGrid,
} from "./animate/apiPreviewPresent";
import { PFL_STYLES, applyStyle, type MutationScale } from "./style/pfl";
import {
  emptyPack,
  itemFromLook,
  loadPackDraft,
  savePackDraft,
  reorderItems,
  STILL_PRESETS,
  ANIM_PRESETS,
  slugify,
  fetchPackFixture,
  type PflPack,
  type PackItem,
  type PackItemKind,
} from "./pack/types";
import { exportPackApi, loadPackManifest } from "./pack/api";
import type { ReactSensitivity } from "./audio/profiles";
import { apiExportAnimation, webpIsAnimated } from "./export/api";
import { encodeAnimationJob } from "./export/animationJobs";
import { animationExportBackend } from "./export/exportBackend";
import { captureRuntimeFrames, type RuntimeExportState } from "./export/runtimeExport";
import {
  defaultColorConfig,
  normalizeColorConfig,
  type ColorConfig,
  hexToHueTurn,
} from "./color/model";
import { RAMP_PRESETS, RAMP_PRESET_LIST, SOLID_PRESETS, rampMappingsForPiece } from "./color/presets";
import type { GenerateRequest } from "./generate/preview";
import {
  RESOLUTION_PRESETS,
  canvasToPngBlob,
  exportStillPng,
  exportAnimation,
  exportSvgText,
  downloadBlob,
  type AnimationExportConfig,
} from "./export/formats";
import {
  listSeeds,
  saveSeed,
  getSeed,
  newSeedId,
  float32ToBase64,
  base64ToFloat32,
  type StudioSeedRecord,
} from "./seed/library";
import { defaultMappingsForPiece } from "./audio/mappings";
import { GeneratePreviewController } from "./generate/preview";
import { BufferedFrameAnimationController } from "./animate/controller";
import {
  defaultsForPiece,
  getPieceRuntime,
  isBrowserNativeAnimate,
  supportsMode,
} from "./runtime/registry";
import { buildMashupSet } from "./mashups";
import {
  cryptoSeed,
  paramsForApi,
  previewSize,
  rendererKindFor,
  studioSurface,
} from "./runtime/surface";

declare global {
  interface Window {
    __NUMBRANE_STUDIO__?: StudioApp;
  }
}

function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

export class StudioApp {
  readonly canvas: HTMLCanvasElement;
  readonly registry = createStudioRegistry();
  session: LiveSession | null = null;
  prefs: StudioPrefs;
  history: ExploreHistory;
  pieces: PieceInfo[] = [];
  mode: StudioMode = "generate";
  pieceId = "geometry/metatron";
  seed = 42;
  frame = 0;
  playing = true;
  controlsVisible = true;
  helpVisible = false;
  hudVisible = false;
  browserVisible = false;
  performanceFilter: PerformanceBrowserFilter = "curated";
  locked = new Set<string>();
  pflStyleId = "";
  mutationScale: MutationScale = "moderate";
  reactSensitivity: ReactSensitivity = "balanced";
  sessionFavorites: Array<{ seed: number; parameters: Record<string, number> }> = [];
  sessionRejects: number[] = [];
  /** Captured live sim state for Generate → Animate continuity. */
  private pendingImportState: {
    arrays?: Record<string, Float32Array>;
    shapes?: Record<string, number[]>;
    json?: Record<string, unknown>;
  } | null = null;
  params: Record<string, number | string | boolean> = {
    chaos: 0.3,
    density: 0.7,
    zoom: 1,
    hue: 0.08,
    exposure: 1,
    rotation: 0,
  };
  color: ColorConfig = defaultColorConfig();
  meta: Record<MetaAxis, number> = {
    density: 0.7,
    chaos: 0.3,
    organic: 0.4,
    kinetic: 0.5,
    saturated: 0.55,
    massive: 0.5,
  };
  anim: AnimationExportConfig = {
    width: 1280,
    height: 720,
    fps: 30,
    durationSec: 4,
    startFrame: 0,
    loop: true,
    quality: 0.8,
  };
  exportPreset = "1080p";
  exportKind: "still" | "animated" | "video" = "still";
  animFormat: "webp" | "apng" | "webm" | "gif" = "webp";
  variantBatch = 12;
  variantCache: Array<{
    seed: number;
    parameters: Record<string, number>;
    label: string;
    thumbUrl: string | null;
  }> = [];
  animationSpec: AnimationSpec = defaultSpecForPiece("fractals/sdf-raymarch2d");
  animationMethodId = "pan-left-right";
  /** Resolved method id when animationMethodId is random or composite. */
  activeAnimationMethodId = "pan-left-right";
  animationSequenceSeed = 137;
  randomIntervalSec = 10;
  randomAllowedMethodIds: string[] = [];
  visualSwitchMode: "off" | "random" = "off";
  visualSwitchIntervalSec = 30;
  visualSequenceSeed = 137;
  pieceTransition: PerformanceTransition = "crossfade";
  /** Visible crossfade duration (ms) — hold overlay fades while incoming stage is live. */
  private readonly visualCrossfadeMs = 680;
  performanceFavorites: string[] = [];
  performanceCycleFavoritesOnly = false;
  performanceCyclePackOrder = false;
  private browserPreview: BrowserPreviewSession | null = null;
  private browserMotionTimer: number | null = null;
  private browserMotionPieceId: string | null = null;
  private browserThumbFailed = new Set<string>();
  private browserThumbLiveOnly = new Set<string>();
  private randomSequencer: RandomAnimationSequencer | null = null;
  private visualSequencer: VisualSwitchSequencer | null = null;
  private lastRandomTickMs = 0;
  private lastVisualSwitchMs = 0;
  private lastAnimTickMs = 0;
  private apiPreviewPresentGrid: Uint8Array | null = null;
  private apiPreviewPresentStats: import("../live/pixelMetrics").PixelFrame | null = null;
  compositionId: string | null = null;
  pack: PflPack = loadPackDraft() ?? emptyPack("Midnight PFL Pack");
  packPanelOpen = false;
  audioEnabled = false;
  audioLevel = 0;
  currentSeedId: string | null = null;
  recipeDigest = "";
  renderDigest = "";
  lastRenderMs = 0;
  generating = false;
  unsupportedMessage = "";
  private idleTimer: number | null = null;
  private raf = 0;
  private lastHud = 0;
  private fps = 60;
  private frameTimes: number[] = [];
  private preview = new GeneratePreviewController();
  private apiAnim: BufferedFrameAnimationController | null = null;
  private animUpdateFps = 0;
  private animBackend = "";
  private displayedFrame = 0;
  private webglStatus = "—";
  private stallError = "";
  private lastVisualChangeMs = Date.now();
  private pieceLoadedAt = Date.now();
  private lastVisualDigest = "";
  private descriptors = new Map<string, StudioPieceDescriptor>();
  private browserThumbUrls = new Map<string, string>();
  private browserThumbCacheKeys = new Map<string, string>();
  private browserThumbAbort: AbortController | null = null;
  private browserThumbLoadEpoch = 0;
  browserThumbStats: BrowserThumbQueueStats = {
    requested: 0,
    loaded: 0,
    liveOnly: 0,
    failed: 0,
    aborted: 0,
    inFlight: 0,
    failures: [],
  };
  /** True after `boot()` finishes (catalog, scene, chrome). E2E must wait before driving UI. */
  studioBootComplete = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.prefs = loadPrefs();
    this.mode = this.prefs.mode;
    this.pieceId = this.prefs.pieceId;
    this.seed = this.prefs.seed;
    if (this.prefs.color) this.color = normalizeColorConfig(this.prefs.color);
    this.params.hue = hexToHueTurn(this.color.primary.value);
    this.controlsVisible = this.prefs.controlsVisible;
    this.history = new ExploreHistory(this.prefs.recent);
    this.performanceFavorites = [...this.prefs.performanceShortlist];
    this.performanceCycleFavoritesOnly = this.prefs.performanceCycleShortlistOnly;
    this.performanceCyclePackOrder = this.prefs.performanceCyclePackOrder;
  }

  async boot(): Promise<void> {
    try {
      this.pieces = await fetchPieceCatalog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Catalog load failed: ${msg}`);
      this.pieces = [];
    }
    this.descriptors.clear();
    for (const p of this.pieces) {
      try {
        this.descriptors.set(p.piece_id, resolveStudioDescriptor(p));
      } catch (err) {
        console.error(`descriptor resolve failed for ${p.piece_id}`, err);
      }
    }

    this.session = new LiveSession({
      canvas: this.canvas,
      seed: this.seed,
      outputOnly: false,
      transparent: false,
      stageViewportFit: true,
    });
    await this.session.init();
    this.params = { ...defaultsForPiece(this.pieceId), ...this.params };
    this.animationMethodId = defaultAnimationMethodId(this.pieceId);
    this.activeAnimationMethodId = this.animationMethodId;
    this.animationSpec = resolveLivePerformanceMethodSpec(
      this.pieceId,
      this.animationMethodId,
      this.mode,
    );
    await this.applyPieceScene();

    this.wireKeyboard();
    this.wireModebar();
    this.wirePerformanceStrip();
    this.wirePointerIdle();
    this.renderConfig();
    this.renderHelp();
    this.renderBrowser();
    this.syncModebarState();
    this.syncChrome();
    this.syncUrl(false);
    this.pushHistory();

    this.loop();
    this.studioBootComplete = true;
    window.__NUMBRANE_STUDIO__ = this;
    toast("NUMBRANE Studio — press ? for keys");
  }

  getAnimationDiagnostics(): Record<string, unknown> {
    const kind = rendererKindFor(this.pieceId, this.mode) ?? "unsupported";
    const diag = this.session?.getDiagnostics();
    return {
      piece: this.pieceId,
      backend: kind,
      animBackend: this.animBackend || kind,
      mode: this.mode,
      surface: studioSurface(this.pieceId, this.mode),
      playing: this.playing,
      visualFps: this.fps,
      rafCount: diag?.rafCount ?? 0,
      rafHz: diag?.rafHz ?? 0,
      rafStalled: diag?.rafStalled ?? false,
      tickCount: diag?.tickCount ?? 0,
      logicalFrame: diag?.logicalFrame ?? this.frame,
      updateCount: diag?.updateCount ?? 0,
      renderCount: diag?.renderCount ?? 0,
      presentCount: diag?.presentCount ?? 0,
      pixelDigest: diag?.pixelDigest ?? "",
      presentedFrame: diag?.presentedFrame ?? null,
      lastSuccessfulDrawMs: diag?.lastSuccessfulDrawMs ?? 0,
      simulationPaused: diag?.simulationPaused ?? false,
      transportPlaying: diag?.transportPlaying ?? false,
      webglError: diag?.webglError ?? this.webglStatus,
      canvasWidth: diag?.canvasWidth ?? this.canvas.width,
      canvasHeight: diag?.canvasHeight ?? this.canvas.height,
      visibleCssWidth: diag?.visibleCssWidth ?? 0,
      visibleCssHeight: diag?.visibleCssHeight ?? 0,
      stallError: this.stallError,
      animationTimeSec: this.session?.animationRuntime.animationTimeSec ?? 0,
      animationPhase:
        this.session?.animationRuntime.evaluate().phase ?? 0,
      animationDurationSec: this.session?.animationRuntime.spec.durationSec ?? 0,
      animationEndBehavior: this.session?.animationRuntime.spec.endBehavior ?? "continuous",
      animationSource: this.session?.animationRuntime.spec.source ?? "generative",
      animationMethodId: this.animationMethodId,
      activeAnimationMethodId: this.activeAnimationMethodId,
      useSourceSnapshot:
        this.session?.animationRuntime.evaluate().useSourceSnapshot ?? false,
      performanceMode: this.session?.animationRuntime.performanceMode ?? false,
      animationCyclePhase:
        this.session?.animationRuntime.evaluate().cyclePhase ?? 0,
      visualLiveness: diag?.visualLiveness ?? null,
      visualQuality: (() => {
        const pf = diag?.presentedFrame;
        if (!pf) return null;
        const meta = performanceMeta(this.pieceId);
        return classifyVisualQuality(
          snapshotFromFrame(pf),
          {
            density: meta?.density ?? "medium",
            motion: meta?.motion ?? "moderate",
          },
          (Date.now() - this.lastVisualChangeMs) / 1000,
          this.playing,
          (Date.now() - this.pieceLoadedAt) / 1000,
        );
      })(),
      browserThumbStats: { ...this.browserThumbStats },
      cameraCenterX: this.session?.animationRuntime.evaluate().camera.centerX ?? 0,
      cameraCenterY: this.session?.animationRuntime.evaluate().camera.centerY ?? 0,
      compositionId: this.compositionId,
      layerStates: this.session?.getLayerPerformanceStates() ?? [],
      framePacing: this.session?.getFramePacingSnapshot() ?? null,
      primaryLiveSessionCount: this.getPrimaryLiveSessionCount(),
      buildSha: BUILD_SHA,
      buildTime: BUILD_TIME,
    };
  }

  /** Live solid color update without scene reload (tests + picker). */
  setSolidColor(hex: string): void {
    if (this.locked.has("color")) return;
    this.color.primary.value = hex;
    this.color.mode = "solid";
    this.applyLiveColor();
    this.renderConfig();
  }

  sampleStageScopeMetrics(): {
    borderMeanLuma: number;
    innerMeanLuma: number;
    corners: { tl: number; tr: number; bl: number; br: number };
  } | null {
    if (!this.session || studioSurface(this.pieceId, this.mode) !== "live") return null;
    try {
      return this.session.readPresentedScopeMetrics();
    } catch {
      return null;
    }
  }

  /** Sample visible presented art (live canvas or api-preview img) for tests/diagnostics. */
  samplePresentedPixels(gridW = 64, gridH = 36): import("../live/pixelMetrics").PixelFrame | null {
    const hold = document.getElementById("switch-hold") as HTMLImageElement | null;
    if (hold?.classList.contains("visible") && hold.complete && hold.naturalWidth > 0) {
      const prior =
        this.apiPreviewPresentGrid && this.apiPreviewPresentStats
          ? { pixels: this.apiPreviewPresentGrid, stats: this.apiPreviewPresentStats }
          : undefined;
      const sampled = samplePreviewImageGrid(
        hold,
        gridW,
        gridH,
        { centerX: 0, centerY: 0, scale: 1, rotation: 0 },
        prior,
      );
      if (sampled) {
        this.apiPreviewPresentGrid = sampled.grid;
        this.apiPreviewPresentStats = sampled.stats;
        return sampled.stats;
      }
    }
    return this.sampleIncomingPresentedPixels(gridW, gridH);
  }

  private sampleIncomingPresentedPixels(
    gridW = 64,
    gridH = 36,
  ): import("../live/pixelMetrics").PixelFrame | null {
    const surface = studioSurface(this.pieceId, this.mode);
    if (surface === "live" && this.session) {
      try {
        return this.session.readPresentedPixels(gridW, gridH);
      } catch {
        return null;
      }
    }
    if (surface === "api-preview") {
      return this.samplePreviewImagePixels(gridW, gridH);
    }
    return null;
  }

  private samplePreviewImagePixels(
    gridW: number,
    gridH: number,
  ): import("../live/pixelMetrics").PixelFrame | null {
    const img = document.getElementById("generate-preview") as HTMLImageElement | null;
    if (!img?.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return null;
    let camera: CameraView = { centerX: 0, centerY: 0, scale: 1, rotation: 0 };
    if (this.mode === "animate" && this.apiPreviewUsesCamera() && this.session) {
      camera = this.session.animationRuntime.evaluate().camera;
    }
    const prior =
      this.apiPreviewPresentGrid && this.apiPreviewPresentStats
        ? { pixels: this.apiPreviewPresentGrid, stats: this.apiPreviewPresentStats }
        : undefined;
    const sampled = samplePreviewImageGrid(img, gridW, gridH, camera, prior);
    if (!sampled) return null;
    this.apiPreviewPresentGrid = sampled.grid;
    this.apiPreviewPresentStats = sampled.stats;
    return sampled.stats;
  }

  pinPixelBaseline(): void {
    if (!this.session || studioSurface(this.pieceId, this.mode) !== "live") return;
    this.session.readPresentedPixels(64, 36, true);
    this.session.pinPresentedBaseline();
  }

  comparePixelBaseline(): number | null {
    if (!this.session || studioSurface(this.pieceId, this.mode) !== "live") return null;
    return this.session.comparePresentedToBaseline(64, 36);
  }

  private ensureAnimateTransport(): void {
    if (this.mode !== "animate" && this.mode !== "react") return;
    this.playing = true;
    this.session?.runtime.setSimulationPaused(false);
    this.session?.runtime.transport.start();
  }

  /** Studio Animate/React: unbounded live clock — never freeze generative sim for camera-only methods. */
  private applyStudioPerformanceClock(): void {
    if (!this.session) return;
    if (this.mode !== "animate" && this.mode !== "react") return;
    if (studioSurface(this.pieceId, this.mode) !== "live") return;
    this.session.animationRuntime.performanceMode = true;
  }

  private kickLiveSurface(): void {
    if (!this.session || studioSurface(this.pieceId, this.mode) !== "live") return;
    this.session.ensureLoopRunning();
    // One immediate present — ongoing motion must come from RAF, not repeated paintFrames().
    this.session.frame(performance.now());
    const stats = this.session.getDiagnostics().presentedFrame;
    if (stats?.digest) {
      this.lastVisualDigest = stats.digest;
      this.lastVisualChangeMs = Date.now();
    }
  }

  syncAnimationSpecToSession(preview = true, opts?: { resetTime?: boolean }): void {
    if (!this.session || this.mode !== "animate") return;
    this.animationSpec = normalizeSpecForLivePerformance(
      this.pieceId,
      this.animationSpec,
      this.mode,
    );
    this.anim.loop = exportLoopFlag(this.animationSpec.endBehavior);
    const livePerf =
      studioSurface(this.pieceId, this.mode) === "live" &&
      (this.mode === "animate" || this.mode === "react");
    this.session.setAnimationSpec(this.animationSpec, {
      preserveTime: opts?.resetTime !== true,
      performanceMode: livePerf,
    });
    this.applyStudioPerformanceClock();
    if (studioSurface(this.pieceId, this.mode) === "api-preview") {
      this.syncApiPreviewAnimate(preview);
      return;
    }
    if (preview) this.kickLiveSurface();
  }

  private apiPreviewUsesCamera(): boolean {
    return (
      hasComponent(this.animationSpec, "camera") && !hasComponent(this.animationSpec, "generative")
    );
  }

  private syncApiPreviewAnimate(preview: boolean): void {
    if (this.apiPreviewUsesCamera()) {
      this.stopApiAnim();
      const img = document.getElementById("generate-preview") as HTMLImageElement | null;
      if (!img?.src && preview) {
        this.scheduleGeneratePreview(true);
      } else if (img?.complete && img.naturalWidth > 0) {
        this.session?.animationRuntime.markSnapshotReady(this.renderDigest || "api-preview");
      }
      this.lastAnimTickMs = 0;
      this.session?.animationRuntime.seekTime(0);
      return;
    }
    if (hasComponent(this.animationSpec, "generative") && this.playing) {
      this.startApiAnim();
    }
  }

  private paintApiPreviewCamera(camera: CameraView): void {
    const img = document.getElementById("generate-preview") as HTMLImageElement | null;
    if (!img) return;
    applyPreviewCameraStyle(img, camera);
  }

  /** Test/export helper — GENERATE snapshot via the piece's authoritative backend. */
  async captureGeneratePngBytes(): Promise<{
    ok: boolean;
    status?: number;
    error?: string;
    bytes?: Uint8Array;
  }> {
    const surface = studioSurface(this.pieceId, "generate");
    if (surface === "api-preview") {
      const { width, height } = previewSize();
      try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            piece: this.pieceId,
            seed: this.seed,
            frame: this.frame,
            width,
            height,
            format: "png",
            quality: "preview",
            parameters: paramsForApi(this.params, this.color),
          }),
        });
        if (!res.ok) {
          return { ok: false, status: res.status, error: await res.text() };
        }
        return { ok: true, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (surface === "live" && this.session) {
      try {
        this.kickLiveSurface();
        if (rendererKindFor(this.pieceId, "generate") === "wasm") {
          for (let i = 0; i < 12; i++) {
            this.session.frame(performance.now());
            await new Promise((r) => setTimeout(r, 40));
          }
        } else {
          await new Promise((r) => setTimeout(r, 500));
        }
        const blob = await canvasToPngBlob(this.canvas);
        return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: false, error: `unsupported generate surface: ${surface}` };
  }

  private applyLiveColor(reloadScene = false): void {
    this.syncColorToParams();
    if (reloadScene || studioSurface(this.pieceId, this.mode) !== "live" || !this.session) {
      void this.applyPieceScene();
      return;
    }
    const scene = this.session.runtime.getScene();
    if (!scene) return;
    for (const layer of scene.layers) {
      const piece = this.session.runtime.getPiece(layer.id) as
        | { setColorConfig?: (c: ColorConfig) => void; setParameter?: (n: string, v: number) => void }
        | undefined;
      piece?.setColorConfig?.(this.color);
      if (typeof this.params.hue === "number") {
        piece?.setParameter?.("hue", Number(this.params.hue));
      }
    }
    this.kickLiveSurface();
    this.persist();
  }

  private async applyPieceScene(): Promise<void> {
    this.hideBrowserMotionPane();
    await this.browserPreview?.teardown();
    this.stopApiAnim();
    const surface = studioSurface(this.pieceId, this.mode);
    const previewEl = document.getElementById("generate-preview") as HTMLImageElement | null;
    const statusEl = document.getElementById("gen-status");
    if (surface === "unsupported") {
      this.session?.runtime.transport.stop();
      this.canvas.classList.add("hidden-live");
      previewEl?.classList.remove("visible");
      statusEl?.classList.remove("visible");
      this.showModeUnsupported(this.mode);
      this.syncChrome();
      this.syncModebarState();
      return;
    }
    this.clearFailureBanner();

    if (surface === "api-preview") {
      this.session?.runtime.transport.stop();
      this.session?.runtime.setSimulationPaused(true);
      this.canvas.classList.add("hidden-live");
      previewEl?.classList.add("visible");
      this.animBackend = "buffered-api";
      if (this.mode === "animate" && this.playing) {
        this.syncApiPreviewAnimate(true);
      } else {
        this.stopApiAnim({ abort: this.mode !== "animate" });
        this.scheduleGeneratePreview();
      }
      this.syncChrome();
      return;
    }

    // Live surface (ANIMATE/REACT stateful, wasm, geometry-ir, shader-native)
    this.stopApiAnim({ abort: true });
    this.preview.cancel();
    this.canvas.classList.remove("hidden-live");
    previewEl?.classList.remove("visible");
    statusEl?.classList.remove("visible");
    this.animBackend = String(rendererKindFor(this.pieceId, this.mode) ?? "live");
    if (!this.session) return;

    const mappings =
      this.mode === "react"
        ? defaultMappingsForPiece(this.pieceId, this.reactSensitivity).map((m, i) => ({
            id: `studio-${i}`,
            source: m.source.startsWith("audio.") ? m.source : `audio.${m.source}`,
            destination: `layer.L0.${m.target}`,
            amount: m.amount,
            min: 0,
            max: 2,
          }))
        : [];
    const composition = this.compositionId ? compositionById(this.compositionId) : undefined;
    const liveMode = this.mode === "react" ? "react" : "animate";
    const apiParams = paramsForApi(this.params, this.color);
    const mashupSet = buildMashupSet(this.pieceId, this.seed, apiParams);
    const set: SetDef = composition
      ? composition.build(this.seed, this.params)
      : mashupSet ?? {
          protocol_version: "0.1.0",
          set_id: "studio-session",
          name: "Studio",
          scenes: [
            {
              id: "main",
              name: this.pieceId,
              layers: [
                {
                  id: "L0",
                  piece: this.pieceId,
                  opacity: 1,
                  blend: "normal",
                  seed: this.seed,
                  parameters: apiParams,
                },
              ],
              modulation: mappings,
              post: { bloom: 0.2, feedback: 0.05 },
            },
          ],
          cues: [],
        };
    if (set.scenes[0] && (!set.scenes[0].modulation || set.scenes[0].modulation.length === 0)) {
      set.scenes[0].modulation = mappings;
    }
    try {
      await this.session.loadSet(set, liveMode);
    } catch (err) {
      const backend = String(rendererKindFor(this.pieceId, this.mode) ?? "unknown");
      if (this.mode === "animate" || this.mode === "react") {
        this.showAnimationFailed(err, backend);
      } else {
        this.showFailureBanner(
          "Scene load failed",
          `Piece: ${this.pieceId}\nBackend: ${backend}\nError: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }
    this.session.setSeed(this.seed);
    for (const layer of set.scenes[0]?.layers ?? []) {
      for (const [k, v] of Object.entries(this.params)) {
        if (typeof v === "number") {
          this.session.runtime.getPiece(layer.id)?.setParameter(k, v);
        }
      }
      const lp = this.session.runtime.getPiece(layer.id) as
        | { setColorConfig?: (c: ColorConfig) => void }
        | undefined;
      lp?.setColorConfig?.(this.color);
    }
    if (this.pendingImportState) {
      const piece = this.session.runtime.getPiece("L0") as
        | {
            importState?: (s: {
              arrays?: Record<string, Float32Array>;
              shapes?: Record<string, number[]>;
              json?: Record<string, unknown>;
            }) => void;
          }
        | undefined;
      try {
        piece?.importState?.(this.pendingImportState);
      } catch {
        /* optional continuity */
      }
      this.pendingImportState = null;
    }
    this.syncColorToParams();
    this.session.ensureLoopRunning();
    if (this.mode === "generate") {
      this.playing = false;
      this.session.runtime.transport.stop();
      this.session.runtime.setSimulationPaused(true);
    } else if (this.mode === "animate" || this.mode === "react") {
      this.ensureAnimateTransport();
    } else if (this.playing) {
      this.session.runtime.setSimulationPaused(false);
      this.session.runtime.transport.start();
    } else {
      this.session.runtime.setSimulationPaused(true);
      this.session.runtime.transport.stop();
    }
    if (this.mode === "animate") {
      this.animationSpec = resolveLivePerformanceMethodSpec(
        this.pieceId,
        this.animationMethodId,
        this.mode,
      );
      this.anim.durationSec = this.animationSpec.durationSec;
      this.anim.loop = exportLoopFlag(this.animationSpec.endBehavior);
      this.session.setAnimationSpec(this.animationSpec, {
        preserveTime: false,
        performanceMode: true,
      });
      this.applyStudioPerformanceClock();
      this.session.paintFrames(4, performance.now());
    } else if (this.mode === "react") {
      this.applyStudioPerformanceClock();
    }
    this.session.fitStageViewport();
    this.syncCompositionLayerAnimations();
    this.kickLiveSurface();
    this.stallError = "";
    this.pieceLoadedAt = Date.now();
    this.lastVisualChangeMs = Date.now();
    this.frame = this.session.runtime.getFrame();
    this.webglStatus = "ok";
    this.syncChrome();
  }

  private scheduleGeneratePreview(immediate = false): void {
    if (studioSurface(this.pieceId, this.mode) !== "api-preview") return;
    const { width, height } = previewSize();
    const baseParams = paramsForApi(this.params, this.color);
    const img = document.getElementById("generate-preview") as HTMLImageElement | null;
    const status = document.getElementById("gen-status");

    const paint = (result: import("./generate/preview").GenerateResult, label: string) => {
      this.recipeDigest = result.recipeDigest;
      this.renderDigest = result.renderDigest;
      this.lastRenderMs = result.renderMs;
      if (img) {
        img.src = result.objectUrl;
        img.classList.add("visible");
        if (this.mode === "animate" && this.apiPreviewUsesCamera()) {
          img.style.transform = "";
          this.session?.animationRuntime.markSnapshotReady(result.renderDigest);
        }
      }
      if (status) status.textContent = label;
      this.syncChrome();
    };

    const draftReq: GenerateRequest = {
      piece: this.pieceId,
      seed: this.seed,
      frame: this.frame,
      width: Math.max(160, Math.floor(width * 0.45)),
      height: Math.max(90, Math.floor(height * 0.45)),
      quality: "draft",
      parameters: baseParams,
    };
    const previewReq: GenerateRequest = {
      piece: this.pieceId,
      seed: this.seed,
      frame: this.frame,
      width,
      height,
      quality: "preview",
      parameters: baseParams,
    };

    const runPreview = () => {
      void this.preview.run(
        previewReq,
        () => {
          this.generating = true;
          status?.classList.add("visible");
          if (status) status.textContent = "Refining preview…";
        },
        (result) => {
          this.generating = false;
          status?.classList.remove("visible");
          paint(result, "");
        },
        (err) => {
          this.generating = false;
          status?.classList.remove("visible");
          this.showGenerationFailed(err, "python-api");
        },
      );
    };

    if (immediate) {
      void this.preview.run(
        previewReq,
        () => {
          this.generating = true;
          status?.classList.add("visible");
          if (status) status.textContent = "Generating…";
        },
        (result) => {
          this.generating = false;
          status?.classList.remove("visible");
          paint(result, "");
        },
        (err) => {
          this.generating = false;
          status?.classList.remove("visible");
          this.showGenerationFailed(err, "python-api");
        },
      );
      return;
    }

    // Progressive: draft first, then full preview replaces it
    this.preview.schedule(
      draftReq,
      160,
      () => {
        this.generating = true;
        status?.classList.add("visible");
        if (status) status.textContent = "Draft…";
      },
      (result) => {
        paint(result, "Draft — refining…");
        runPreview();
      },
      () => {
        // Draft failed — still attempt preview
        runPreview();
      },
    );
  }

  private startApiAnim(): void {
    const img = document.getElementById("generate-preview") as HTMLImageElement | null;
    const status = document.getElementById("gen-status");
    const { width, height } = previewSize();
    const base = {
      piece: this.pieceId,
      seed: this.seed,
      width: Math.max(320, Math.floor(width * 0.5)),
      height: Math.max(180, Math.floor(height * 0.5)),
      quality: "draft" as const,
      parameters: paramsForApi(this.params, this.color),
    };
    // GENERATE preview controller must not drive ANIMATE.
    this.preview.cancel();
    this.apiAnim?.dispose();
    this.apiAnim = new BufferedFrameAnimationController({
      fetchFrame: async (req, signal) => {
        const t0 = performance.now();
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            piece: req.piece,
            seed: req.seed,
            frame: req.frame,
            width: req.width,
            height: req.height,
            format: "png",
            quality: req.quality ?? "draft",
            parameters: req.parameters,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        return {
          blob,
          recipeDigest: res.headers.get("X-Numbrane-Recipe-Digest") ?? "",
          renderDigest: res.headers.get("X-Numbrane-Render-Digest") ?? "",
          renderMs: performance.now() - t0,
        };
      },
      onPaint: (result) => {
        this.generating = false;
        status?.classList.remove("visible");
        if (img) {
          img.src = result.objectUrl;
          img.classList.add("visible");
        }
        this.frame = result.logicalFrame;
        this.displayedFrame = result.logicalFrame;
        this.recipeDigest = result.recipeDigest;
        this.renderDigest = result.renderDigest;
        this.lastRenderMs = result.renderMs;
        this.syncChrome();
      },
      onError: (err) => {
        this.generating = false;
        status?.classList.remove("visible");
        const banner = document.getElementById("unsupported-banner");
        this.unsupportedMessage = `ANIMATE failed (${this.pieceId}): ${err.message.slice(0, 120)}`;
        if (banner) {
          banner.textContent = this.unsupportedMessage;
          banner.classList.add("visible");
        }
        toast(this.unsupportedMessage);
      },
      onStats: (s) => {
        this.animUpdateFps = s.updateFps;
        this.lastRenderMs = s.latencyMs;
      },
    });
    this.generating = true;
    status?.classList.add("visible");
    if (status) status.textContent = "Animating…";
    this.apiAnim.start(base, this.anim.startFrame || this.frame || 0);
  }

  private stopApiAnim(opts: { abort?: boolean } = { abort: true }): void {
    if (!this.apiAnim) return;
    if (opts.abort !== false) {
      this.apiAnim.dispose();
      this.apiAnim = null;
    } else {
      this.apiAnim.pause();
    }
  }

  private ctx(): CommandContext {
    return {
      mode: this.mode,
      controlsVisible: this.controlsVisible,
      helpVisible: this.helpVisible,
      hudVisible: this.hudVisible,
      playing: this.playing,
      fullscreen: !!document.fullscreenElement,
    };
  }

  private wireKeyboard(): void {
    this.registry.clear();
    this.registry.registerAll([
      {
        id: "help",
        keys: "?",
        match: ["?", "shift+/"],
        label: "Show/hide keyboard commands",
        group: "global",
        handler: () => {
          this.helpVisible = !this.helpVisible;
          if (this.helpVisible) this.renderHelp();
          this.syncChrome();
        },
      },
      {
        id: "controls",
        keys: "Tab",
        match: ["tab"],
        label: "Show/hide configuration",
        group: "global",
        handler: () => {
          this.controlsVisible = !this.controlsVisible;
          this.prefs.controlsVisible = this.controlsVisible;
          this.persist();
          this.syncChrome();
        },
      },
      {
        id: "mode-gen",
        keys: "1",
        match: ["1"],
        label: "GENERATE mode",
        group: "global",
        handler: () => void this.setMode("generate"),
      },
      {
        id: "mode-anim",
        keys: "2",
        match: ["2"],
        label: "ANIMATE mode",
        group: "global",
        handler: () => void this.setMode("animate"),
      },
      {
        id: "mode-react",
        keys: "3",
        match: ["3"],
        label: "REACT mode",
        group: "global",
        handler: () => void this.setMode("react"),
      },
      {
        id: "fullscreen",
        keys: "F",
        match: ["f"],
        label: "Toggle fullscreen",
        group: "global",
        handler: () => void this.toggleFullscreen(),
      },
      {
        id: "play",
        keys: "Space",
        match: ["space"],
        label: "Play / pause",
        group: "global",
        modes: ["animate", "react", "generate"],
        handler: () => this.togglePlay(),
      },
      {
        id: "random",
        keys: "R",
        match: ["r"],
        label: "Randomize seed",
        group: "global",
        handler: () => void this.randomizeSeed(),
      },
      {
        id: "restart",
        keys: "Shift+R",
        match: ["shift+r"],
        label: "Restart current seed/state",
        group: "global",
        handler: () => void this.restartState(),
      },
      {
        id: "save",
        keys: "S",
        match: ["s"],
        label: "Save Seed Artifact",
        group: "global",
        handler: () => void this.saveSeedState(),
      },
      {
        id: "export",
        keys: "E",
        match: ["e"],
        label: "Export current visual",
        group: "global",
        handler: () => void this.exportCurrent(),
      },
      {
        id: "variants",
        keys: "G",
        match: ["g"],
        label: "Generate variants / More Like This",
        group: "generate",
        handler: () => void this.exploreVariants(),
      },
      {
        id: "animate-this",
        keys: "A",
        match: ["a"],
        label: "Animate This (exact continuity)",
        group: "generate",
        handler: () => void this.animateThis(),
      },
      {
        id: "series",
        keys: "Y",
        match: ["y"],
        label: "Generate Series",
        group: "generate",
        handler: () => void this.exploreSeries(),
      },
      {
        id: "prev",
        keys: "[ / ←",
        match: ["[", "arrowleft"],
        label: "Previous visualization",
        group: "animate",
        modes: ["animate", "react"],
        handler: () => void this.cycleVisualization(-1),
      },
      {
        id: "next",
        keys: "] / →",
        match: ["]", "arrowright"],
        label: "Next visualization",
        group: "animate",
        modes: ["animate", "react"],
        handler: () => void this.cycleVisualization(1),
      },
      {
        id: "blackout",
        keys: "B",
        match: ["b"],
        label: "Blackout",
        group: "react",
        handler: () => {
          const on = !this.session?.runtime.isBlackout();
          this.session?.runtime.setBlackout(!!on);
          toast(on ? "blackout" : "blackout off");
        },
      },
      {
        id: "escape",
        keys: "Esc",
        match: ["escape"],
        label: "Close overlays / safe canvas",
        group: "global",
        handler: () => {
          if (this.helpVisible) this.helpVisible = false;
          else if (this.browserVisible) this.setBrowserVisible(false);
          else if (document.fullscreenElement) void document.exitFullscreen();
          else {
            this.controlsVisible = false;
            this.prefs.controlsVisible = false;
            this.persist();
          }
          this.syncChrome();
        },
      },
      {
        id: "hud",
        keys: "`",
        match: ["`", "~", "shift+`"],
        label: "Toggle performance HUD",
        group: "global",
        handler: () => {
          this.hudVisible = !this.hudVisible;
          this.syncChrome();
        },
      },
      {
        id: "browser",
        keys: "P",
        match: ["p"],
        label: "Piece browser",
        group: "global",
        handler: () => {
          this.toggleBrowserVisible();
        },
      },
      {
        id: "back",
        keys: "Alt+←",
        match: ["alt+arrowleft"],
        label: "History back",
        group: "generate",
        handler: () => void this.historyBack(),
      },
      {
        id: "forward",
        keys: "Alt+→",
        match: ["alt+arrowright"],
        label: "History forward",
        group: "generate",
        handler: () => void this.historyForward(),
      },
    ]);

    window.addEventListener("keydown", (e) => {
      this.registry.handle(e, this.ctx());
    });
  }

  private wireModebar(): void {
    document.querySelectorAll<HTMLButtonElement>("#modebar button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const m = btn.dataset.mode as StudioMode;
        void this.setMode(m);
      });
    });
  }

  private wirePerformanceStrip(): void {
    document.getElementById("perf-prev")?.addEventListener("click", () => void this.cyclePiece(-1));
    document.getElementById("perf-next")?.addEventListener("click", () => void this.cyclePiece(1));
    document.getElementById("perf-random")?.addEventListener("click", () => void this.cycleRandomPiece());
    document.getElementById("perf-pause")?.addEventListener("click", () => {
      this.togglePlay();
      this.syncChrome();
    });
  }

  private descriptorFor(pieceId = this.pieceId): StudioPieceDescriptor | undefined {
    return this.descriptors.get(pieceId);
  }

  private modeSupported(mode: StudioMode, pieceId = this.pieceId): boolean {
    const d = this.descriptorFor(pieceId);
    if (!d) return supportsMode(pieceId, mode);
    if (mode === "generate") return d.generate.supported;
    if (mode === "animate") return d.animate.supported;
    return d.react.supported;
  }

  /** E2E helper — show chrome and optional piece browser without keyboard side effects. */
  showChromeForTest(showBrowser = true): void {
    this.controlsVisible = true;
    if (showBrowser) this.setBrowserVisible(true);
    else this.syncChrome();
  }

  /** Authoritative mode bar — never rely on static HTML active classes. */
  syncModebarState(): void {
    document.querySelectorAll<HTMLButtonElement>("#modebar button").forEach((btn) => {
      const mode = btn.dataset.mode as StudioMode;
      const active = mode === this.mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    this.syncModebarCapabilities();
  }

  syncModebarCapabilities(): void {
    const d = this.descriptorFor();
    document.querySelectorAll<HTMLButtonElement>("#modebar button").forEach((btn) => {
      const mode = btn.dataset.mode as StudioMode;
      const ok =
        mode === "generate"
          ? (d?.generate.supported ?? false)
          : mode === "animate"
            ? (d?.animate.supported ?? false)
            : (d?.react.supported ?? false);
      btn.disabled = !ok;
      btn.title = ok ? "" : `${mode} unsupported for ${this.pieceId}`;
      btn.style.opacity = ok ? "1" : "0.45";
    });
  }

  setBrowserVisible(visible: boolean): void {
    this.browserVisible = visible;
    if (!visible) this.hideBrowserMotionPane();
    this.syncChrome();
    if (visible) this.renderBrowser();
  }

  private toggleBrowserVisible(): void {
    this.setBrowserVisible(!this.browserVisible);
  }

  private refreshAnimationBaseParams(): void {
    this.session?.refreshAnimationBaseParams();
  }

  private clearFailureBanner(): void {
    const banner = document.getElementById("unsupported-banner");
    if (banner) {
      banner.textContent = "";
      banner.classList.remove("visible");
    }
    this.unsupportedMessage = "";
  }

  private showFailureBanner(title: string, detail: string): void {
    const banner = document.getElementById("unsupported-banner");
    this.unsupportedMessage = `${title}\n\n${detail}`;
    if (banner) {
      banner.textContent = this.unsupportedMessage;
      banner.style.whiteSpace = "pre-wrap";
      banner.classList.add("visible");
    }
    toast(title);
  }

  private showModeUnsupported(mode: StudioMode): void {
    this.showFailureBanner(
      `${mode.toUpperCase()} unsupported`,
      `Piece: ${this.pieceId}\nThis piece does not expose ${mode.toUpperCase()} in Studio.`,
    );
  }

  private showAnimationFailed(err: unknown, backend: string): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.showFailureBanner(
      "Animation failed",
      `Piece: ${this.pieceId}\nBackend: ${backend}\nError: ${msg}`,
    );
  }

  private showGenerationFailed(err: unknown, backend: string): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.showFailureBanner(
      "Generation failed",
      `Piece: ${this.pieceId}\nBackend: ${backend}\nError: ${msg}`,
    );
  }

  applyAnimationMethodId(methodId: string): void {
    if (methodId === RANDOM_METHOD_ID) {
      this.animationMethodId = RANDOM_METHOD_ID;
      this.initRandomSequencer();
      this.renderConfig();
      return;
    }
    this.animationMethodId = methodId;
    this.activeAnimationMethodId = methodId;
    this.randomSequencer = null;
    this.animationSpec = resolveLivePerformanceMethodSpec(this.pieceId, methodId, this.mode);
    this.anim.durationSec = this.animationSpec.durationSec;
    this.anim.loop = exportLoopFlag(this.animationSpec.endBehavior);
    if (this.mode === "animate") {
      this.syncAnimationSpecToSession(true, { resetTime: true });
    }
    this.renderConfig();
  }

  private initRandomSequencer(): void {
    const methods = animationMethodsForPiece(this.pieceId);
    const allowed =
      this.randomAllowedMethodIds.length > 0
        ? this.randomAllowedMethodIds
        : methods.map((m) => m.id);
    this.randomSequencer = RandomAnimationSequencer.create(
      this.animationSequenceSeed,
      this.randomIntervalSec,
      allowed,
      methods,
    );
    const first = this.randomSequencer.pickInitial();
    this.animationMethodId = RANDOM_METHOD_ID;
    this.activeAnimationMethodId = first;
    this.animationSpec = normalizeSpecForLivePerformance(
      this.pieceId,
      applyAnimationMethod(this.pieceId, first),
      this.mode,
    );
    this.anim.durationSec = this.animationSpec.durationSec;
    this.syncAnimationSpecToSession(true, { resetTime: true });
    this.lastRandomTickMs = performance.now();
  }

  advanceRandomMethod(): void {
    if (!this.randomSequencer) this.initRandomSequencer();
    const next = this.randomSequencer!.forceNext();
    this.activeAnimationMethodId = next;
    this.animationSpec = normalizeSpecForLivePerformance(
      this.pieceId,
      applyAnimationMethod(this.pieceId, next),
      this.mode,
    );
    this.syncAnimationSpecToSession(true, { resetTime: true });
    this.lastRandomTickMs = performance.now();
    this.renderConfig();
  }

  private wirePointerIdle(): void {
    const body = document.body;
    const bump = () => {
      body.classList.add("pointer-active");
      if (this.idleTimer) window.clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => {
        if (!this.controlsVisible && !this.helpVisible) {
          body.classList.remove("pointer-active");
        }
      }, 2200);
    };
    window.addEventListener("mousemove", bump);
    bump();
  }

  async setMode(mode: StudioMode): Promise<void> {
    if (!this.modeSupported(mode)) {
      this.showModeUnsupported(mode);
      return;
    }
    this.mode = mode;
    this.prefs.mode = mode;
    this.persist();
    this.syncModebarState();
    if (mode === "generate") {
      this.playing = false;
      this.session?.runtime.transport.stop();
      this.stopApiAnim();
    } else {
      this.playing = true;
    }
    await this.applyPieceScene();
    this.renderConfig();
    this.renderHelp();
    this.syncUrl(true);
    toast(`${mode.toUpperCase()} mode`);
  }

  async setPiece(pieceId: string): Promise<void> {
    this.browserThumbAbort?.abort();
    this.browserThumbAbort = null;
    this.hideBrowserMotionPane();
    await this.browserPreview?.teardown();
    const preserveCurrentVisual = this.mode === "animate" || this.mode === "react";
    if (preserveCurrentVisual) this.beginVisualTransition();
    this.pieceId = pieceId;
    this.prefs.pieceId = pieceId;
    this.recipeDigest = "";
    this.renderDigest = "";
    if (this.mode === "animate" || this.mode === "react") {
      this.playing = true;
    }
    // Reset to piece defaults; keep shared meta axes that map meaningfully
    const defaults = defaultsForPiece(pieceId);
    const next: Record<string, number | string | boolean> = { ...defaults };
    for (const key of ["density", "chaos", "hue", "zoom"] as const) {
      if (key in defaults && typeof this.params[key] === "number") {
        next[key] = this.params[key]!;
      }
    }
    this.params = next;
    this.animationMethodId = defaultAnimationMethodId(pieceId);
    this.activeAnimationMethodId = this.animationMethodId;
    this.animationSpec = resolveLivePerformanceMethodSpec(pieceId, this.animationMethodId, this.mode);
    this.randomSequencer = null;
    this.anim.durationSec = this.animationSpec.durationSec;
    this.compositionId = null;
    this.frame = 0;
    this.persist();
    await this.applyPieceScene();
    if (preserveCurrentVisual) {
      if (this.unsupportedMessage) this.keepTransitionAsFallback();
      else if (await this.waitForIncomingVisual()) this.finishVisualTransition();
      else this.keepTransitionAsFallback();
    }
    this.pushHistory();
    this.renderConfig();
    document.querySelectorAll<HTMLElement>("#browser .piece").forEach((card) => {
      card.classList.toggle("selected", card.dataset.pieceId === this.pieceId);
    });
    this.syncModebarState();
    this.syncUrl(true);
  }

  async randomizeSeed(): Promise<void> {
    if (this.locked.has("seed")) {
      toast("seed locked");
      return;
    }
    this.seed = cryptoSeed();
    this.prefs.seed = this.seed;
    if (this.mode === "animate" || this.mode === "react") {
      this.playing = true;
    }
    this.persist();
    await this.applyPieceScene();
    this.pushHistory();
    this.renderConfig();
    this.syncUrl(true);
    toast(`seed ${this.seed}`);
  }

  async restartState(): Promise<void> {
    await this.applyPieceScene();
    toast("restarted");
  }

  togglePlay(): void {
    this.playing = !this.playing;
    if (studioSurface(this.pieceId, this.mode) === "api-preview") {
      if (this.playing) this.startApiAnim();
      else this.stopApiAnim({ abort: false });
      this.syncChrome();
      return;
    }
    if (this.playing) {
      this.session?.runtime.setSimulationPaused(false);
      this.session?.runtime.transport.start();
    } else {
      this.session?.runtime.setSimulationPaused(true);
      this.session?.runtime.transport.stop();
    }
    this.syncChrome();
  }

  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      document.body.classList.add("fullscreen-art");
    } else {
      await document.exitFullscreen();
      document.body.classList.remove("fullscreen-art");
    }
  }

  private performancePiecePool(): string[] {
    const all = this.pieces.map((p) => p.piece_id);
    if (this.performanceCyclePackOrder && this.pack.items.length > 0) {
      const packIds = this.pack.items
        .map((i) => i.pieceId)
        .filter((id, idx, arr) => arr.indexOf(id) === idx && all.includes(id));
      if (packIds.length > 0) return packIds;
    }
    if (this.performanceCycleFavoritesOnly && this.performanceFavorites.length > 0) {
      return this.performanceFavorites.filter((id) => all.includes(id));
    }
    const curated = filterPerformanceCatalog(this.pieces, "curated", this.performanceFavorites).map(
      (p) => p.piece_id,
    );
    return curated.length >= 4 ? curated : all;
  }

  private ensureBrowserPreview(): BrowserPreviewSession | null {
    const canvas = document.getElementById("browser-motion-canvas") as HTMLCanvasElement | null;
    if (!canvas) return null;
    if (!this.browserPreview) this.browserPreview = new BrowserPreviewSession(canvas);
    return this.browserPreview;
  }

  private clearBrowserMotionTimer(): void {
    if (this.browserMotionTimer != null) {
      window.clearTimeout(this.browserMotionTimer);
      this.browserMotionTimer = null;
    }
  }

  private hideBrowserMotionPane(): void {
    this.clearBrowserMotionTimer();
    this.browserMotionPieceId = null;
    void this.browserPreview?.stopMotion();
    document.getElementById("browser-motion")?.setAttribute("hidden", "");
    document.querySelectorAll("#browser .piece.motion-active").forEach((el) => {
      el.classList.remove("motion-active");
    });
  }

  private scheduleBrowserMotion(pieceId: string, label: string): void {
    this.clearBrowserMotionTimer();
    if (!this.browserVisible) return;
    const preview = this.ensureBrowserPreview();
    if (!preview || preview.isReducedMotion) return;
    this.browserMotionTimer = window.setTimeout(() => {
      this.browserMotionTimer = null;
      if (!this.browserVisible) return;
      this.browserMotionPieceId = pieceId;
      const pane = document.getElementById("browser-motion");
      const cap = document.getElementById("browser-motion-label");
      pane?.removeAttribute("hidden");
      if (cap) cap.textContent = `Motion preview · ${label}`;
      document.querySelectorAll("#browser .piece.motion-active").forEach((el) => {
        el.classList.remove("motion-active");
      });
      document
        .querySelector(`#browser .piece[data-piece-id="${CSS.escape(pieceId)}"]`)
        ?.classList.add("motion-active");
      void preview.startMotion(pieceId).catch(() => {
        if (cap) cap.textContent = "MOTION FAILED — use Animate";
      });
    }, 320);
  }

  togglePerformanceShortlist(pieceId: string): void {
    const i = this.performanceFavorites.indexOf(pieceId);
    if (i >= 0) this.performanceFavorites.splice(i, 1);
    else this.performanceFavorites.unshift(pieceId);
    this.performanceFavorites = this.performanceFavorites.slice(0, 24);
    this.persist();
    toast(
      i >= 0 ? "removed from performance shortlist" : `shortlisted (${this.performanceFavorites.length})`,
    );
    this.renderBrowser();
  }

  async auditionPieceFromBrowser(pieceId: string): Promise<void> {
    await this.setPiece(pieceId);
    if (this.mode !== "animate") await this.setMode("animate");
    this.setBrowserVisible(false);
    toast(`Animate · ${pieceId.split("/").pop()}`);
  }

  private initVisualSequencer(): void {
    const pool = this.performancePiecePool();
    this.visualSequencer = new VisualSwitchSequencer(
      pool,
      this.visualSequenceSeed,
      this.visualSwitchIntervalSec,
    );
    this.lastVisualSwitchMs = Date.now();
  }

  async cyclePiece(dir: number): Promise<void> {
    const ids = this.performancePiecePool();
    const i = Math.max(0, ids.indexOf(this.pieceId));
    const next = ids[(i + dir + ids.length) % ids.length];
    if (next) await this.setPiece(next);
  }

  /** Keyboard-first piece change — no picker, overlays, or toast. */
  async cycleVisualization(dir: number): Promise<void> {
    this.setBrowserVisible(false);
    this.helpVisible = false;
    await this.cyclePiece(dir);
    this.syncChrome();
  }

  async cycleRandomPiece(): Promise<void> {
    const ids = this.performancePiecePool().filter((id) => id !== this.pieceId);
    if (ids.length === 0) return;
    const idx = Math.abs(this.visualSequenceSeed ^ this.seed) % ids.length;
    await this.setPiece(ids[idx]!);
  }

  private pushHistory(): void {
    this.history.push({
      pieceId: this.pieceId,
      seed: this.seed,
      mode: this.mode,
      frame: this.frame,
      recipe: { parameters: { ...this.params } },
      at: Date.now(),
    });
    this.prefs.recent = this.history.snapshot();
    this.persist();
  }

  async historyBack(): Promise<void> {
    const e = this.history.back();
    if (!e) return;
    this.pieceId = e.pieceId;
    this.seed = e.seed;
    if (e.recipe?.parameters && typeof e.recipe.parameters === "object") {
      this.params = { ...this.params, ...(e.recipe.parameters as Record<string, number>) };
    }
    await this.applyPieceScene();
    this.renderConfig();
  }

  async historyForward(): Promise<void> {
    const e = this.history.forward();
    if (!e) return;
    this.pieceId = e.pieceId;
    this.seed = e.seed;
    await this.applyPieceScene();
    this.renderConfig();
  }

  async exploreVariants(): Promise<void> {
    const count = this.variantBatch;
    const numericParams: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.params)) {
      if (typeof v === "number") numericParams[k] = v;
    }
    const variants = moreLikeThis(
      { seed: this.seed, parameters: numericParams },
      {
        count,
        locked: this.locked,
        mutationScale: this.mutationScale,
        favoriteBias: this.sessionFavorites.map((f) => f.parameters),
      },
    );
    await this.renderVariantGrid(variants, `generating ${count} (${this.mutationScale})…`);
  }

  async exploreSeries(): Promise<void> {
    const count = this.variantBatch;
    const numericParams: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.params)) {
      if (typeof v === "number") numericParams[k] = v;
    }
    const locked = new Set(this.locked);
    if (this.locked.has("style") || this.pflStyleId) locked.add("palette");
    locked.add("composition");
    const variants = generateSeries(
      { seed: this.seed, parameters: numericParams },
      { count, locked, mutationScale: this.mutationScale === "wild" ? "moderate" : "subtle" },
    );
    await this.renderVariantGrid(variants, `series of ${count}…`);
  }

  private async renderVariantGrid(
    variants: Array<{ seed: number; parameters: Record<string, number>; label: string }>,
    statusMsg: string,
  ): Promise<void> {
    this.variantCache = variants.map((v) => ({
      seed: v.seed,
      parameters: { ...v.parameters },
      label: v.label,
      thumbUrl: null as string | null,
    }));
    const host = document.getElementById("variants");
    if (!host) return;
    const count = this.variantCache.length;
    host.innerHTML = `<div class="variant-grid" style="display:grid;grid-template-columns:repeat(${Math.min(4, Math.ceil(Math.sqrt(count)))},1fr);gap:0.35rem"></div>`;
    const grid = host.querySelector(".variant-grid")!;
    toast(statusMsg);
    for (let i = 0; i < this.variantCache.length; i++) {
      const v = this.variantCache[i]!;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "variant-cell";
      cell.style.cssText =
        "padding:0;aspect-ratio:1;overflow:hidden;border:1px solid var(--line);background:#111;position:relative";
      cell.innerHTML = `<span style="display:block;padding:0.25rem;font-size:10px">${v.label}</span>`;
      cell.title = `seed ${v.seed} — click promote · shift-click favorite · alt-click reject`;
      cell.addEventListener("click", (ev) => {
        if (ev.shiftKey) {
          this.sessionFavorites.unshift({ seed: v.seed, parameters: { ...v.parameters } });
          this.sessionFavorites = this.sessionFavorites.slice(0, 12);
          toast(`favorite ${v.label}`);
          return;
        }
        if (ev.altKey) {
          this.sessionRejects.push(v.seed);
          cell.style.opacity = "0.35";
          toast(`reject ${v.label}`);
          return;
        }
        this.seed = v.seed;
        this.params = { ...this.params, ...v.parameters };
        void this.applyPieceScene().then(() => {
          this.pushHistory();
          this.renderConfig();
          toast(`selected ${v.seed}`);
        });
      });
      grid.appendChild(cell);
      try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            piece: this.pieceId,
            seed: v.seed,
            width: 160,
            height: 160,
            frame: this.frame,
            format: "png",
            quality: "draft",
            parameters: { ...paramsForApi(this.params), ...v.parameters },
          }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          v.thumbUrl = url;
          const img = document.createElement("img");
          img.src = url;
          img.alt = v.label;
          img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
          cell.innerHTML = "";
          cell.appendChild(img);
        }
      } catch {
        /* label-only cell */
      }
    }
    toast("variants ready — click · shift=♥ · alt=reject");
  }

  /** Hand off current Generate look into ANIMATE with exact state continuity. */
  async animateThis(): Promise<void> {
    const piece = this.session?.runtime.getPiece("L0") as
      | {
          exportState?: () => {
            arrays?: Record<string, Float32Array>;
            shapes?: Record<string, number[]>;
            json?: Record<string, unknown>;
          };
        }
      | undefined;
    if (piece && typeof piece.exportState === "function") {
      try {
        this.pendingImportState = piece.exportState();
      } catch {
        this.pendingImportState = null;
      }
    }
    this.anim.startFrame = this.frame;
    toast(`Animate This · frame ${this.frame}`);
    await this.setMode("animate");
  }

  addCurrentToPack(kind: PackItemKind = "still"): void {
    const item = itemFromLook({
      pieceId: this.pieceId,
      seed: this.seed,
      frame: this.frame,
      styleId: this.pflStyleId || undefined,
      parameters: { ...this.params },
      kind,
      animArc: this.activeAnimationMethodId,
    });
    item.stillPreset = this.pack.still_preset;
    if (kind === "animation") {
      item.animPreset = "loop-12s";
      item.durationSec = 12;
    }
    if (kind === "react") {
      item.durationSec = 30;
      item.animPreset = "section-30s";
    }
    this.pack.items.push(item);
    if (!this.pack.style && this.pflStyleId) this.pack.style = this.pflStyleId;
    savePackDraft(this.pack);
    this.packPanelOpen = true;
    this.renderConfig();
    toast(`added to pack (${this.pack.items.length})`);
  }

  addFavoritesToPack(): void {
    let n = 0;
    for (const fav of this.prefs.favorites.slice(0, 12)) {
      const params =
        (fav.recipe?.parameters as Record<string, number | string | boolean> | undefined) ||
        {};
      this.pack.items.push(
        itemFromLook({
          pieceId: fav.pieceId,
          seed: fav.seed,
          parameters: params,
          kind: "still",
        }),
      );
      n += 1;
    }
    savePackDraft(this.pack);
    this.packPanelOpen = true;
    this.renderConfig();
    toast(`added ${n} favorites to pack`);
  }

  movePackItem(from: number, to: number): void {
    this.pack.items = reorderItems(this.pack.items, from, to);
    savePackDraft(this.pack);
    this.renderConfig();
  }

  removePackItem(id: string): void {
    this.pack.items = this.pack.items.filter((i) => i.id !== id);
    savePackDraft(this.pack);
    this.renderConfig();
  }

  updatePackItem(id: string, patch: Partial<PackItem>): void {
    this.pack.items = this.pack.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    savePackDraft(this.pack);
  }

  async exportCurrentPack(preview = false): Promise<void> {
    if (!this.pack.items.length) {
      toast("pack is empty — Add to Pack first");
      return;
    }
    toast(preview ? "exporting pack preview…" : "exporting PFL pack…");
    const res = await exportPackApi(this.pack, { preview });
    if (!res.ok) {
      toast((res.error || "pack export failed").slice(0, 140));
      return;
    }
    toast(`pack → ${res.path}`);
    this.pack.output_root = res.path;
    savePackDraft(this.pack);
  }

  async reloadPackFromDisk(): Promise<void> {
    const slug = slugify(this.pack.name);
    const loaded = await loadPackManifest(slug);
    if (!loaded) {
      toast("no exported manifest found for this pack name");
      return;
    }
    this.pack = loaded;
    savePackDraft(this.pack);
    this.packPanelOpen = true;
    this.renderConfig();
    toast(`loaded ${loaded.items.length} pack items`);
  }

  async loadMidnightPackFixture(): Promise<void> {
    const fixture = await fetchPackFixture("midnight-pfl-pack");
    if (!fixture) {
      toast("Midnight pack fixture missing");
      return;
    }
    this.pack = fixture;
    savePackDraft(this.pack);
    this.packPanelOpen = true;
    this.renderConfig();
    toast(`loaded Midnight PFL Pack (${fixture.items.length} items)`);
  }

  async loadEpisode1PackFixture(): Promise<void> {
    const fixture = await fetchPackFixture("episode-1-visual-set");
    if (!fixture) {
      toast("Episode 1 visual set fixture missing");
      return;
    }
    this.pack = fixture;
    savePackDraft(this.pack);
    this.packPanelOpen = true;
    this.renderConfig();
    toast(`loaded Episode 1 set (${fixture.items.length} items)`);
  }

  async saveSeedState(): Promise<void> {
    const id = newSeedId(this.pieceId, this.seed);
    let previewDataUrl: string | undefined;
    try {
      previewDataUrl = this.canvas.toDataURL("image/png");
    } catch {
      /* tainted */
    }
    const rec: StudioSeedRecord = {
      id,
      pieceId: this.pieceId,
      seed: this.seed,
      frame: this.frame,
      artifactType: this.inferArtifactType(),
      previewDataUrl,
      recipe: { parameters: { ...this.params }, seed: this.seed },
      jsonBlobs: { meta: { frame: this.frame, studio: true } },
      createdAt: Date.now(),
    };
    // Capture structured state from live pieces when available
    await this.captureLiveStateInto(rec);
    await saveSeed(rec);
    this.currentSeedId = id;
    this.prefs.favorites.unshift({
      pieceId: this.pieceId,
      seed: this.seed,
      label: id,
      recipe: rec.recipe,
      savedAt: Date.now(),
    });
    this.prefs.favorites = this.prefs.favorites.slice(0, 40);
    this.persist();
    this.renderConfig();
    toast(`saved seed ${id}`);
  }

  private inferArtifactType(): string {
    if (this.pieceId.includes("reaction-diffusion")) return "simulation-state";
    if (this.pieceId.includes("slime")) return "agent-state";
    if (this.pieceId.startsWith("geometry/")) return "geometry";
    if (this.pieceId.includes("noodle")) return "agent-state";
    if (this.pieceId.includes("differential")) return "simulation-state";
    return "parameter-state";
  }

  private async captureLiveStateInto(rec: StudioSeedRecord): Promise<void> {
    const piece = this.session?.runtime.getPiece("L0") as
      | (ReturnType<typeof createLivePiece> extends Promise<infer T> ? T : never) & {
          exportState?: () => {
            arrays?: Record<string, Float32Array>;
            shapes?: Record<string, number[]>;
            json?: Record<string, unknown>;
          };
        }
      | undefined;
    if (!piece || typeof piece.exportState !== "function") return;
    try {
      const st = piece.exportState();
      if (st.arrays) {
        rec.arrays = {};
        for (const [k, arr] of Object.entries(st.arrays)) {
          rec.arrays[k] = {
            dtype: "float32",
            shape: st.shapes?.[k] ?? [arr.length],
            base64: float32ToBase64(arr),
          };
        }
      }
      if (st.json) rec.jsonBlobs = { ...(rec.jsonBlobs || {}), ...st.json };
    } catch {
      /* optional */
    }
  }

  async loadSeedRecord(id: string): Promise<void> {
    const rec = await getSeed(id);
    if (!rec) {
      toast("seed not found");
      return;
    }
    this.pieceId = rec.pieceId;
    this.seed = rec.seed;
    this.frame = rec.frame;
    if (rec.recipe?.parameters && typeof rec.recipe.parameters === "object") {
      this.params = {
        ...this.params,
        ...(rec.recipe.parameters as Record<string, number>),
      };
    }
    await this.applyPieceScene();
    const piece = this.session?.runtime.getPiece("L0") as {
      importState?: (s: {
        arrays: Record<string, Float32Array>;
        shapes: Record<string, number[]>;
        json?: Record<string, unknown>;
      }) => void;
    } | undefined;
    if (piece?.importState && rec.arrays) {
      const arrays: Record<string, Float32Array> = {};
      const shapes: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(rec.arrays)) {
        arrays[k] = base64ToFloat32(v.base64);
        shapes[k] = v.shape;
      }
      piece.importState({ arrays, shapes, json: rec.jsonBlobs });
    }
    this.currentSeedId = id;
    this.pushHistory();
    this.renderConfig();
    toast(`loaded ${id}`);
  }

  async exportCurrent(): Promise<void> {
    if (this.mode === "animate") {
      await this.exportAnim();
      return;
    }
    const preset =
      RESOLUTION_PRESETS.find((p) => p.id === this.exportPreset) ?? RESOLUTION_PRESETS[0]!;
    // Canvas is live resolution; export current frame as PNG (hi-res via local render when available)
    const name = `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.png`;
    try {
      const ok = await this.tryLocalHiResExport(preset.width, preset.height, name);
      if (!ok) await exportStillPng(this.canvas, name);
      toast(`exported ${name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "export failed");
    }
  }

  private async tryLocalHiResExport(
    width: number,
    height: number,
    filename: string,
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piece: this.pieceId,
          seed: this.seed,
          width,
          height,
          frame: this.frame,
          format: "png",
          parameters: this.params,
        }),
      });
      if (!res.ok) return false;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      return true;
    } catch {
      return false;
    }
  }

  async exportAnim(): Promise<void> {
    const cfg = this.anim;
    const fmt = this.exportKind === "video" ? "webm" : this.animFormat;
    const backend = animationExportBackend(this.pieceId);
    if (backend === "unsupported") {
      toast("This piece does not support animation export");
      return;
    }
    toast(`exporting ${fmt} (${backend})…`);
    const frameCount = Math.max(1, Math.floor(cfg.fps * cfg.durationSec));
    const apiParams = paramsForApi(this.params, this.color);
    cfg.loop = exportLoopFlag(this.animationSpec.endBehavior);

    try {
      if (backend === "runtime-frames") {
        const livePiece = this.session?.runtime.getPiece("L0") as
          | { exportState?: () => RuntimeExportState }
          | undefined;
        const importState = livePiece?.exportState?.() ?? null;
        const frames = await captureRuntimeFrames({
          pieceId: this.pieceId,
          seed: this.seed,
          params: apiParams,
          color: this.color,
          width: cfg.width,
          height: cfg.height,
          fps: cfg.fps,
          frameCount,
          startFrame: cfg.startFrame,
          importState: importState
            ? { ...importState, logicalFrame: this.session?.runtime.getFrame() ?? cfg.startFrame }
            : null,
          onProgress: (n, total) => toast(`export frame ${n}/${total}`),
        });
        const encoded = await encodeAnimationJob(
          frames,
          {
            fps: cfg.fps,
            format: fmt,
            quality: cfg.quality,
            loop: cfg.loop,
            piece: this.pieceId,
            seed: this.seed,
            frameCount: frames.length,
          },
          (msg) => toast(msg),
        );
        if (fmt === "webp") {
          const animated = await webpIsAnimated(encoded.blob);
          if (!animated) throw new Error("encoded WebP is not animated");
        }
        downloadBlob(
          encoded.blob,
          `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.${fmt}`,
        );
        toast(
          encoded.artifact
            ? `exported .${fmt} → artifacts/${encoded.artifact}`
            : `exported .${fmt} (runtime frames)`,
        );
        return;
      }

      const server = await apiExportAnimation(
        {
          piece: this.pieceId,
          seed: this.seed,
          width: cfg.width,
          height: cfg.height,
          fps: cfg.fps,
          start_frame: cfg.startFrame,
          duration_sec: cfg.durationSec,
          format: fmt,
          quality: cfg.quality,
          loop: cfg.loop,
          parameters: apiParams,
        },
        (msg) => toast(msg),
      );
      if (fmt === "webp") {
        const animated = await webpIsAnimated(server.blob);
        if (!animated) throw new Error("server returned non-animated WebP");
      }
      downloadBlob(
        server.blob,
        `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.${fmt}`,
      );
      toast(
        server.artifact
          ? `exported .${fmt} → artifacts/${server.artifact}`
          : `exported .${fmt}`,
      );
      return;
    } catch (serverErr) {
      // Fallback: browser logical-frame WebM path
      try {
        const exportSpec = normalizeSpecForPiece(this.pieceId, this.animationSpec);
        this.session?.setAnimationSpec(exportSpec, {
          performanceMode: false,
          preserveTime: false,
        });
        let exportPrimed = false;
        const result = await exportAnimation(
          { ...cfg, loop: exportLoopFlag(exportSpec.endBehavior) },
          async (_frame, t) => {
            if (this.session) {
              if (!exportPrimed) {
                this.session.animationRuntime.reset();
                exportPrimed = true;
              }
              this.session.animationRuntime.seekTime(t);
              this.session.animationRuntime.applyToPieces(
                this.session.runtime.getPieces(),
                new Map(),
              );
              this.session.frame(t * 1000);
            }
            return this.canvas;
          },
        );
        const ext = result.format === "webm" ? "webm" : "webp";
        downloadBlob(
          result.blob,
          `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.${ext}`,
        );
        toast(`exported .${ext} (browser fallback)`);
      } catch (err) {
        toast(
          err instanceof Error
            ? err.message
            : serverErr instanceof Error
              ? serverErr.message
              : "animation export failed",
        );
      }
    }
  }

  async enableMic(): Promise<void> {
    try {
      const r = await this.session?.audio.start();
      this.audioEnabled = !!r?.ok;
      this.renderConfig();
      toast(r?.ok ? "microphone enabled" : r?.error || "mic unavailable");
    } catch (err) {
      this.audioEnabled = false;
      toast(err instanceof Error ? err.message : "mic permission denied");
    }
  }

  private persist(): void {
    this.prefs.color = this.color;
    this.prefs.performanceShortlist = [...this.performanceFavorites];
    this.prefs.performanceCycleShortlistOnly = this.performanceCycleFavoritesOnly;
    this.prefs.performanceCyclePackOrder = this.performanceCyclePackOrder;
    savePrefs(this.prefs);
  }

  private syncColorToParams(): void {
    if (!this.locked.has("color") && !this.locked.has("hue")) {
      this.params.hue = hexToHueTurn(this.color.primary.value);
    }
    this.session?.runtime.getPiece("L0")?.setParameter("hue", Number(this.params.hue));
  }

  private applyColorPreset(presetId: string): void {
    const ramp = RAMP_PRESETS[presetId];
    if (ramp) {
      this.color.mode = "ramp";
      this.color.rampPreset = presetId;
      this.color.ramp = JSON.parse(JSON.stringify(ramp.ramp));
    }
    this.applyLiveColor(true);
  }

  private syncUrl(push: boolean): void {
    const u = new URL(location.href);
    u.pathname = u.pathname.includes("studio") ? u.pathname : "/studio.html";
    u.searchParams.set("mode", this.mode);
    u.searchParams.set("piece", this.pieceId);
    u.searchParams.set("seed", String(this.seed));
    if (push) history.replaceState(null, "", u);
  }

  private showPerformanceFadeMask(opacity: number): void {
    const mask = document.getElementById("performance-fade-mask");
    if (!mask) return;
    mask.style.opacity = String(Math.min(1, Math.max(0, opacity)));
    mask.style.pointerEvents = opacity > 0.05 ? "auto" : "none";
  }

  private syncCompositionLayerAnimations(): void {
    if (!this.session || (this.mode !== "animate" && this.mode !== "react")) return;
    this.session.clearOverlayLayerAnimations();
    const scene = this.session.runtime.getScene();
    if (!scene || scene.layers.length < 2) return;
    const recipe = this.compositionId ? compositionById(this.compositionId) : undefined;
    const overlays: Array<{ layerId: string; spec: import("./animation/spec").AnimationSpec }> = [];
    for (const layer of scene.layers) {
      if (layer.id === "L0") continue;
      const methodId =
        recipe?.layerMethods?.[layer.id] ??
        defaultLayerLiveMethodId(layer.piece);
      overlays.push({
        layerId: layer.id,
        spec: resolveLivePerformanceMethodSpec(layer.piece, methodId, this.mode),
      });
    }
    this.session.setOverlayLayerAnimations(overlays);
    const l0 = scene.layers.find((l) => l.id === "L0");
    const l0Method =
      recipe?.layerMethods?.L0 ??
      (l0 ? defaultLayerLiveMethodId(l0.piece) : undefined);
    if (l0Method && l0) {
      this.animationMethodId = l0Method;
      this.activeAnimationMethodId = l0Method;
      this.animationSpec = resolveLivePerformanceMethodSpec(l0.piece, l0Method, this.mode);
      this.session.setAnimationSpec(this.animationSpec, {
        preserveTime: true,
        performanceMode: true,
      });
      this.applyStudioPerformanceClock();
    }
  }

  async setPerformanceComposition(compositionId: string | null): Promise<void> {
    const preserve = this.mode === "animate" || this.mode === "react";
    if (preserve) this.beginVisualTransition();
    this.compositionId = compositionId;
    if (compositionId) {
      const recipe = compositionById(compositionId);
      const preview = recipe?.build(this.seed, this.params);
      const basePiece = preview?.scenes[0]?.layers[0]?.piece;
      if (basePiece) this.pieceId = basePiece;
    }
    await this.applyPieceScene();
    if (preserve) {
      if (await this.waitForIncomingVisual()) this.finishVisualTransition();
      else this.keepTransitionAsFallback();
    }
    this.renderConfig();
    this.syncUrl(true);
  }

  /** Test/diagnostics — Studio uses exactly one primary LiveSession. */
  getPrimaryLiveSessionCount(): number {
    return this.session ? 1 : 0;
  }

  private beginVisualTransition(): void {
    if (this.pieceTransition === "cut") return;
    if (this.pieceTransition === "fade-black") {
      this.showPerformanceFadeMask(1);
      return;
    }
    const hold = document.getElementById("switch-hold") as HTMLImageElement | null;
    if (!hold) return;
    const preview = document.getElementById("generate-preview") as HTMLImageElement | null;
    let src = "";
    if (preview?.classList.contains("visible") && preview.src) {
      src = preview.src;
    } else if (this.canvas.width > 0 && this.canvas.height > 0) {
      try {
        src = this.canvas.toDataURL("image/png");
      } catch {
        src = "";
      }
    }
    if (!src) return;
    hold.src = src;
    hold.classList.remove("releasing", "fallback-drift");
    hold.classList.add("visible");
  }

  private async waitForIncomingVisual(timeoutMs = 20_000): Promise<boolean> {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const px = this.sampleIncomingPresentedPixels(64, 36);
      if (
        px &&
        (px.meanLuminance > 2 || px.luminanceVariance > 1 || px.occupiedFraction > 0.00025)
      ) {
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return false;
  }

  private finishVisualTransition(): void {
    if (this.pieceTransition === "fade-black") {
      this.showPerformanceFadeMask(0);
      return;
    }
    const hold = document.getElementById("switch-hold") as HTMLImageElement | null;
    if (!hold?.classList.contains("visible")) return;
    if (this.pieceTransition === "cut") {
      hold.classList.remove("visible", "releasing", "fallback-drift");
      hold.removeAttribute("src");
      return;
    }
    hold.style.transition = `opacity ${this.visualCrossfadeMs}ms ease`;
    hold.classList.add("releasing");
    window.setTimeout(() => {
      hold.classList.remove("visible", "releasing", "fallback-drift");
      hold.removeAttribute("src");
      hold.style.transition = "";
    }, this.visualCrossfadeMs + 40);
  }

  private keepTransitionAsFallback(): void {
    const hold = document.getElementById("switch-hold") as HTMLImageElement | null;
    if (!hold?.src) return;
    hold.classList.remove("releasing");
    hold.classList.add("visible", "fallback-drift");
  }

  private setControlTreeState(id: string, hidden: boolean): void {
    const node = document.getElementById(id);
    if (!node) return;
    node.inert = hidden;
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    node.style.pointerEvents = hidden ? "none" : "";
  }

  syncChrome(): void {
    document.body.classList.toggle(
      "performance-stage",
      this.mode === "animate" || this.mode === "react",
    );
    document.body.classList.toggle("controls-visible", this.controlsVisible);
    document.body.classList.toggle("controls-hidden", !this.controlsVisible);
    document.getElementById("config")?.classList.toggle("visible", this.controlsVisible);
    document.getElementById("help")?.classList.toggle("visible", this.helpVisible);
    document.getElementById("hud")?.classList.toggle("visible", this.hudVisible);
    document.getElementById("browser")?.classList.toggle("visible", this.browserVisible);
    if (!this.browserVisible) this.hideBrowserMotionPane();
    const stallBanner = document.getElementById("unsupported-banner");
    if (stallBanner && this.helpVisible && stallBanner.textContent?.startsWith("Animation stalled")) {
      stallBanner.classList.remove("visible");
    }
    const perf = document.getElementById("performance-strip");
    if (perf) {
      perf.classList.toggle("visible", this.mode === "animate" && this.controlsVisible);
      const label = document.getElementById("perf-piece");
      if (label) label.textContent = this.pieceId.split("/").pop() ?? this.pieceId;
      const pauseBtn = document.getElementById("perf-pause");
      if (pauseBtn) pauseBtn.textContent = this.playing ? "Pause" : "Play";
    }
    for (const id of ["modebar", "config", "browser", "performance-strip"]) {
      this.setControlTreeState(id, !this.controlsVisible);
    }
    const strip = document.getElementById("meta-strip");
    const kind = rendererKindFor(this.pieceId, this.mode) ?? "unsupported";
    if (strip) {
      strip.textContent = `${this.mode.toUpperCase()} · ${this.pieceId} · ${kind} · seed ${this.seed}${
        this.generating ? " · generating…" : ""
      }`;
    }
  }

  renderHelp(): void {
    const el = document.getElementById("help");
    if (!el) return;
    const { global, mode } = this.registry.helpCatalog(this.mode);
    const row = (c: { keys: string; label: string }) =>
      `<div class="cmd"><kbd>${c.keys}</kbd>${c.label}</div>`;
    el.innerHTML = `
      <h1>Keyboard</h1>
      <div class="grid">
        <div>
          <h2 style="color:var(--mute);letter-spacing:.1em;font-size:10px;">GLOBAL</h2>
          ${global.map(row).join("")}
        </div>
        <div>
          <h2 style="color:var(--mute);letter-spacing:.1em;font-size:10px;">${this.mode.toUpperCase()}</h2>
          ${mode.map(row).join("")}
        </div>
      </div>
      <p class="muted" style="margin-top:0.8rem">Press ? or Esc to close</p>
    `;
  }

  renderBrowser(): void {
    const el = document.getElementById("browser");
    if (!el) return;
    this.hideBrowserMotionPane();
    const header = document.getElementById("browser-header");
    const host = document.getElementById("browser-list-host");
    if (!header || !host) return;
    const filters: { id: PerformanceBrowserFilter; label: string }[] = [
      { id: "curated", label: "curated" },
      { id: "shortlist", label: "★ shortlist" },
      { id: "midnight", label: "midnight" },
      { id: "intense", label: "intense" },
      { id: "calm", label: "calm" },
      { id: "dense", label: "dense" },
      { id: "geometry", label: "geometry" },
      { id: "all-animated", label: "all animate" },
    ];
    const list = filterPerformanceCatalog(
      this.pieces,
      this.performanceFilter,
      this.performanceFavorites,
    );
    const cycleLabel = this.performanceCycleFavoritesOnly ? "cycle ★ only" : "cycle curated";
    const packCycleLabel = this.performanceCyclePackOrder ? "pack order ON" : "cycle pack order";
    header.innerHTML = `
      <h1 style="font-family:Syne,sans-serif;margin:0 0 0.25rem">Performance catalog</h1>
      <p class="browser-lede">Poster + hover motion preview (one at a time). Shortlist · Animate · Pack.</p>
      <div class="chips" id="filters"></div>
      <button type="button" id="browser-cycle-toggle" class="browser-mini">${cycleLabel}</button>
      <button type="button" id="browser-pack-cycle-toggle" class="browser-mini">${packCycleLabel}</button>
    `;
    host.innerHTML = `<div id="piece-list" class="piece-grid"></div>`;
    const chips = header.querySelector("#filters")!;
    for (const f of filters) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.label;
      if (f.id === this.performanceFilter) b.classList.add("on");
      b.addEventListener("click", () => {
        this.performanceFilter = f.id;
        this.renderBrowser();
      });
      chips.appendChild(b);
    }
    header.querySelector("#browser-cycle-toggle")?.addEventListener("click", () => {
      this.performanceCycleFavoritesOnly = !this.performanceCycleFavoritesOnly;
      if (this.performanceCycleFavoritesOnly) this.performanceCyclePackOrder = false;
      this.persist();
      this.initVisualSequencer();
      this.renderBrowser();
    });
    header.querySelector("#browser-pack-cycle-toggle")?.addEventListener("click", () => {
      this.performanceCyclePackOrder = !this.performanceCyclePackOrder;
      if (this.performanceCyclePackOrder) this.performanceCycleFavoritesOnly = false;
      this.persist();
      this.initVisualSequencer();
      this.renderBrowser();
    });
    const listHost = host.querySelector("#piece-list")!;
    for (const p of list) {
      const meta = performanceMeta(p.piece_id);
      const div = document.createElement("div");
      div.className = "piece" + (p.piece_id === this.pieceId ? " selected" : "");
      div.dataset.pieceId = p.piece_id;
      div.tabIndex = 0;
      const starred = this.performanceFavorites.includes(p.piece_id);
      const thumb = this.browserThumbUrls.get(p.piece_id);
      const thumbFail = this.browserThumbFailed.has(p.piece_id);
      const thumbLive = this.browserThumbLiveOnly.has(p.piece_id);
      const placeholder = thumbFail
        ? "PREVIEW FAILED"
        : thumbLive
          ? "HOVER · MOTION"
          : !thumb
            ? "preview…"
            : "";
      const badges = [
        meta?.density,
        meta?.motion,
        ...(meta?.roles.filter((r) => r === "midnight" || r === "peak").slice(0, 2) ?? []),
      ]
        .filter(Boolean)
        .map((b) => `<span class="badge">${b}</span>`)
        .join("");
      div.innerHTML = `
        <div class="thumb-wrap">
          <img class="thumb" data-piece="${p.piece_id}" alt="" ${thumb ? `src="${thumb}" data-loaded="1"` : ""} />
          ${placeholder ? `<span class="thumb-placeholder${thumbFail ? " failed" : ""}">${placeholder}</span>` : ""}
        </div>
        <div class="piece-body">
          <div class="name-row">
            <span class="name">${p.title || p.name || p.piece_id.split("/").pop()}</span>
            <button type="button" class="star ${starred ? "on" : ""}" data-star="${p.piece_id}" title="Performance shortlist">★</button>
          </div>
          <div class="badges">${badges}</div>
          <div class="meta">${meta?.character ?? p.description ?? p.piece_id}</div>
          <div class="piece-actions">
            <button type="button" data-animate="${p.piece_id}">Animate</button>
            <button type="button" data-pack="${p.piece_id}">+ Pack</button>
          </div>
        </div>`;
      div.querySelector(`[data-star="${p.piece_id}"]`)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.togglePerformanceShortlist(p.piece_id);
      });
      div.querySelector(`[data-animate="${p.piece_id}"]`)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void this.auditionPieceFromBrowser(p.piece_id);
      });
      div.querySelector(`[data-pack="${p.piece_id}"]`)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void this.setPiece(p.piece_id).then(() => this.addCurrentToPack("animation"));
      });
      const displayName = p.title || p.name || p.piece_id.split("/").pop() || p.piece_id;
      div.addEventListener("click", () => void this.setPiece(p.piece_id));
      div.addEventListener("mouseenter", () => this.scheduleBrowserMotion(p.piece_id, displayName));
      div.addEventListener("mouseleave", () => {
        if (this.browserMotionPieceId === p.piece_id) this.hideBrowserMotionPane();
      });
      div.addEventListener("focusin", () => this.scheduleBrowserMotion(p.piece_id, displayName));
      div.addEventListener("focusout", () => {
        if (this.browserMotionPieceId === p.piece_id) this.hideBrowserMotionPane();
      });
      listHost.appendChild(div);
    }
    if (this.browserVisible) {
      this.ensureBrowserPreview();
      const need = list
        .map((p) => p.piece_id)
        .filter((id) => {
          const key = thumbCacheKey(id);
          return (
            !this.browserThumbUrls.has(id) || this.browserThumbCacheKeys.get(id) !== key
          );
        });
      this.patchBrowserThumbs();
      void this.loadBrowserThumbs(need).then(() => {
        if (this.browserVisible) this.patchBrowserThumbs();
      });
    }
  }

  private patchBrowserThumbs(): void {
    document.querySelectorAll<HTMLElement>("#browser .piece").forEach((card) => {
      const pieceId = card.dataset.pieceId;
      if (!pieceId) return;
      const wrap = card.querySelector(".thumb-wrap");
      if (!wrap) return;
      let img = wrap.querySelector<HTMLImageElement>("img.thumb");
      if (!img) {
        img = document.createElement("img");
        img.className = "thumb";
        img.dataset.piece = pieceId;
        img.alt = "";
        wrap.prepend(img);
      }
      let ph = wrap.querySelector<HTMLElement>(".thumb-placeholder");
      const url = this.browserThumbUrls.get(pieceId);
      if (url) {
        img.src = url;
        img.dataset.loaded = "1";
        ph?.remove();
        return;
      }
      const label = this.browserThumbFailed.has(pieceId)
        ? "PREVIEW FAILED"
        : this.browserThumbLiveOnly.has(pieceId)
          ? "HOVER · MOTION"
          : "";
      if (!label) return;
      if (!ph) {
        ph = document.createElement("span");
        ph.className = "thumb-placeholder";
        wrap.appendChild(ph);
      }
      ph.textContent = label;
      ph.classList.toggle("failed", label === "PREVIEW FAILED");
    });
    this.reconcileBrowserThumbStats();
  }

  /** Sync queue stats from terminal card state (ignores stale aborted loads). */
  private reconcileBrowserThumbStats(): void {
    const visibleIds = Array.from(
      document.querySelectorAll<HTMLElement>("#browser .piece"),
      (el) => el.dataset.pieceId ?? "",
    ).filter(Boolean);
    if (!visibleIds.length) return;
    let loaded = 0;
    let liveOnly = 0;
    let failed = 0;
    let stillLoading = 0;
    for (const id of visibleIds) {
      if (this.browserThumbUrls.has(id)) loaded += 1;
      else if (this.browserThumbLiveOnly.has(id)) liveOnly += 1;
      else if (this.browserThumbFailed.has(id)) failed += 1;
      else stillLoading += 1;
    }
    this.browserThumbStats = {
      ...this.browserThumbStats,
      requested: visibleIds.length,
      loaded,
      liveOnly,
      failed,
      inFlight: this.browserThumbStats.inFlight,
      failures: [...this.browserThumbStats.failures],
    };
    this.browserThumbStats.stillLoading = stillLoading;
  }

  private async loadBrowserThumbs(pieceIds: string[]): Promise<void> {
    const epoch = ++this.browserThumbLoadEpoch;
    if (!pieceIds.length) {
      this.reconcileBrowserThumbStats();
      return;
    }
    this.browserThumbAbort?.abort();
    const controller = new AbortController();
    this.browserThumbAbort = controller;
    await loadThumbQueue(
      pieceIds,
      (pieceId, url, cacheKey) => {
        this.browserThumbFailed.delete(pieceId);
        this.browserThumbLiveOnly.delete(pieceId);
        const prev = this.browserThumbUrls.get(pieceId);
        if (prev && prev !== url) URL.revokeObjectURL(prev);
        this.browserThumbUrls.set(pieceId, url);
        this.browserThumbCacheKeys.set(pieceId, cacheKey);
        this.patchBrowserThumbs();
      },
      (pieceId, reason) => {
        if (reason === "failed") this.browserThumbFailed.add(pieceId);
        if (reason === "live-only") this.browserThumbLiveOnly.add(pieceId);
        this.patchBrowserThumbs();
      },
      {
        concurrency: 3,
        signal: controller.signal,
        onStats: (s) => {
          if (epoch !== this.browserThumbLoadEpoch) return;
          this.browserThumbStats = s;
        },
      },
    );
    if (epoch === this.browserThumbLoadEpoch) {
      this.patchBrowserThumbs();
      this.reconcileBrowserThumbStats();
    }
    if (this.browserThumbAbort === controller) this.browserThumbAbort = null;
  }

  renderConfig(): void {
    const el = document.getElementById("config");
    if (!el) return;
    const pieceOptions = this.pieces
      .map(
        (p) =>
          `<option value="${p.piece_id}" ${p.piece_id === this.pieceId ? "selected" : ""}>${p.piece_id}</option>`,
      )
      .join("");
    const resOptions = RESOLUTION_PRESETS.map(
      (r) =>
        `<option value="${r.id}" ${r.id === this.exportPreset ? "selected" : ""}>${r.label}</option>`,
    ).join("");

    el.innerHTML = `
      <h1>NUMBRANE Studio</h1>
      <p class="muted">${this.mode.toUpperCase()} · canvas-first · ? keys · Tab chrome</p>
      <h2>Essential</h2>
      <label>Piece</label>
      <select id="cfg-piece">${pieceOptions}</select>
      <label>Seed</label>
      <div class="row">
        <input id="cfg-seed" type="number" value="${this.seed}" />
        <button type="button" id="cfg-rand">Randomize</button>
      </div>
      ${this.mode === "generate" ? `
        <label>Exact frame</label>
        <input id="cfg-frame" type="number" value="${this.frame}" />
        <label>PFL style</label>
        <select id="cfg-style">
          <option value="">(none)</option>
          ${PFL_STYLES.map((s) => `<option value="${s.id}" ${this.pflStyleId === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <label>Composition</label>
        <select id="cfg-comp">
          <option value="">(single piece)</option>
          ${COMPOSITIONS.map((c) => `<option value="${c.id}" ${this.compositionId === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
        <label>Preset</label>
        <select id="cfg-preset">${presetsForPiece(this.pieceId).map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}</select>
        <label>Export</label>
        <div class="row">
          <select id="cfg-export-kind">
            <option value="still" ${this.exportKind === "still" ? "selected" : ""}>Still PNG</option>
            <option value="animated" ${this.exportKind === "animated" ? "selected" : ""}>Animated image</option>
            <option value="video" ${this.exportKind === "video" ? "selected" : ""}>Video</option>
          </select>
          <select id="cfg-res">${resOptions}</select>
        </div>
        <div class="row">
          <button type="button" class="primary" id="cfg-export">Export</button>
          <button type="button" id="cfg-svg">SVG</button>
        </div>
        <label>Look-finding</label>
        <div class="row">
          <select id="cfg-batch">
            ${[4, 8, 12, 16].map((n) => `<option value="${n}" ${this.variantBatch === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
          <select id="cfg-mutation">
            ${(["subtle", "moderate", "wild"] as MutationScale[]).map((m) => `<option value="${m}" ${this.mutationScale === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="row">
          <button type="button" class="primary" id="cfg-variants">More Like This</button>
          <button type="button" id="cfg-series">Generate Series</button>
        </div>
        <button type="button" class="primary" id="cfg-animate-this">Animate This</button>
        <div class="row">
          <button type="button" id="cfg-pack-add">Add to Pack</button>
          <button type="button" id="cfg-pack-add-anim">+ Anim section</button>
        </div>
        <button type="button" id="cfg-pack-favs">Favorites → Pack</button>
        <details class="advanced" ${this.packPanelOpen ? "open" : ""} id="cfg-pack-panel">
          <summary>PFL Pack (${this.pack.items.length})</summary>
          <label>Pack name</label>
          <input id="cfg-pack-name" type="text" value="${this.pack.name.replace(/"/g, "&quot;")}" />
          <label>Still preset</label>
          <select id="cfg-pack-still">
            ${Object.entries(STILL_PRESETS)
              .map(
                ([id, p]) =>
                  `<option value="${id}" ${this.pack.still_preset === id ? "selected" : ""}>${p.label}</option>`,
              )
              .join("")}
          </select>
          <button type="button" id="cfg-pack-midnight">Load Midnight fixture</button>
          <button type="button" id="cfg-pack-episode1">Load Episode 1 set</button>
          <div id="pack-items">
            ${this.pack.items
              .map(
                (it, idx) => `
              <div class="row" style="align-items:flex-start;gap:0.25rem;margin:0.35rem 0;border-bottom:1px solid var(--line);padding-bottom:0.35rem">
                <span class="muted">${idx + 1}</span>
                <div style="flex:1">
                  <div>${it.pieceId.split("/").pop()} · s${it.seed} · ${it.kind}</div>
                  <select data-pack-kind="${it.id}">
                    ${(["still", "animation", "react"] as PackItemKind[])
                      .map((k) => `<option value="${k}" ${it.kind === k ? "selected" : ""}>${k}</option>`)
                      .join("")}
                  </select>
                  <select data-pack-anim="${it.id}">
                    ${Object.entries(ANIM_PRESETS)
                      .map(
                        ([id, p]) =>
                          `<option value="${id}" ${it.animPreset === id ? "selected" : ""}>${p.label}</option>`,
                      )
                      .join("")}
                  </select>
                </div>
                <button type="button" data-pack-up="${idx}" ${idx === 0 ? "disabled" : ""}>↑</button>
                <button type="button" data-pack-down="${idx}" ${idx >= this.pack.items.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" data-pack-rm="${it.id}">×</button>
              </div>`,
              )
              .join("") || `<p class="muted">Empty — explore then Add to Pack</p>`}
          </div>
          <div class="row">
            <button type="button" class="primary" id="cfg-pack-export">Build PFL Pack</button>
            <button type="button" id="cfg-pack-preview">Preview export</button>
          </div>
          <button type="button" id="cfg-pack-reload">Reload exported</button>
        </details>
        <div id="variants"></div>
      ` : ""}
      ${this.mode === "animate" ? (() => {
        const caps = animationCapabilitiesFor(this.pieceId);
        const src = this.animationSpec.source;
        const motions =
          src === "camera"
            ? ["pan", "zoom", "pan-zoom"]
            : src === "construction"
              ? ["construction", "emergence", "reveal"]
              : src === "parameters"
                ? ["emergence", "growth", "drift", "settle", "collapse"]
                : caps.motions;
        const panPresets: PanPreset[] = [
          "left-right",
          "right-left",
          "top-bottom",
          "bottom-top",
          "diag-down-right",
          "diag-up-left",
          "custom",
        ];
        const methods = animationMethodsForPiece(this.pieceId);
        const segElapsed = this.randomSequencer?.state.methodElapsedSec ?? 0;
        const segRemain = Math.max(0, this.randomIntervalSec - segElapsed);
        return `
        <h2>Performance</h2>
        <label for="cfg-perf-comp">Composition</label>
        <select id="cfg-perf-comp">
          <option value="">(single piece)</option>
          ${COMPOSITIONS.map((c) => `<option value="${c.id}" ${this.compositionId === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
        ${this.compositionId && this.session ? (() => {
          const layers = this.session.getLayerPerformanceStates();
          const blends: BlendMode[] = ["normal", "add", "multiply", "screen", "difference", "lighten", "darken"];
          return layers.length
            ? `<details open><summary>Layers (${layers.length})</summary>${layers
                .map(
                  (l) => `
              <div class="row" style="flex-wrap:wrap;margin:0.35rem 0">
                <label style="min-width:4rem"><input type="checkbox" data-layer-enable="${l.id}" ${l.enabled ? "checked" : ""} /> ${l.id}</label>
                <span class="muted" style="flex:1">${l.piece.split("/").pop()}</span>
              </div>
              <label class="muted">Opacity ${l.id}</label>
              <input type="range" min="0" max="1" step="0.01" data-layer-opacity="${l.id}" value="${l.opacity.toFixed(2)}" />
              <label class="muted">Blend ${l.id}</label>
              <select data-layer-blend="${l.id}">${blends.map((b) => `<option value="${b}" ${l.blend === b ? "selected" : ""}>${b}</option>`).join("")}</select>
              `,
                )
                .join("")}${layers.length >= 2 ? `<button type="button" id="cfg-layer-swap">Swap L0 ↔ L1</button>` : ""}</details>`
            : "";
        })() : ""}
        <div class="row">
          <button type="button" id="cfg-prev-piece" title="Previous piece [">◀</button>
          <span class="muted" style="flex:1;text-align:center">${this.compositionId ? this.compositionId : this.pieceId.split("/").pop()}</span>
          <button type="button" id="cfg-next-piece" title="Next piece ]">▶</button>
          <button type="button" id="cfg-random-piece">Random</button>
        </div>
        <label for="cfg-anim-method">Animation method</label>
        <select id="cfg-anim-method">${[
          ...methods.map(
            (m) =>
              `<option value="${m.id}" ${this.animationMethodId === m.id ? "selected" : ""}>${m.label}</option>`,
          ),
          `<option value="${RANDOM_METHOD_ID}" ${this.animationMethodId === RANDOM_METHOD_ID ? "selected" : ""}>Random</option>`,
        ].join("")}</select>
        ${
          this.animationMethodId === RANDOM_METHOD_ID
            ? `
        <label>Change every (sec)</label>
        <input id="cfg-random-interval" type="number" min="1" max="300" step="1" value="${this.randomIntervalSec}" />
        <label>Sequence seed</label>
        <input id="cfg-seq-seed" type="number" value="${this.animationSequenceSeed}" />
        <button type="button" id="cfg-random-next">Next Animation</button>
        <p class="muted">Next change ~${segRemain.toFixed(1)}s · ${this.animationSpec.source}/${this.animationSpec.motion}</p>
        `
            : ""
        }
        <label>Visual switch</label>
        <div class="row">
          <select id="cfg-visual-switch">
            <option value="off" ${this.visualSwitchMode === "off" ? "selected" : ""}>Off</option>
            <option value="random" ${this.visualSwitchMode === "random" ? "selected" : ""}>Random</option>
          </select>
          <input id="cfg-visual-interval" type="number" min="5" max="600" step="1" value="${this.visualSwitchIntervalSec}" title="Visual switch interval (sec)" />
        </div>
        <label>Transition</label>
        <select id="cfg-piece-transition">
          <option value="crossfade" ${this.pieceTransition === "crossfade" ? "selected" : ""}>Crossfade</option>
          <option value="fade-black" ${this.pieceTransition === "fade-black" ? "selected" : ""}>Fade through black</option>
          <option value="cut" ${this.pieceTransition === "cut" ? "selected" : ""}>Cut</option>
        </select>
        <p class="muted">Live · ${this.animationSpec.source}/${this.animationSpec.motion} · unbounded performance clock${
          hasComponent(this.animationSpec, "camera") && !hasComponent(this.animationSpec, "construction")
            ? " · pan speed = export duration below"
            : ""
        }</p>
        <div class="row">
          <button type="button" class="primary" id="cfg-play">${this.playing ? "Pause" : "Play"}</button>
        </div>
        <details class="advanced">
          <summary>Export / Record</summary>
          <label>Export duration (s)</label>
          <input id="cfg-dur" type="number" value="${this.anim.durationSec}" step="0.5" />
          <label>Source</label>
          <select id="cfg-anim-source">${caps.sources
            .map(
              (s) =>
                `<option value="${s}" ${src === s ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`,
            )
            .join("")}</select>
          <label>Motion</label>
          <select id="cfg-anim-motion">${motions
            .map(
              (m) =>
                `<option value="${m}" ${this.animationSpec.motion === m ? "selected" : ""}>${m}</option>`,
            )
            .join("")}</select>
          <label>End (export)</label>
          <select id="cfg-anim-end">
            ${(["continuous", "hold", "loop", "ping-pong", "restart", "stop"] as AnimationEndBehavior[])
              .map(
                (e) =>
                  `<option value="${e}" ${this.animationSpec.endBehavior === e ? "selected" : ""}>${e}</option>`,
              )
              .join("")}
          </select>
          <label>Easing</label>
          <select id="cfg-anim-easing">
            ${(["linear", "ease-in-out", "ease-in", "ease-out"] as AnimationEasing[])
              .map(
                (e) =>
                  `<option value="${e}" ${this.animationSpec.easing === e ? "selected" : ""}>${e}</option>`,
              )
              .join("")}
          </select>
          ${
            src === "camera" || this.animationSpec.components.includes("camera")
              ? `
          <label>Pan preset</label>
          <select id="cfg-pan-preset">${panPresets
            .map(
              (p) =>
                `<option value="${p}" ${this.animationSpec.camera.panPreset === p ? "selected" : ""}>${p}</option>`,
            )
            .join("")}</select>
          `
              : ""
          }
          <label>Target FPS / format</label>
          <div class="row">
            <input id="cfg-fps" type="number" value="${this.anim.fps}" />
            <select id="cfg-anim-fmt">
              <option value="webp" ${this.animFormat === "webp" ? "selected" : ""}>WebP</option>
              <option value="apng" ${this.animFormat === "apng" ? "selected" : ""}>APNG</option>
              <option value="webm" ${this.animFormat === "webm" ? "selected" : ""}>WebM</option>
              <option value="gif" ${this.animFormat === "gif" ? "selected" : ""}>GIF</option>
            </select>
          </div>
          <button type="button" class="primary" id="cfg-anim-export">Export animation</button>
        </details>`;
      })() : ""}
      ${this.mode === "react" ? `
        <h2>Audio</h2>
        <button type="button" class="primary" id="cfg-mic">${this.audioEnabled ? "Mic active" : "Enable microphone"}</button>
        <label>Sensitivity</label>
        <select id="cfg-sensitivity">
          ${(["subtle", "balanced", "aggressive"] as ReactSensitivity[]).map((s) => `<option value="${s}" ${this.reactSensitivity === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <div class="level"><span id="cfg-level"></span></div>
        <p class="muted">Browser owns getUserMedia — silence still evolves the system.</p>
      ` : ""}
      <h2>Color</h2>
      <label>Color mode</label>
      <select id="cfg-color-mode">
        <option value="solid" ${this.color.mode === "solid" ? "selected" : ""}>Solid</option>
        <option value="ramp" ${this.color.mode === "ramp" ? "selected" : ""}>Ramp</option>
        <option value="gradient" ${this.color.mode === "gradient" ? "selected" : ""}>Gradient</option>
      </select>
      <label>Primary</label>
      <div class="row">
        <input id="cfg-color-primary" type="color" value="${this.color.primary.value}" />
        <span class="muted">${this.color.primary.value}</span>
      </div>
      <label>Background</label>
      <div class="row">
        <input id="cfg-color-bg" type="color" value="${this.color.background.value}" ${this.color.transparentBackground ? "disabled" : ""} />
        <label><input id="cfg-color-transparent" type="checkbox" ${this.color.transparentBackground ? "checked" : ""} /> transparent</label>
      </div>
      <label>Ramp preset</label>
      <select id="cfg-ramp-preset">
        ${RAMP_PRESET_LIST.map((r) => `<option value="${r.id}" ${this.color.rampPreset === r.id ? "selected" : ""}>${r.label}</option>`).join("")}
      </select>
      <label>Solid presets</label>
      <select id="cfg-solid-preset">
        <option value="">(custom)</option>
        ${SOLID_PRESETS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}
      </select>
      <label>Mapping</label>
      <select id="cfg-ramp-mapping">
        ${rampMappingsForPiece(this.pieceId)
          .map(
            (m) =>
              `<option value="${m}" ${this.color.rampMapping === m ? "selected" : ""}>${m}</option>`,
          )
          .join("")}
      </select>
      <div id="cfg-ramp-preview" style="height:12px;border-radius:4px;margin:0.35rem 0;background:linear-gradient(90deg,${this.color.ramp.stops.map((s) => `${s.color.value} ${s.t * 100}%`).join(",")})"></div>
      <h2>Parameters</h2>
      ${getPieceRuntime(this.pieceId).paramSchema
        .filter((f) => f.key !== "hue")
        .map((f) => {
          const val = this.params[f.key] ?? f.default;
          if (f.type === "choice") {
            return `<label>${f.label}</label><select data-param="${f.key}">${(f.choices || [])
              .map(
                (c) =>
                  `<option value="${c}" ${String(val) === c ? "selected" : ""}>${c || "(none)"}</option>`,
              )
              .join("")}</select>`;
          }
          if (f.type === "boolean") {
            return `<label><input type="checkbox" data-param="${f.key}" ${val ? "checked" : ""} /> ${f.label}</label>`;
          }
          return `<label>${f.label}</label><input data-param="${f.key}" type="range" min="${f.min ?? 0}" max="${f.max ?? 1}" step="${f.step ?? 0.01}" value="${Number(val)}" />`;
        })
        .join("")}
      <details class="advanced">
        <summary>Advanced / meta / seeds</summary>
        <label>Hue (advanced)</label>
        <input id="cfg-hue-adv" type="range" min="0" max="1" step="0.01" value="${Number(this.params.hue ?? 0.08)}" />
        <label>Meta: organic ↔ geometric</label>
        <input id="cfg-meta-organic" type="range" min="0" max="1" step="0.01" value="${this.meta.organic}" />
        <label>Meta: still ↔ kinetic</label>
        <input id="cfg-meta-kinetic" type="range" min="0" max="1" step="0.01" value="${this.meta.kinetic}" />
        <label>Locks</label>
        <div class="row">
          <label><input id="cfg-lock-density" type="checkbox" ${this.locked.has("density") ? "checked" : ""} /> density</label>
          <label><input id="cfg-lock-chaos" type="checkbox" ${this.locked.has("chaos") ? "checked" : ""} /> chaos</label>
          <label><input id="cfg-lock-hue" type="checkbox" ${this.locked.has("hue") ? "checked" : ""} /> hue</label>
          <label><input id="cfg-lock-color" type="checkbox" ${this.locked.has("color") ? "checked" : ""} /> color</label>
          <label><input id="cfg-lock-ramp" type="checkbox" ${this.locked.has("ramp") ? "checked" : ""} /> ramp</label>
          <label><input id="cfg-lock-seed" type="checkbox" ${this.locked.has("seed") ? "checked" : ""} /> seed</label>
        </div>
        <div class="row">
          <label><input id="cfg-lock-palette" type="checkbox" ${this.locked.has("palette") ? "checked" : ""} /> palette</label>
          <label><input id="cfg-lock-style" type="checkbox" ${this.locked.has("style") ? "checked" : ""} /> style</label>
          <label><input id="cfg-lock-comp" type="checkbox" ${this.locked.has("composition") ? "checked" : ""} /> composition</label>
        </div>
        <button type="button" id="cfg-save">Save Seed State</button>
        <button type="button" id="cfg-load-seeds">Refresh saved seeds</button>
        <div id="seed-list" class="muted"></div>
      </details>
      <div class="row" style="margin-top:0.5rem">
        <button type="button" id="cfg-browser">Pieces</button>
        <button type="button" id="cfg-hide">Hide (Tab)</button>
      </div>
    `;

    el.querySelector("#cfg-piece")?.addEventListener("change", (e) => {
      void this.setPiece((e.target as HTMLSelectElement).value);
    });
    el.querySelector("#cfg-seed")?.addEventListener("change", (e) => {
      this.seed = Number((e.target as HTMLInputElement).value) >>> 0;
      void this.applyPieceScene();
      this.pushHistory();
    });
    el.querySelector("#cfg-rand")?.addEventListener("click", () => void this.randomizeSeed());
    el.querySelector("#cfg-export")?.addEventListener("click", () => {
      if (this.exportKind === "still") void this.exportCurrent();
      else void this.exportAnim();
    });
    el.querySelector("#cfg-svg")?.addEventListener("click", () => void this.exportSvg());
    el.querySelector("#cfg-variants")?.addEventListener("click", () => void this.exploreVariants());
    el.querySelector("#cfg-series")?.addEventListener("click", () => void this.exploreSeries());
    el.querySelector("#cfg-animate-this")?.addEventListener("click", () => void this.animateThis());
    el.querySelector("#cfg-pack-add")?.addEventListener("click", () => this.addCurrentToPack("still"));
    el.querySelector("#cfg-pack-add-anim")?.addEventListener("click", () =>
      this.addCurrentToPack("animation"),
    );
    el.querySelector("#cfg-pack-favs")?.addEventListener("click", () => this.addFavoritesToPack());
    el.querySelector("#cfg-pack-midnight")?.addEventListener("click", () =>
      void this.loadMidnightPackFixture(),
    );
    el.querySelector("#cfg-pack-episode1")?.addEventListener("click", () =>
      void this.loadEpisode1PackFixture(),
    );
    el.querySelector("#cfg-pack-name")?.addEventListener("change", (e) => {
      this.pack.name = (e.target as HTMLInputElement).value;
      savePackDraft(this.pack);
    });
    el.querySelector("#cfg-pack-still")?.addEventListener("change", (e) => {
      this.pack.still_preset = (e.target as HTMLSelectElement).value as PflPack["still_preset"];
      savePackDraft(this.pack);
    });
    el.querySelector("#cfg-pack-export")?.addEventListener("click", () => void this.exportCurrentPack(false));
    el.querySelector("#cfg-pack-preview")?.addEventListener("click", () => void this.exportCurrentPack(true));
    el.querySelector("#cfg-pack-reload")?.addEventListener("click", () => void this.reloadPackFromDisk());
    el.querySelectorAll<HTMLSelectElement>("[data-pack-kind]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-pack-kind")!;
        this.updatePackItem(id, { kind: sel.value as PackItemKind });
        this.renderConfig();
      });
    });
    el.querySelectorAll<HTMLSelectElement>("[data-pack-anim]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-pack-anim")!;
        this.updatePackItem(id, { animPreset: sel.value as PackItem["animPreset"] });
      });
    });
    el.querySelectorAll<HTMLButtonElement>("[data-pack-up]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const from = Number(btn.getAttribute("data-pack-up"));
        this.movePackItem(from, from - 1);
      });
    });
    el.querySelectorAll<HTMLButtonElement>("[data-pack-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const from = Number(btn.getAttribute("data-pack-down"));
        this.movePackItem(from, from + 1);
      });
    });
    el.querySelectorAll<HTMLButtonElement>("[data-pack-rm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-pack-rm")!;
        this.removePackItem(id);
      });
    });
    el.querySelector("#cfg-batch")?.addEventListener("change", (e) => {
      this.variantBatch = Number((e.target as HTMLSelectElement).value) || 12;
    });
    el.querySelector("#cfg-mutation")?.addEventListener("change", (e) => {
      this.mutationScale = (e.target as HTMLSelectElement).value as MutationScale;
    });
    el.querySelector("#cfg-style")?.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      this.pflStyleId = id;
      if (id) {
        this.params = applyStyle(this.params, id);
        if (this.locked.has("style")) {
          /* style lock keeps future mutations from replacing style keys */
        }
      }
      void this.applyPieceScene();
      toast(id ? `style ${id}` : "style cleared");
    });
    el.querySelector("#cfg-sensitivity")?.addEventListener("change", (e) => {
      this.reactSensitivity = (e.target as HTMLSelectElement).value as ReactSensitivity;
      void this.applyPieceScene();
      toast(`sensitivity ${this.reactSensitivity}`);
    });
    el.querySelector("#cfg-export-kind")?.addEventListener("change", (e) => {
      this.exportKind = (e.target as HTMLSelectElement).value as typeof this.exportKind;
    });
    el.querySelector("#cfg-comp")?.addEventListener("change", (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.compositionId = v || null;
      void this.applyPieceScene();
    });
    el.querySelector("#cfg-preset")?.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const preset = presetsForPiece(this.pieceId).find((p) => p.id === id);
      if (!preset) return;
      for (const [k, v] of Object.entries(preset.parameters)) {
        this.params[k] = v as number | string | boolean;
        if (typeof v === "number") {
          this.session?.runtime.getPiece("L0")?.setParameter(k, v);
        }
      }
      void this.applyPieceScene();
      toast(`preset ${preset.label}`);
    });
    el.querySelector("#cfg-play")?.addEventListener("click", () => {
      this.togglePlay();
      this.renderConfig();
    });
    el.querySelector("#cfg-perf-comp")?.addEventListener("change", (e) => {
      const v = (e.target as HTMLSelectElement).value;
      void this.setPerformanceComposition(v || null);
    });
    el.querySelectorAll<HTMLInputElement>("[data-layer-enable]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-layer-enable")!;
        this.session?.setLayerPerformanceState(id, { enabled: input.checked });
        this.kickLiveSurface();
      });
    });
    el.querySelectorAll<HTMLInputElement>("[data-layer-opacity]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.getAttribute("data-layer-opacity")!;
        this.session?.setLayerPerformanceState(id, { opacity: Number(input.value) });
        this.kickLiveSurface();
      });
    });
    el.querySelectorAll<HTMLSelectElement>("[data-layer-blend]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-layer-blend")!;
        this.session?.setLayerPerformanceState(id, { blend: sel.value as BlendMode });
        this.kickLiveSurface();
      });
    });
    el.querySelector("#cfg-layer-swap")?.addEventListener("click", () => {
      if (this.session?.swapLayerOrder("L0", "L1")) this.kickLiveSurface();
    });
    el.querySelector("#cfg-prev-piece")?.addEventListener("click", () => void this.cyclePiece(-1));
    el.querySelector("#cfg-next-piece")?.addEventListener("click", () => void this.cyclePiece(1));
    el.querySelector("#cfg-random-piece")?.addEventListener("click", () => void this.cycleRandomPiece());
    el.querySelector("#cfg-visual-switch")?.addEventListener("change", (e) => {
      this.visualSwitchMode = (e.target as HTMLSelectElement).value as "off" | "random";
      if (this.visualSwitchMode === "random") this.initVisualSequencer();
      else this.visualSequencer = null;
      this.renderConfig();
    });
    el.querySelector("#cfg-visual-interval")?.addEventListener("change", (e) => {
      this.visualSwitchIntervalSec = Math.min(
        600,
        Math.max(5, Number((e.target as HTMLInputElement).value) || 30),
      );
      if (this.visualSequencer) this.visualSequencer.intervalSec = this.visualSwitchIntervalSec;
    });
    el.querySelector("#cfg-piece-transition")?.addEventListener("change", (e) => {
      this.pieceTransition = (e.target as HTMLSelectElement).value as PerformanceTransition;
    });
    el.querySelector("#cfg-anim-export")?.addEventListener("click", () => void this.exportAnim());
    el.querySelector("#cfg-anim-fmt")?.addEventListener("change", (e) => {
      this.animFormat = (e.target as HTMLSelectElement).value as typeof this.animFormat;
    });
    el.querySelector("#cfg-anim-method")?.addEventListener("change", (e) => {
      this.applyAnimationMethodId((e.target as HTMLSelectElement).value);
    });
    el.querySelector("#cfg-random-interval")?.addEventListener("change", (e) => {
      this.randomIntervalSec = Math.min(
        300,
        Math.max(1, Number((e.target as HTMLInputElement).value) || 10),
      );
      if (this.randomSequencer) this.randomSequencer.state.methodIntervalSec = this.randomIntervalSec;
      this.renderConfig();
    });
    el.querySelector("#cfg-seq-seed")?.addEventListener("change", (e) => {
      this.animationSequenceSeed = Number((e.target as HTMLInputElement).value) || 137;
      if (this.animationMethodId === RANDOM_METHOD_ID) this.initRandomSequencer();
      this.renderConfig();
    });
    el.querySelector("#cfg-random-next")?.addEventListener("click", () => this.advanceRandomMethod());
    el.querySelector("#cfg-anim-source")?.addEventListener("change", (e) => {
      this.animationSpec.source = (e.target as HTMLSelectElement).value as AnimationSource;
      const caps = animationCapabilitiesFor(this.pieceId);
      if (!caps.motions.includes(this.animationSpec.motion)) {
        this.animationSpec.motion =
          this.animationSpec.source === "camera" ? "pan" : caps.defaultMotion;
      }
      if (this.animationSpec.source === "camera") {
        this.animationSpec.camera.motion = "pan";
        const views = panPresetViews(this.animationSpec.camera.panPreset);
        this.animationSpec.camera.start = views.start;
        this.animationSpec.camera.end = views.end;
      }
      this.syncAnimationSpecToSession();
      this.renderConfig();
    });
    el.querySelector("#cfg-anim-motion")?.addEventListener("change", (e) => {
      this.animationSpec.motion = (e.target as HTMLSelectElement).value;
      if (this.animationSpec.source === "camera") {
        this.animationSpec.camera.motion =
          this.animationSpec.motion === "pan-zoom"
            ? "pan-zoom"
            : this.animationSpec.motion === "zoom"
              ? "zoom"
              : "pan";
        if (this.animationSpec.motion === "zoom") {
          this.animationSpec.camera.zoomMode = "in";
        }
      }
      this.syncAnimationSpecToSession();
    });
    el.querySelector("#cfg-anim-end")?.addEventListener("change", (e) => {
      this.animationSpec.endBehavior = (e.target as HTMLSelectElement)
        .value as AnimationEndBehavior;
      this.syncAnimationSpecToSession();
    });
    el.querySelector("#cfg-anim-easing")?.addEventListener("change", (e) => {
      this.animationSpec.easing = (e.target as HTMLSelectElement).value as AnimationEasing;
      this.syncAnimationSpecToSession();
    });
    el.querySelector("#cfg-pan-preset")?.addEventListener("change", (e) => {
      this.animationSpec.camera.panPreset = (e.target as HTMLSelectElement).value as PanPreset;
      const views = panPresetViews(this.animationSpec.camera.panPreset);
      this.animationSpec.camera.start = views.start;
      this.animationSpec.camera.end = views.end;
      this.syncAnimationSpecToSession();
    });
    el.querySelector("#cfg-mic")?.addEventListener("click", () => void this.enableMic());
    el.querySelector("#cfg-save")?.addEventListener("click", () => void this.saveSeedState());
    el.querySelector("#cfg-browser")?.addEventListener("click", () => {
      this.toggleBrowserVisible();
    });
    el.querySelector("#cfg-hide")?.addEventListener("click", () => {
      this.controlsVisible = false;
      this.prefs.controlsVisible = false;
      this.persist();
      this.syncChrome();
    });
    el.querySelector("#cfg-res")?.addEventListener("change", (e) => {
      this.exportPreset = (e.target as HTMLSelectElement).value;
    });
    el.querySelector("#cfg-frame")?.addEventListener("change", (e) => {
      this.frame = Number((e.target as HTMLInputElement).value) | 0;
      void this.applyPieceScene();
    });
    el.querySelector("#cfg-fps")?.addEventListener("change", (e) => {
      this.anim.fps = Number((e.target as HTMLInputElement).value) || 30;
    });
    el.querySelector("#cfg-dur")?.addEventListener("change", (e) => {
      this.anim.durationSec = Number((e.target as HTMLInputElement).value) || 4;
      this.animationSpec.durationSec = this.anim.durationSec;
      this.syncAnimationSpecToSession();
    });
    el.querySelectorAll<HTMLElement>("[data-param]").forEach((node) => {
      const key = node.getAttribute("data-param")!;
      const apply = () => {
        if (node instanceof HTMLInputElement && node.type === "checkbox") {
          this.params[key] = node.checked;
        } else if (node instanceof HTMLSelectElement) {
          this.params[key] = node.value;
        } else if (node instanceof HTMLInputElement) {
          const v = Number(node.value);
          this.params[key] = v;
          this.session?.runtime.getPiece("L0")?.setParameter(key, v);
          this.refreshAnimationBaseParams();
        }
        if (studioSurface(this.pieceId, this.mode) === "api-preview") {
          this.scheduleGeneratePreview();
        }
      };
      node.addEventListener("input", apply);
      node.addEventListener("change", apply);
    });
    el.querySelector("#cfg-meta-organic")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.meta.organic = v;
      this.params = {
        ...this.params,
        ...applyMetaAxis(
          Object.fromEntries(
            Object.entries(this.params).filter(([, v]) => typeof v === "number"),
          ) as Record<string, number>,
          "organic",
          v,
        ),
      };
      this.params.density = 0.95 - v * 0.55;
      this.session?.runtime.getPiece("L0")?.setParameter("chaos", Number(this.params.chaos));
      this.session?.runtime.getPiece("L0")?.setParameter("density", Number(this.params.density));
      if (studioSurface(this.pieceId, this.mode) === "api-preview") this.scheduleGeneratePreview();
    });
    el.querySelector("#cfg-meta-kinetic")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.meta.kinetic = v;
      this.params = {
        ...this.params,
        ...applyMetaAxis(
          Object.fromEntries(
            Object.entries(this.params).filter(([, v]) => typeof v === "number"),
          ) as Record<string, number>,
          "kinetic",
          v,
        ),
      };
      this.session?.runtime.getPiece("L0")?.setParameter("zoom", Number(this.params.zoom ?? 1));
      if (studioSurface(this.pieceId, this.mode) === "api-preview") this.scheduleGeneratePreview();
    });
    el.querySelector("#cfg-color-mode")?.addEventListener("change", (e) => {
      this.color.mode = (e.target as HTMLSelectElement).value as ColorConfig["mode"];
      this.persist();
      this.applyLiveColor(true);
    });
    el.querySelector("#cfg-color-primary")?.addEventListener("input", (e) => {
      if (this.locked.has("color")) return;
      this.color.primary.value = (e.target as HTMLInputElement).value;
      this.color.mode = "solid";
      this.applyLiveColor();
    });
    el.querySelector("#cfg-color-bg")?.addEventListener("input", (e) => {
      if (this.locked.has("color")) return;
      this.color.background.value = (e.target as HTMLInputElement).value;
      this.applyLiveColor(true);
    });
    el.querySelector("#cfg-color-transparent")?.addEventListener("change", (e) => {
      this.color.transparentBackground = (e.target as HTMLInputElement).checked;
      this.applyLiveColor(true);
    });
    el.querySelector("#cfg-ramp-preset")?.addEventListener("change", (e) => {
      if (this.locked.has("ramp")) return;
      this.applyColorPreset((e.target as HTMLSelectElement).value);
      this.renderConfig();
    });
    el.querySelector("#cfg-solid-preset")?.addEventListener("change", (e) => {
      if (this.locked.has("color")) return;
      const id = (e.target as HTMLSelectElement).value;
      const preset = SOLID_PRESETS.find((s) => s.id === id);
      if (!preset) return;
      this.color.mode = "solid";
      this.color.primary = { ...preset.color };
      this.applyLiveColor();
      this.renderConfig();
    });
    el.querySelector("#cfg-ramp-mapping")?.addEventListener("change", (e) => {
      this.color.rampMapping = (e.target as HTMLSelectElement).value as ColorConfig["rampMapping"];
      this.applyLiveColor(true);
    });
    el.querySelector("#cfg-hue-adv")?.addEventListener("input", (e) => {
      if (this.locked.has("hue")) return;
      const v = Number((e.target as HTMLInputElement).value);
      this.params.hue = v;
      this.session?.runtime.getPiece("L0")?.setParameter("hue", v);
      if (studioSurface(this.pieceId, this.mode) === "api-preview") this.scheduleGeneratePreview();
    });
    const bindLock = (id: string, key: string) => {
      el.querySelector(id)?.addEventListener("change", (e) => {
        if ((e.target as HTMLInputElement).checked) this.locked.add(key);
        else this.locked.delete(key);
      });
    };
    bindLock("#cfg-lock-density", "density");
    bindLock("#cfg-lock-chaos", "chaos");
    bindLock("#cfg-lock-hue", "hue");
    bindLock("#cfg-lock-color", "color");
    bindLock("#cfg-lock-ramp", "ramp");
    bindLock("#cfg-lock-seed", "seed");
    bindLock("#cfg-lock-palette", "palette");
    bindLock("#cfg-lock-style", "style");
    bindLock("#cfg-lock-comp", "composition");
    el.querySelector("#cfg-load-seeds")?.addEventListener("click", () => void this.refreshSeedList());
    void this.refreshSeedList();
  }

  private async refreshSeedList(): Promise<void> {
    const host = document.getElementById("seed-list");
    if (!host) return;
    const seeds = await listSeeds();
    host.innerHTML = seeds.length
      ? seeds
          .slice(0, 12)
          .map(
            (s) =>
              `<div><button type="button" data-seed="${s.id}" style="width:auto;margin:0.15rem 0">${s.pieceId} · ${s.seed}</button></div>`,
          )
          .join("")
      : "No saved seeds yet";
    host.querySelectorAll<HTMLButtonElement>("button[data-seed]").forEach((b) => {
      b.addEventListener("click", () => void this.loadSeedRecord(b.dataset.seed!));
    });
  }

  async exportSvg(): Promise<void> {
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piece: this.pieceId,
          seed: this.seed,
          width: 2048,
          height: 2048,
          format: "svg",
          parameters: this.params,
        }),
      });
      if (!res.ok) {
        toast("SVG export requires local render API / geometry piece");
        return;
      }
      const text = await res.text();
      exportSvgText(text, `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.svg`);
      toast("SVG exported");
    } catch {
      toast("SVG export unavailable");
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = Date.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0]! > 1000) this.frameTimes.shift();
    this.fps = this.frameTimes.length;
    if (
      this.mode === "animate" &&
      studioSurface(this.pieceId, this.mode) === "api-preview" &&
      this.session &&
      this.playing
    ) {
      const nowPerf = performance.now();
      if (this.lastAnimTickMs <= 0) this.lastAnimTickMs = nowPerf;
      const dt = (nowPerf - this.lastAnimTickMs) / 1000;
      this.lastAnimTickMs = nowPerf;
      this.session.animationRuntime.tick(dt, true);
      if (this.apiPreviewUsesCamera()) {
        this.paintApiPreviewCamera(this.session.animationRuntime.evaluate().camera);
      }
    }

    if (
      this.mode === "animate" &&
      this.animationMethodId === RANDOM_METHOD_ID &&
      this.playing &&
      this.randomSequencer &&
      this.session
    ) {
      const nowPerf = performance.now();
      const dt = this.lastRandomTickMs > 0 ? (nowPerf - this.lastRandomTickMs) / 1000 : 0;
      const next = this.randomSequencer.tick(dt);
      if (next) {
        this.activeAnimationMethodId = next;
        this.animationSpec = resolveLivePerformanceMethodSpec(this.pieceId, next, this.mode);
        this.syncAnimationSpecToSession(false, { resetTime: true });
        this.renderConfig();
      }
      this.lastRandomTickMs = nowPerf;
    }

    if (
      this.mode === "animate" &&
      this.visualSwitchMode === "random" &&
      this.playing &&
      this.visualSequencer
    ) {
      const dt = this.lastVisualSwitchMs > 0 ? (now - this.lastVisualSwitchMs) / 1000 : 0;
      const nextPiece = this.visualSequencer.tick(dt, this.pieceId);
      if (nextPiece && nextPiece !== this.pieceId) void this.setPiece(nextPiece);
      this.lastVisualSwitchMs = now;
    }

    if (this.mode === "animate" && studioSurface(this.pieceId, this.mode) === "live" && this.session) {
      const diag = this.session.getDiagnostics();
      const warmupMs = Date.now() - this.pieceLoadedAt;
      if (diag.pixelDigest && diag.pixelDigest !== this.lastVisualDigest) {
        this.lastVisualDigest = diag.pixelDigest;
        this.lastVisualChangeMs = now;
        this.stallError = "";
        const stallBanner = document.getElementById("unsupported-banner");
        if (stallBanner?.textContent?.startsWith("Animation stalled")) {
          stallBanner.classList.remove("visible");
        }
      }
      if (warmupMs > 2500 && diag.rafStalled && !document.hidden) {
        this.stallError = [
          "RAF STALLED",
          `piece: ${this.pieceId}`,
          `rafCount: ${diag.rafCount}`,
          `rafHz: ${diag.rafHz.toFixed(1)}`,
        ].join("\n");
        const stallBanner = document.getElementById("unsupported-banner");
        if (stallBanner) {
          stallBanner.textContent = this.stallError;
          stallBanner.classList.add("visible");
        }
      } else if (
        warmupMs > 2500 &&
        diag.renderCount > 0 &&
        (diag.visualLiveness?.status === "stalled" ||
          (() => {
            const pf = diag.presentedFrame;
            if (!pf) return false;
            const meta = performanceMeta(this.pieceId);
            const q = classifyVisualQuality(
              snapshotFromFrame(pf),
              {
                density: meta?.density ?? "medium",
                motion: meta?.motion ?? "moderate",
              },
              (now - this.lastVisualChangeMs) / 1000,
              this.playing,
              warmupMs / 1000,
            );
            return (
              q.status === "degenerate-dark" ||
              q.status === "degenerate-flat" ||
              q.status === "static"
            );
          })() ||
          (now - this.lastVisualChangeMs > 4500 &&
            !this.session.runtime.isSimulationPaused() &&
            !this.session.runtime.isPieceUpdatesFrozen()))
      ) {
        const kind = rendererKindFor(this.pieceId, this.mode) ?? "unsupported";
        const animSt = this.session.animationRuntime.evaluate();
        this.stallError = [
          "Animation stalled",
          `piece: ${this.pieceId}`,
          `backend: ${kind}`,
          `update count: ${diag.updateCount}`,
          `render count: ${diag.renderCount}`,
          `present count: ${diag.presentCount}`,
          `phase: ${animSt.phase.toFixed(3)}`,
          `cyclePhase: ${animSt.cyclePhase.toFixed(3)}`,
          diag.visualLiveness?.stallReason ?? "",
        ].join("\n");
        const stallBanner = document.getElementById("unsupported-banner");
        if (stallBanner) {
          stallBanner.textContent = this.stallError;
          stallBanner.classList.add("visible");
        }
      }
      this.frame = diag.logicalFrame;
    }
    if (this.hudVisible && now - this.lastHud > 200) {
      this.lastHud = now;
      const hud = document.getElementById("hud");
      const kind = rendererKindFor(this.pieceId, this.mode) ?? "unsupported";
      const diag = this.session?.getDiagnostics();
      if (hud) {
        hud.textContent = [
          `FPS ${this.fps}`,
          `visualFps ${diag?.visualFps?.toFixed(1) ?? "—"}`,
          `mode ${this.mode}`,
          `piece ${this.pieceId}`,
          `backend ${kind}`,
          `animBackend ${this.animBackend || kind}`,
          `seed ${this.seed}`,
          `logicalFrame ${diag?.logicalFrame ?? this.frame}`,
          `raf ${diag?.rafCount ?? 0} @ ${diag?.rafHz?.toFixed(1) ?? "—"}Hz`,
          `tick ${diag?.tickCount ?? 0}`,
          `updateCount ${diag?.updateCount ?? 0}`,
          `renderCount ${diag?.renderCount ?? 0}`,
          `presentCount ${diag?.presentCount ?? 0}`,
          `pixelDigest ${diag?.pixelDigest ?? "—"}`,
          `changedPx ${diag?.presentedFrame?.changedPixelFraction?.toFixed(4) ?? "—"}`,
          `lastDraw ${diag?.lastSuccessfulDrawMs ? new Date(diag.lastSuccessfulDrawMs).toISOString().slice(11, 23) : "—"}`,
          `displayedFrame ${this.displayedFrame || this.frame}`,
          `updateFps ${this.animUpdateFps.toFixed(1)}`,
          `latencyMs ${this.lastRenderMs.toFixed(0)}`,
          `playing ${this.playing ? "yes" : "pause"}`,
          `simPaused ${diag?.simulationPaused ? "yes" : "no"}`,
          `transport ${diag?.transportPlaying ? "run" : "stop"}`,
          `webgl ${diag?.webglError ?? this.webglStatus}`,
          `recipe ${this.recipeDigest || "—"}`,
          `state ${this.renderDigest || "—"}`,
          `surface ${studioSurface(this.pieceId, this.mode)}`,
          `canvas ${diag?.canvasWidth ?? this.canvas.width}x${diag?.canvasHeight ?? this.canvas.height}`,
          `css ${diag?.visibleCssWidth?.toFixed(0) ?? "?"}x${diag?.visibleCssHeight?.toFixed(0) ?? "?"}`,
          `audio ${this.audioEnabled ? "on" : "off"}`,
          `controls ${this.controlsVisible ? "shown" : "hidden"}`,
          `build ${buildInfoLine()}`,
          `BUILD_SHA ${BUILD_SHA}`,
          `BUILD_TIME ${BUILD_TIME}`,
        ].join("\n");
      }
    }
    const level = document.getElementById("cfg-level");
    if (level && this.session) {
      const e = this.session.getFeatures().energy;
      (level as HTMLElement).style.width = `${Math.min(100, e * 100)}%`;
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.stopApiAnim();
    this.preview.dispose();
    void this.session?.dispose();
  }
}
