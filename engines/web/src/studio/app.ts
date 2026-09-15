/**
 * NUMBRANE Studio — Generate / Animate / React visual instrument.
 */

import { LiveSession } from "../live/session";
import type { SetDef, QualityProfile, ResolutionPreset as LiveRes } from "../live/types";
import { LIVE_PIECE_IDS } from "../live/pieces/pieceModes";
import { createLivePiece } from "../live/pieces/registry";
import {
  createStudioRegistry,
  type CommandContext,
  type StudioMode,
} from "./keyboard/registry";
import { ExploreHistory, loadPrefs, savePrefs, type StudioPrefs } from "./prefs";
import { fetchPieceCatalog, matchesFilter, type PieceInfo } from "./catalog";
import { moreLikeThis, applyMetaAxis, type MetaAxis } from "./explore/variants";
import { COMPOSITIONS, compositionById } from "./compositions";
import { presetsForPiece, ANIM_ARCS } from "./presets";
import { apiExportAnimation, webpIsAnimated } from "./export/api";
import {
  RESOLUTION_PRESETS,
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
import {
  defaultsForPiece,
  getPieceRuntime,
  supportsMode,
} from "./runtime/registry";
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
  filter = "all";
  locked = new Set<string>();
  params: Record<string, number | string | boolean> = {
    chaos: 0.3,
    density: 0.7,
    zoom: 1,
    hue: 0.55,
    exposure: 1,
    rotation: 0,
  };
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
  animArc = "emergence";
  compositionId: string | null = null;
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
  private apiAnimTimer: number | null = null;
  private lastApiAnimMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.prefs = loadPrefs();
    this.mode = this.prefs.mode;
    this.pieceId = this.prefs.pieceId;
    this.seed = this.prefs.seed;
    this.controlsVisible = this.prefs.controlsVisible;
    this.history = new ExploreHistory(this.prefs.recent);
  }

  async boot(): Promise<void> {
    try {
      this.pieces = await fetchPieceCatalog();
    } catch {
      this.pieces = LIVE_PIECE_IDS.map((piece_id) => ({
        piece_id,
        capabilities: { still: true, animated: true, realtime: true, audio_reactive: true },
        family: piece_id.split("/")[0],
      }));
    }

    this.session = new LiveSession({
      canvas: this.canvas,
      seed: this.seed,
      outputOnly: false,
      transparent: false,
    });
    await this.session.init();
    this.params = { ...defaultsForPiece(this.pieceId), ...this.params };
    await this.applyPieceScene();

    this.wireKeyboard();
    this.wireModebar();
    this.wirePointerIdle();
    this.renderConfig();
    this.renderHelp();
    this.renderBrowser();
    this.syncChrome();
    this.syncUrl(false);
    this.pushHistory();

    window.__NUMBRANE_STUDIO__ = this;
    this.loop();
    toast("NUMBRANE Studio — press ? for keys");
  }

  private async applyPieceScene(): Promise<void> {
    this.stopApiAnim();
    const surface = studioSurface(this.pieceId, this.mode);
    const previewEl = document.getElementById("generate-preview") as HTMLImageElement | null;
    const statusEl = document.getElementById("gen-status");
    const banner = document.getElementById("unsupported-banner");
    this.unsupportedMessage = "";

    if (surface === "unsupported") {
      this.session?.runtime.transport.stop();
      this.canvas.classList.add("hidden-live");
      previewEl?.classList.remove("visible");
      statusEl?.classList.remove("visible");
      if (banner) {
        const modeLabel = this.mode.toUpperCase();
        this.unsupportedMessage = `This piece does not yet support ${modeLabel}`;
        banner.textContent = this.unsupportedMessage;
        banner.classList.add("visible");
      }
      this.syncChrome();
      return;
    }
    banner?.classList.remove("visible");

    if (surface === "api-preview") {
      this.session?.runtime.transport.stop();
      this.canvas.classList.add("hidden-live");
      previewEl?.classList.add("visible");
      this.scheduleGeneratePreview();
      if (this.mode === "animate" && this.playing) {
        this.startApiAnim();
      }
      this.syncChrome();
      return;
    }

    // Live surface (ANIMATE/REACT stateful, wasm, geometry-ir, shader-native)
    this.preview.cancel();
    this.canvas.classList.remove("hidden-live");
    previewEl?.classList.remove("visible");
    statusEl?.classList.remove("visible");
    if (!this.session) return;

    const mappings = defaultMappingsForPiece(this.pieceId).map((m, i) => ({
      id: `studio-${i}`,
      source: m.source.startsWith("audio.") ? m.source : `audio.${m.source}`,
      destination: `layer.L0.${m.target}`,
      amount: m.amount,
      min: 0,
      max: 2,
    }));
    const composition = this.compositionId ? compositionById(this.compositionId) : undefined;
    const liveMode = this.mode === "react" ? "react" : "animate";
    // Mashup slime-on-sdf: live = slime only (authentic RD trail), not fake SDF shader
    const livePieceId =
      this.pieceId === "mashups/slime-on-sdf" ? "growth/slime-mold" : this.pieceId;
    const set: SetDef = composition
      ? composition.build(this.seed, this.params as Record<string, number>)
      : {
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
                  piece: livePieceId,
                  opacity: 1,
                  blend: "normal",
                  seed: this.seed,
                  parameters: { ...this.params } as Record<string, number>,
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
      this.unsupportedMessage =
        err instanceof Error ? err.message : `Failed to load ${this.pieceId}`;
      if (banner) {
        banner.textContent = this.unsupportedMessage;
        banner.classList.add("visible");
      }
      toast(this.unsupportedMessage);
      return;
    }
    this.session.setSeed(this.seed);
    for (const layer of set.scenes[0]?.layers ?? []) {
      for (const [k, v] of Object.entries(this.params)) {
        if (typeof v === "number") {
          this.session.runtime.getPiece(layer.id)?.setParameter(k, v);
        }
      }
    }
    this.session.startLoop();
    if (this.mode === "generate") {
      this.playing = false;
      this.session.runtime.transport.stop();
    } else if (this.playing) {
      this.session.runtime.transport.start();
    }
    this.syncChrome();
  }

  private scheduleGeneratePreview(immediate = false): void {
    if (studioSurface(this.pieceId, this.mode) !== "api-preview") return;
    const { width, height } = previewSize();
    const req = {
      piece: this.pieceId,
      seed: this.seed,
      frame: this.frame,
      width,
      height,
      quality: "preview" as const,
      parameters: paramsForApi(this.params),
    };
    const img = document.getElementById("generate-preview") as HTMLImageElement | null;
    const status = document.getElementById("gen-status");
    const run = immediate
      ? this.preview.run.bind(this.preview)
      : (r: typeof req, a: (id: number) => void, b: (res: import("./generate/preview").GenerateResult) => void, c: (e: Error, id: number) => void) =>
          this.preview.schedule(r, 280, a, b, c);
    run(
      req,
      () => {
        this.generating = true;
        status?.classList.add("visible");
        if (status) status.textContent = "Generating…";
      },
      (result) => {
        this.generating = false;
        status?.classList.remove("visible");
        this.recipeDigest = result.recipeDigest;
        this.renderDigest = result.renderDigest;
        this.lastRenderMs = result.renderMs;
        if (img) {
          img.src = result.objectUrl;
          img.classList.add("visible");
        }
        this.syncChrome();
      },
      (err) => {
        this.generating = false;
        status?.classList.remove("visible");
        toast(err.message.slice(0, 120));
      },
    );
  }

  private startApiAnim(): void {
    this.stopApiAnim();
    this.lastApiAnimMs = performance.now();
    const tick = () => {
      if (!this.playing || studioSurface(this.pieceId, this.mode) !== "api-preview") {
        this.stopApiAnim();
        return;
      }
      const now = performance.now();
      const interval = 1000 / Math.max(1, this.anim.fps);
      if (now - this.lastApiAnimMs >= interval) {
        this.lastApiAnimMs = now;
        this.frame += 1;
        this.scheduleGeneratePreview(true);
      }
      this.apiAnimTimer = window.setTimeout(tick, 16);
    };
    this.apiAnimTimer = window.setTimeout(tick, 16);
  }

  private stopApiAnim(): void {
    if (this.apiAnimTimer !== null) {
      window.clearTimeout(this.apiAnimTimer);
      this.apiAnimTimer = null;
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
        id: "prev",
        keys: "[",
        match: ["["],
        label: "Previous piece",
        group: "global",
        handler: () => void this.cyclePiece(-1),
      },
      {
        id: "next",
        keys: "]",
        match: ["]"],
        label: "Next piece",
        group: "global",
        handler: () => void this.cyclePiece(1),
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
          else if (this.browserVisible) this.browserVisible = false;
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
          this.browserVisible = !this.browserVisible;
          this.syncChrome();
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
        const m = btn.dataset.mode as StudioMode;
        void this.setMode(m);
      });
    });
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
    this.mode = mode;
    this.prefs.mode = mode;
    this.persist();
    document.querySelectorAll<HTMLButtonElement>("#modebar button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
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
    if (!supportsMode(this.pieceId, mode)) {
      toast(`This piece does not yet support ${mode.toUpperCase()}`);
    } else {
      toast(`${mode.toUpperCase()} mode`);
    }
  }

  async setPiece(pieceId: string): Promise<void> {
    this.pieceId = pieceId;
    this.prefs.pieceId = pieceId;
    // Reset to piece defaults; keep shared meta axes that map meaningfully
    const defaults = defaultsForPiece(pieceId);
    const next: Record<string, number | string | boolean> = { ...defaults };
    for (const key of ["density", "chaos", "hue", "zoom"] as const) {
      if (key in defaults && typeof this.params[key] === "number") {
        next[key] = this.params[key]!;
      }
    }
    this.params = next;
    this.compositionId = null;
    this.frame = 0;
    this.persist();
    await this.applyPieceScene();
    this.pushHistory();
    this.renderConfig();
    this.renderBrowser();
    this.syncUrl(true);
  }

  async randomizeSeed(): Promise<void> {
    if (this.locked.has("seed")) {
      toast("seed locked");
      return;
    }
    this.seed = cryptoSeed();
    this.prefs.seed = this.seed;
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
      else this.stopApiAnim();
      return;
    }
    if (this.playing) this.session?.runtime.transport.start();
    else this.session?.runtime.transport.stop();
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

  async cyclePiece(dir: number): Promise<void> {
    const ids = this.pieces.map((p) => p.piece_id);
    const i = Math.max(0, ids.indexOf(this.pieceId));
    const next = ids[(i + dir + ids.length) % ids.length];
    if (next) await this.setPiece(next);
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
      { count, locked: this.locked },
    );
    this.variantCache = variants.map((v) => ({
      seed: v.seed,
      parameters: { ...v.parameters },
      label: v.label,
      thumbUrl: null as string | null,
    }));
    const host = document.getElementById("variants");
    if (!host) return;
    host.innerHTML = `<div class="variant-grid" style="display:grid;grid-template-columns:repeat(${Math.min(4, Math.ceil(Math.sqrt(count)))},1fr);gap:0.35rem"></div>`;
    const grid = host.querySelector(".variant-grid")!;
    toast(`generating ${count} variants…`);
    for (let i = 0; i < this.variantCache.length; i++) {
      const v = this.variantCache[i]!;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "variant-cell";
      cell.style.cssText =
        "padding:0;aspect-ratio:1;overflow:hidden;border:1px solid var(--line);background:#111";
      cell.innerHTML = `<span style="display:block;padding:0.25rem;font-size:10px">${v.label}</span>`;
      cell.title = `seed ${v.seed}`;
      cell.addEventListener("click", () => {
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
            quality: "preview",
            parameters: v.parameters,
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
    toast("variants ready — click to promote");
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
    toast(`exporting ${fmt}…`);
    try {
      // Prefer server-side deterministic frame render + FFmpeg encode
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
          parameters: this.params,
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
        const arc = ANIM_ARCS.find((a) => a.id === this.animArc);
        const result = await exportAnimation(cfg, async (frame, t) => {
          const t01 = cfg.durationSec > 0 ? t / cfg.durationSec : 0;
          if (arc) {
            const numeric: Record<string, number> = {};
            for (const [k, v] of Object.entries(this.params)) {
              if (typeof v === "number") numeric[k] = v;
            }
            const next = arc.apply(numeric, Math.min(1, Math.max(0, t01)));
            for (const [k, v] of Object.entries(next)) {
              if (typeof v === "number") {
                this.session?.runtime.getPiece("L0")?.setParameter(k, v);
              }
            }
          }
          this.session?.frame((frame / cfg.fps) * 1000);
          return this.canvas;
        });
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
    savePrefs(this.prefs);
  }

  private syncUrl(push: boolean): void {
    const u = new URL(location.href);
    u.pathname = u.pathname.includes("studio") ? u.pathname : "/studio.html";
    u.searchParams.set("mode", this.mode);
    u.searchParams.set("piece", this.pieceId);
    u.searchParams.set("seed", String(this.seed));
    if (push) history.replaceState(null, "", u);
  }

  syncChrome(): void {
    document.body.classList.toggle("controls-visible", this.controlsVisible);
    document.body.classList.toggle("controls-hidden", !this.controlsVisible);
    document.getElementById("config")?.classList.toggle("visible", this.controlsVisible);
    document.getElementById("help")?.classList.toggle("visible", this.helpVisible);
    document.getElementById("hud")?.classList.toggle("visible", this.hudVisible);
    document.getElementById("browser")?.classList.toggle("visible", this.browserVisible);
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
    const filters = [
      "all",
      "still",
      "animated",
      "realtime",
      "audio-reactive",
      "geometry",
      "growth",
      "fields",
      "fractals",
      "tiling",
      "particles",
      "mashups",
    ];
    const list = this.pieces.filter((p) => matchesFilter(p, this.filter));
    el.innerHTML = `
      <h1 style="font-family:Syne,sans-serif;margin:0 0 0.5rem">Pieces</h1>
      <div class="chips" id="filters"></div>
      <div id="piece-list"></div>
    `;
    const chips = el.querySelector("#filters")!;
    for (const f of filters) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f;
      if (f === this.filter) b.classList.add("on");
      b.addEventListener("click", () => {
        this.filter = f;
        this.renderBrowser();
      });
      chips.appendChild(b);
    }
    const host = el.querySelector("#piece-list")!;
    for (const p of list) {
      const div = document.createElement("div");
      div.className = "piece" + (p.piece_id === this.pieceId ? " selected" : "");
      const caps = p.capabilities || {};
      const rt = getPieceRuntime(p.piece_id);
      div.innerHTML = `<img class="thumb" data-piece="${p.piece_id}" alt="" />
        <div class="name">${p.title || p.name || p.piece_id}</div>
        <div class="meta">${p.family || p.piece_id.split("/")[0]} · gen:${rt.generate}
        ${caps.still ? "still " : ""}${caps.animated ? "anim " : ""}${caps.realtime ? "rt " : ""}${caps.audio_reactive ? "audio" : ""}</div>
        <div class="meta">${p.description || ""}</div>`;
      div.addEventListener("click", () => void this.setPiece(p.piece_id));
      host.appendChild(div);
    }
    // Lazy real thumbnails (actual /api/render) for visible catalog entries
    void this.loadBrowserThumbs(list.slice(0, 16).map((p) => p.piece_id));
  }

  private async loadBrowserThumbs(pieceIds: string[]): Promise<void> {
    for (const pieceId of pieceIds) {
      if (!supportsMode(pieceId, "generate")) continue;
      const img = document.querySelector<HTMLImageElement>(`#browser img.thumb[data-piece="${pieceId}"]`);
      if (!img || img.dataset.loaded) continue;
      try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            piece: pieceId,
            seed: 42,
            width: 160,
            height: 90,
            frame: 0,
            format: "png",
            quality: "preview",
            parameters: defaultsForPiece(pieceId),
          }),
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        img.dataset.loaded = "1";
      } catch {
        /* optional */
      }
    }
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
        <label>Variant batch</label>
        <select id="cfg-batch">
          ${[4, 9, 12, 16].map((n) => `<option value="${n}" ${this.variantBatch === n ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <button type="button" id="cfg-variants">More Like This</button>
        <div id="variants"></div>
      ` : ""}
      ${this.mode === "animate" ? `
        <label>FPS / duration (s)</label>
        <div class="row">
          <input id="cfg-fps" type="number" value="${this.anim.fps}" />
          <input id="cfg-dur" type="number" value="${this.anim.durationSec}" step="0.5" />
        </div>
        <label>Format</label>
        <select id="cfg-anim-fmt">
          <option value="webp" ${this.animFormat === "webp" ? "selected" : ""}>animated WebP</option>
          <option value="apng" ${this.animFormat === "apng" ? "selected" : ""}>APNG</option>
          <option value="webm" ${this.animFormat === "webm" ? "selected" : ""}>WebM</option>
          <option value="gif" ${this.animFormat === "gif" ? "selected" : ""}>GIF</option>
        </select>
        <label>Animation arc</label>
        <select id="cfg-arc">${ANIM_ARCS.map((a) => `<option value="${a.id}" ${this.animArc === a.id ? "selected" : ""}>${a.label}</option>`).join("")}</select>
        <div class="row">
          <button type="button" id="cfg-play">${this.playing ? "Pause" : "Play"}</button>
          <button type="button" class="primary" id="cfg-anim-export">Export animation</button>
        </div>
      ` : ""}
      ${this.mode === "react" ? `
        <h2>Audio</h2>
        <button type="button" class="primary" id="cfg-mic">${this.audioEnabled ? "Mic active" : "Enable microphone"}</button>
        <div class="level"><span id="cfg-level"></span></div>
        <p class="muted">Browser owns getUserMedia — Docker only serves the app.</p>
      ` : ""}
      <h2>Parameters</h2>
      ${getPieceRuntime(this.pieceId).paramSchema
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
        <label>Meta: organic ↔ geometric</label>
        <input id="cfg-meta-organic" type="range" min="0" max="1" step="0.01" value="${this.meta.organic}" />
        <label>Meta: still ↔ kinetic</label>
        <input id="cfg-meta-kinetic" type="range" min="0" max="1" step="0.01" value="${this.meta.kinetic}" />
        <label>Locks</label>
        <div class="row">
          <label><input id="cfg-lock-density" type="checkbox" ${this.locked.has("density") ? "checked" : ""} /> density</label>
          <label><input id="cfg-lock-chaos" type="checkbox" ${this.locked.has("chaos") ? "checked" : ""} /> chaos</label>
          <label><input id="cfg-lock-hue" type="checkbox" ${this.locked.has("hue") ? "checked" : ""} /> hue</label>
          <label><input id="cfg-lock-seed" type="checkbox" ${this.locked.has("seed") ? "checked" : ""} /> seed</label>
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
    el.querySelector("#cfg-batch")?.addEventListener("change", (e) => {
      this.variantBatch = Number((e.target as HTMLSelectElement).value) || 12;
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
    el.querySelector("#cfg-anim-export")?.addEventListener("click", () => void this.exportAnim());
    el.querySelector("#cfg-anim-fmt")?.addEventListener("change", (e) => {
      this.animFormat = (e.target as HTMLSelectElement).value as typeof this.animFormat;
    });
    el.querySelector("#cfg-arc")?.addEventListener("change", (e) => {
      this.animArc = (e.target as HTMLSelectElement).value;
    });
    el.querySelector("#cfg-mic")?.addEventListener("click", () => void this.enableMic());
    el.querySelector("#cfg-save")?.addEventListener("click", () => void this.saveSeedState());
    el.querySelector("#cfg-browser")?.addEventListener("click", () => {
      this.browserVisible = !this.browserVisible;
      this.syncChrome();
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
    const bindLock = (id: string, key: string) => {
      el.querySelector(id)?.addEventListener("change", (e) => {
        if ((e.target as HTMLInputElement).checked) this.locked.add(key);
        else this.locked.delete(key);
      });
    };
    bindLock("#cfg-lock-density", "density");
    bindLock("#cfg-lock-chaos", "chaos");
    bindLock("#cfg-lock-hue", "hue");
    bindLock("#cfg-lock-seed", "seed");
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
    if (this.hudVisible && now - this.lastHud > 200) {
      this.lastHud = now;
      const hud = document.getElementById("hud");
      const kind = rendererKindFor(this.pieceId, this.mode) ?? "unsupported";
      if (hud) {
        hud.textContent = [
          `FPS ${this.fps}`,
          `mode ${this.mode}`,
          `piece ${this.pieceId}`,
          `renderer ${kind}`,
          `seed ${this.seed}`,
          `frame ${this.frame}`,
          `recipe ${this.recipeDigest || "—"}`,
          `state ${this.renderDigest || "—"}`,
          `renderMs ${this.lastRenderMs.toFixed(0)}`,
          `surface ${studioSurface(this.pieceId, this.mode)}`,
          `res ${this.canvas.width}x${this.canvas.height}`,
          `audio ${this.audioEnabled ? "on" : "off"}`,
          `controls ${this.controlsVisible ? "shown" : "hidden"}`,
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
