/**
 * PFL Episode 1 — multi-artwork visualizer (no Studio).
 */

import { PflAudioEngine } from "./audio";
import { fillDeviceSelect, mountControls } from "./controls";
import {
  createModulationState,
  demoFeaturesAt,
  mapAudioToVisual,
  visualParamsDigest,
} from "./features";
import {
  type ArtworkId,
  nextVariationSeed,
  parseArtworkFromUrl,
  syncUrlParams,
} from "./artworkTypes";
import { switchArtwork, artworkLabel, type GenerativeArtwork } from "./artworkManager";
import { normalizedP99 } from "./luma";

const canvasNode = document.getElementById("pfl-canvas");
const dockEl = document.getElementById("pfl-dock") as HTMLDivElement | null;
if (!(canvasNode instanceof HTMLCanvasElement) || !dockEl) throw new Error("PFL DOM missing");
const canvas: HTMLCanvasElement = canvasNode;
const dock: HTMLDivElement = dockEl;

const url = new URLSearchParams(location.search);
let seed = (Number(url.get("seed")) || 424242) >>> 0;
let artworkType = parseArtworkFromUrl(url.get("type"));

const audio = new PflAudioEngine();
let artwork: GenerativeArtwork = switchArtwork(null, canvas, artworkType, seed);
let modState = createModulationState();

let raf = 0;
let running = true;
let lastT = performance.now();
let hideTimer = 0;
let dockHidden = false;
let logicalFrame = 0;
let lastParamsDigest = "";

function refreshVariationLabel(): void {
  ui.setVariationLabel(seed, artwork.getVariationFacet(), artworkType);
}

function applyArtworkType(nextType: ArtworkId): boolean {
  if (nextType === artworkType) return true;
  try {
    artwork = switchArtwork(artwork, canvas, nextType, seed);
    artworkType = nextType;
    primeArtwork(100);
    syncUrlParams(artworkType, seed);
    refreshVariationLabel();
    return true;
  } catch (err) {
    console.error("artwork init failed", err);
    return false;
  }
}

function primeArtwork(frames: number): void {
  const silent = mapAudioToVisual(
    { energy: 0, low: 0, mid: 0, high: 0, onset: false },
    modState,
    1 / 60,
  );
  for (let i = 0; i < frames; i++) {
    artwork.step(1 / 60, silent.params, i / 60);
  }
}

const ui = mountControls(dock, {
  initialSeed: seed,
  initialArtwork: artworkType,
  onArtworkType: (t) => {
    if (!applyArtworkType(t)) {
      ui.setArtworkType(artworkType);
    }
  },
  onMode: async (mode) => {
    dockHidden = false;
    dock.classList.remove("hidden");
    await audio.setMode(mode);
    if (mode === "input") {
      const sel = dock.querySelector<HTMLSelectElement>("#pfl-device");
      if (sel) await fillDeviceSelect(sel);
      try {
        await audio.startInput(sel?.value);
      } catch (err) {
        console.warn("mic denied", err);
        await audio.setMode("demo");
      }
    }
    resetHideTimer();
  },
  onFile: async (file) => {
    await audio.loadFile(file);
    ui.setPlaying(audio.isFilePlaying());
  },
  onDevice: async (deviceId) => {
    try {
      await audio.startInput(deviceId);
    } catch (err) {
      console.warn("device failed", err);
    }
  },
  onPlayPause: () => {
    if (audio.isFilePlaying()) audio.pauseFile();
    else audio.playFile();
    ui.setPlaying(audio.isFilePlaying());
  },
  onSeed: () => {
    seed = nextVariationSeed(seed);
    artwork.applyVariation(seed);
    primeArtwork(artworkType === "flow-field" ? 96 : 60);
    syncUrlParams(artworkType, seed);
    refreshVariationLabel();
  },
  onSensitivity: (v) => audio.setSensitivity(v),
  onFullscreen: () => {
    void (document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen());
  },
  onHide: () => {
    dockHidden = true;
    dock.classList.add("hidden");
  },
});

function toggleDock(): void {
  dockHidden = !dockHidden;
  dock.classList.toggle("hidden", dockHidden);
  if (!dockHidden) resetHideTimer();
}

function resetHideTimer(): void {
  hideTimer = performance.now();
}

function frame(now: number): void {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  if (dt > 0.05) dt = 0.05;
  lastT = now;

  const features = audio.tick(dt);
  const mapped = mapAudioToVisual(features, modState, dt);
  modState = mapped.state;
  artwork.step(dt, mapped.params);
  lastParamsDigest = visualParamsDigest(mapped.params);
  ui.setMeter(features.energy);
  logicalFrame += 1;

  if (!dockHidden && now - hideTimer > 12_000) {
    dock.classList.add("hidden");
    dockHidden = true;
  }
}

window.addEventListener("resize", () => artwork.resize());
window.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") toggleDock();
  if (e.key === " " && e.target === document.body) {
    e.preventDefault();
    ui.setPlaying(!audio.isFilePlaying());
    if (audio.isFilePlaying()) audio.pauseFile();
    else audio.playFile();
  }
});
document.addEventListener("mousemove", () => {
  if (dockHidden) return;
  resetHideTimer();
  dock.classList.remove("hidden");
});

syncUrlParams(artworkType, seed);
refreshVariationLabel();
raf = requestAnimationFrame(frame);

(window as unknown as { __PFL__?: Record<string, unknown> }).__PFL__ = {
  getSeed: () => seed,
  getArtworkType: () => artworkType,
  getArchetype: () => artwork.getVariationFacet(),
  getVariationLabel: () => artworkLabel(artwork),
  getLogicalFrame: () => logicalFrame,
  getParamsDigest: () => lastParamsDigest,
  sampleLuma: () => artwork.sampleLumaReport().mean,
  sampleLumaReport: () => artwork.sampleLumaReport(),
  normalizedP99: () => normalizedP99(artwork.sampleLumaReport()),
  setArtworkType: (t: string) => applyArtworkType(parseArtworkFromUrl(t)),
  applyVariation: (s: number) => {
    seed = s >>> 0;
    artwork.applyVariation(seed);
    primeArtwork(80);
    syncUrlParams(artworkType, seed);
    refreshVariationLabel();
  },
  primeSilent: (frames = 120) => primeArtwork(frames),
  stepForTest: (dt: number, demoTimeSec: number) => {
    const f = demoFeaturesAt(demoTimeSec, 1);
    const m = mapAudioToVisual(f, modState, dt);
    modState = m.state;
    artwork.step(dt, m.params, demoTimeSec);
    return { features: f, params: m.params };
  },
  dispose: () => {
    running = false;
    cancelAnimationFrame(raf);
    artwork.dispose();
    audio.dispose();
  },
};
