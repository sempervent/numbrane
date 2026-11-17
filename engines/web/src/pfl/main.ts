/**
 * PFL Episode 1 — standalone flow-field visualizer (no Studio).
 */

import { PflAudioEngine } from "./audio";
import { fillDeviceSelect, mountControls } from "./controls";
import {
  createModulationState,
  demoFeaturesAt,
  mapAudioToVisual,
  visualParamsDigest,
} from "./features";
import { FlowFieldRenderer } from "./renderer";
import { mulberry32 } from "./rng";

const canvas = document.getElementById("pfl-canvas") as HTMLCanvasElement | null;
const dockEl = document.getElementById("pfl-dock") as HTMLDivElement | null;
if (!canvas || !dockEl) throw new Error("PFL DOM missing");
const dock: HTMLDivElement = dockEl;

let seed = (Number(new URLSearchParams(location.search).get("seed")) || 424242) >>> 0;
const audio = new PflAudioEngine();
const renderer = new FlowFieldRenderer(canvas, { seed });
let modState = createModulationState();

let raf = 0;
let running = true;
let lastT = performance.now();
let hideTimer = 0;
let dockHidden = false;
let logicalFrame = 0;
let lastParamsDigest = "";

const ui = mountControls(dock, {
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
    const rng = mulberry32((seed ^ logicalFrame) >>> 0);
    seed = (Math.floor(rng() * 0xffff_ffff) ^ 0x51ed) >>> 0;
    renderer.setSeed(seed);
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
  renderer.step(dt, mapped.params);
  lastParamsDigest = visualParamsDigest(mapped.params);
  ui.setMeter(features.energy);
  logicalFrame += 1;

  if (!dockHidden && now - hideTimer > 12_000) {
    dock.classList.add("hidden");
    dockHidden = true;
  }
}

window.addEventListener("resize", () => renderer.resize());
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

raf = requestAnimationFrame(frame);

/** Test / diagnostics (not used in performance mode). */
(window as unknown as { __PFL__?: Record<string, unknown> }).__PFL__ = {
  getSeed: () => seed,
  getLogicalFrame: () => logicalFrame,
  getParamsDigest: () => lastParamsDigest,
  sampleLuma: () => renderer.sampleMeanLuma(),
  stepForTest: (dt: number, demoTimeSec: number) => {
    const f = demoFeaturesAt(demoTimeSec, 1);
    const m = mapAudioToVisual(f, modState, dt);
    renderer.step(dt, m.params, demoTimeSec);
    return { features: f, params: m.params };
  },
  dispose: () => {
    running = false;
    cancelAnimationFrame(raf);
    audio.dispose();
  },
};
