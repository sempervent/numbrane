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

async function loadSet(id: string): Promise<SetDef> {
  const res = await fetch(`/sets/${id}.json`);
  if (!res.ok) throw new Error(`set ${id}: ${res.status}`);
  return (await res.json()) as SetDef;
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
  params: Record<string, number> = {
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
  audioEnabled = false;
  audioLevel = 0;
  currentSeedId: string | null = null;
  private idleTimer: number | null = null;
  private raf = 0;
  private lastHud = 0;
  private fps = 60;
  private frameTimes: number[] = [];

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
    if (!this.session) return;
    const mappings = defaultMappingsForPiece(this.pieceId).map((m, i) => ({
      id: `studio-${i}`,
      source: m.source.startsWith("audio.") ? m.source : `audio.${m.source}`,
      destination: `layer.L0.${m.target}`,
      amount: m.amount,
      min: 0,
      max: 2,
    }));
    const layers =
      this.pieceId === "mashups/slime-on-sdf"
        ? [
            {
              id: "L0",
              piece: "growth/slime-mold",
              opacity: 0.85,
              blend: "normal" as const,
              seed: this.seed,
              parameters: { ...this.params },
            },
            {
              id: "L1",
              piece: "fractals/sdf-raymarch2d",
              opacity: 0.55,
              blend: "screen" as const,
              seed: this.seed ^ 0x5f3759df,
              parameters: { ...this.params, density: Math.min(1, this.params.density * 0.8) },
            },
          ]
        : [
            {
              id: "L0",
              piece: this.pieceId,
              opacity: 1,
              blend: "normal" as const,
              seed: this.seed,
              parameters: { ...this.params },
            },
          ];
    const set: SetDef = {
      protocol_version: "0.1.0",
      set_id: "studio-session",
      name: "Studio",
      scenes: [
        {
          id: "main",
          name: this.pieceId,
          layers,
          modulation: mappings,
          post: { bloom: 0.2, feedback: 0.05 },
        },
      ],
      cues: [],
    };
    await this.session.loadSet(set);
    this.session.setSeed(this.seed);
    for (const layer of layers) {
      for (const [k, v] of Object.entries(this.params)) {
        this.session.runtime.getPiece(layer.id)?.setParameter(k, v);
      }
    }
    this.session.startLoop();
    if (this.mode === "generate") {
      this.playing = false;
      this.session.runtime.transport.stop();
    } else if (this.playing) {
      this.session.runtime.transport.start();
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
    } else {
      this.playing = true;
      this.session?.runtime.transport.start();
    }
    if (mode === "react") {
      try {
        const set = await loadSet(this.prefs.lastSetId || "pfl-default");
        // Keep current piece as primary layer unless set requested
        await this.applyPieceScene();
        void set;
      } catch {
        await this.applyPieceScene();
      }
    } else {
      await this.applyPieceScene();
    }
    this.renderConfig();
    this.renderHelp();
    this.syncUrl(true);
    toast(`${mode.toUpperCase()} mode`);
  }

  async setPiece(pieceId: string): Promise<void> {
    this.pieceId = pieceId;
    this.prefs.pieceId = pieceId;
    this.persist();
    await this.applyPieceScene();
    this.pushHistory();
    this.renderConfig();
    this.renderBrowser();
    this.syncUrl(true);
  }

  async randomizeSeed(): Promise<void> {
    this.seed = (Math.random() * 0xffffffff) >>> 0;
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
    const variants = moreLikeThis(
      { seed: this.seed, parameters: this.params },
      { count: 8, locked: this.locked },
    );
    const host = document.getElementById("variants");
    if (!host) return;
    host.innerHTML = "";
    for (const v of variants) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(v.seed);
      btn.title = v.label;
      btn.addEventListener("click", () => {
        this.seed = v.seed;
        this.params = { ...this.params, ...v.parameters };
        void this.applyPieceScene().then(() => {
          this.pushHistory();
          this.renderConfig();
          toast(`variant ${v.seed}`);
        });
      });
      host.appendChild(btn);
    }
    toast("variants ready — click a cell");
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
    toast("exporting animation…");
    try {
      const result = await exportAnimation(cfg, async (frame, _t) => {
        // Advance logical simulation deterministically via session.frame
        const wall = (frame / cfg.fps) * 1000;
        this.session?.frame(wall);
        return this.canvas;
      }, (p) => {
        if (p === 0 || p > 0.95) toast(`export ${Math.round(p * 100)}%`);
      });
      const ext = result.format === "webm" ? "webm" : "webp";
      downloadBlob(
        result.blob,
        `${this.pieceId.replace(/\//g, "_")}-s${this.seed}.${ext}`,
      );
      toast(`exported .${ext}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "animation export failed");
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
    if (strip) {
      strip.textContent = `${this.mode.toUpperCase()} · ${this.pieceId} · seed ${this.seed}`;
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
      div.innerHTML = `<div class="name">${p.title || p.name || p.piece_id}</div>
        <div class="meta">${p.family || p.piece_id.split("/")[0]} ·
        ${caps.still ? "still " : ""}${caps.animated ? "anim " : ""}${caps.realtime ? "rt " : ""}${caps.audio_reactive ? "audio" : ""}</div>
        <div class="meta">${p.description || ""}</div>`;
      div.addEventListener("click", () => void this.setPiece(p.piece_id));
      host.appendChild(div);
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
        <label>Export resolution</label>
        <select id="cfg-res">${resOptions}</select>
        <div class="row">
          <button type="button" class="primary" id="cfg-export">Export PNG</button>
          <button type="button" id="cfg-svg">Export SVG</button>
        </div>
        <button type="button" id="cfg-variants">More Like This</button>
        <div id="variants"></div>
      ` : ""}
      ${this.mode === "animate" ? `
        <label>FPS / duration (s)</label>
        <div class="row">
          <input id="cfg-fps" type="number" value="${this.anim.fps}" />
          <input id="cfg-dur" type="number" value="${this.anim.durationSec}" step="0.5" />
        </div>
        <div class="row">
          <button type="button" id="cfg-play">${this.playing ? "Pause" : "Play"}</button>
          <button type="button" class="primary" id="cfg-anim-export">Export WebM/WebP</button>
        </div>
      ` : ""}
      ${this.mode === "react" ? `
        <h2>Audio</h2>
        <button type="button" class="primary" id="cfg-mic">${this.audioEnabled ? "Mic active" : "Enable microphone"}</button>
        <div class="level"><span id="cfg-level"></span></div>
        <p class="muted">Browser owns getUserMedia — Docker only serves the app.</p>
      ` : ""}
      <h2>Parameters</h2>
      <label>Density</label>
      <input id="cfg-density" type="range" min="0" max="1" step="0.01" value="${this.params.density}" />
      <label>Chaos</label>
      <input id="cfg-chaos" type="range" min="0" max="1" step="0.01" value="${this.params.chaos}" />
      <label>Hue</label>
      <input id="cfg-hue" type="range" min="0" max="1" step="0.01" value="${this.params.hue}" />
      <details class="advanced">
        <summary>Advanced / meta / seeds</summary>
        <label>Zoom</label>
        <input id="cfg-zoom" type="range" min="0.2" max="2" step="0.01" value="${this.params.zoom}" />
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
    });
    el.querySelector("#cfg-rand")?.addEventListener("click", () => void this.randomizeSeed());
    el.querySelector("#cfg-export")?.addEventListener("click", () => void this.exportCurrent());
    el.querySelector("#cfg-svg")?.addEventListener("click", () => void this.exportSvg());
    el.querySelector("#cfg-variants")?.addEventListener("click", () => void this.exploreVariants());
    el.querySelector("#cfg-play")?.addEventListener("click", () => {
      this.togglePlay();
      this.renderConfig();
    });
    el.querySelector("#cfg-anim-export")?.addEventListener("click", () => void this.exportAnim());
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
    });
    el.querySelector("#cfg-fps")?.addEventListener("change", (e) => {
      this.anim.fps = Number((e.target as HTMLInputElement).value) || 30;
    });
    el.querySelector("#cfg-dur")?.addEventListener("change", (e) => {
      this.anim.durationSec = Number((e.target as HTMLInputElement).value) || 4;
    });
    const bindRange = (id: string, key: keyof typeof this.params) => {
      el.querySelector(id)?.addEventListener("input", (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.params[key] = v;
        this.session?.runtime.getPiece("L0")?.setParameter(key, v);
      });
    };
    bindRange("#cfg-density", "density");
    bindRange("#cfg-chaos", "chaos");
    bindRange("#cfg-hue", "hue");
    bindRange("#cfg-zoom", "zoom");
    el.querySelector("#cfg-meta-organic")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.meta.organic = v;
      this.params = applyMetaAxis(this.params, "organic", v);
      this.params.density = 0.95 - v * 0.55;
      this.session?.runtime.getPiece("L0")?.setParameter("chaos", this.params.chaos);
      this.session?.runtime.getPiece("L0")?.setParameter("density", this.params.density);
    });
    el.querySelector("#cfg-meta-kinetic")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.meta.kinetic = v;
      this.params = applyMetaAxis(this.params, "kinetic", v);
      this.session?.runtime.getPiece("L0")?.setParameter("zoom", this.params.zoom);
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
    const now = performance.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0]! > 1000) this.frameTimes.shift();
    this.fps = this.frameTimes.length;
    if (this.hudVisible && now - this.lastHud > 200) {
      this.lastHud = now;
      const hud = document.getElementById("hud");
      if (hud) {
        hud.textContent = [
          `FPS ${this.fps}`,
          `mode ${this.mode}`,
          `piece ${this.pieceId}`,
          `seed ${this.seed}`,
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
    void this.session?.dispose();
  }
}
