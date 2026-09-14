/**
 * LATTICEFALL live entry — orchestration + HUD + Tone mapping.
 * Query: ?piece=latticefall is also routed from main when hash/path matches.
 */

import "../hud.css";
import { initAudio, setBpm, setTelemetry, scheduleNotes } from "./audioBridge";
import { LatticefallRenderer } from "./renderer";
import {
  LatticefallRuntime,
  loadWorld,
  type LatticefallWorld,
} from "./runtime";

export type LatticefallHarness = {
  runtime: LatticefallRuntime;
  renderer: LatticefallRenderer;
  status: () => {
    wasmReady: boolean;
    shadersReady: boolean;
    webgl2: boolean;
    error: string | null;
    frame: number;
    digest: string | null;
  };
  step: (n?: number) => string;
  injectEvents: (json: string) => void;
  resetAndReplay: (json: string) => Record<number, string>;
  exportEvents: () => string;
};

declare global {
  interface Window {
    __LATTICEFALL__?: LatticefallHarness;
  }
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const wrap = el("div", "control");
  wrap.appendChild(el("label", undefined, label));
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => onChange(parseFloat(input.value)));
  wrap.appendChild(input);
  return wrap;
}

function canvasToWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  const aspect = rect.width / Math.max(1, rect.height);
  return {
    x: (nx * 2 - 1) * aspect * 1.2,
    y: (1 - ny * 2) * 1.2,
  };
}

export async function bootstrapLatticefall(
  root: { hud: HTMLElement; canvasHost: HTMLElement },
  world?: LatticefallWorld,
): Promise<LatticefallHarness> {
  const qs = new URLSearchParams(window.location.search);
  const worldUrl = qs.get("world") ?? "/latticefall/world.default.json";
  const w = world ?? (await loadWorld(worldUrl));
  const canvas = document.createElement("canvas");
  canvas.id = "lf-canvas";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  root.canvasHost.innerHTML = "";
  root.canvasHost.appendChild(canvas);

  let renderer: LatticefallRenderer;
  try {
    renderer = new LatticefallRenderer(canvas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.hud.innerHTML = "";
    root.hud.appendChild(el("h1", undefined, "LATTICEFALL"));
    root.hud.appendChild(
      el("p", undefined, `WebGL2 is required but unavailable: ${msg}`),
    );
    throw e;
  }

  try {
    await renderer.init();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.hud.appendChild(el("p", undefined, `Shader compile failed: ${msg}`));
    throw e;
  }

  const runtime = new LatticefallRuntime(w);
  runtime.setShadersReady(true);
  try {
    await runtime.initWasm();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.hud.appendChild(el("p", undefined, msg));
    throw e;
  }

  const hud = root.hud;
  hud.innerHTML = "";
  hud.appendChild(el("h1", undefined, "LATTICEFALL"));
  const phaseLabel = el("div", "control", "phase: ORDER");
  hud.appendChild(phaseLabel);
  const telLabel = el("div", "control", "telemetry: —");
  hud.appendChild(telLabel);
  const perfLabel = el("div", "control", "perf: —");
  hud.appendChild(perfLabel);

  const recordParam = (path: string, value: number) => {
    runtime.applyEvent(
      {
        type: "parameter.change",
        frame: runtime.getFrame(),
        parameter: { path, value },
      },
      true,
    );
  };

  hud.appendChild(
    slider("chaos", 0, 1, 0.01, w.fractal.chaos, (v) => recordParam("chaos", v)),
  );
  hud.appendChild(
    slider("field", 0.1, 2.5, 0.01, w.field.strength, (v) =>
      recordParam("field.strength", v),
    ),
  );
  hud.appendChild(
    slider("lattice", 0, 2, 0.01, w.particles.lattice_attraction, (v) =>
      recordParam("lattice.gravity", v),
    ),
  );
  hud.appendChild(
    slider("fractal pressure", 0, 1, 0.01, 0, (v) =>
      recordParam("fractal.pressure", v),
    ),
  );
  hud.appendChild(
    slider("audio density", 0, 1, 0.01, w.audio.density, (v) =>
      recordParam("audio.density", v),
    ),
  );

  let audioOk = false;
  const skipAudio =
    new URLSearchParams(window.location.search).get("headless") === "1" ||
    new URLSearchParams(window.location.search).get("noaudio") === "1";
  if (!skipAudio) {
    try {
      // Tone.start may block without a user gesture; bound the wait.
      await Promise.race([
        initAudio().then(() => setBpm(w.audio.bpm)),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("audio init timeout")), 1500),
        ),
      ]);
      audioOk = true;
    } catch {
      audioOk = false;
    }
  }

  let pointerDown = false;
  const sendPointer = (
    type: "pointer.down" | "pointer.move" | "pointer.up",
    ev: PointerEvent,
  ) => {
    const { x, y } = canvasToWorld(canvas, ev.clientX, ev.clientY);
    runtime.applyEvent(
      {
        type,
        frame: runtime.getFrame(),
        pointer: { x, y, space: "cartesian-2d", button: ev.button },
      },
      true,
    );
  };
  canvas.addEventListener("pointerdown", (ev) => {
    pointerDown = true;
    canvas.setPointerCapture(ev.pointerId);
    sendPointer("pointer.down", ev);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!pointerDown) return;
    sendPointer("pointer.move", ev);
  });
  canvas.addEventListener("pointerup", (ev) => {
    pointerDown = false;
    sendPointer("pointer.up", ev);
  });

  let lastDigest: string | null = null;
  let lastStepMs = 0;
  let lastRenderMs = 0;

  const draw = (snap: ReturnType<LatticefallRuntime["stepFrame"]>) => {
    // LIVE_ONLY_WALL_CLOCK — HUD draw timing only; never feeds digests.
    const r0 = performance.now();
    const parts = runtime.getParticleBuffer();
    const ctrl = snap.controls;
    renderer.resize(
      canvas.clientWidth || 1280,
      canvas.clientHeight || 720,
      Math.min(2, window.devicePixelRatio || 1),
    );
    renderer.render({
      t: snap.t,
      phase: snap.phase,
      telemetry: snap.telemetry,
      nodes: w.geometry.nodes,
      particleBuffer: parts.buffer,
      particleCount: parts.count,
      floatsPer: parts.floatsPer,
      chaos: ctrl.chaos,
      zoom: w.fractal.zoom * (1 + snap.phase.fractalPressure * 0.4),
      power: w.fractal.power,
      exposure: w.color.exposure * (1 - snap.phase.decay * 0.25),
      saturation: w.color.saturation,
      attractor: snap.attractor.active
        ? {
            x: snap.attractor.x,
            y: snap.attractor.y,
            strength: snap.attractor.strength,
          }
        : null,
    });
    lastRenderMs = performance.now() - r0;
    lastStepMs = snap.perf.stepMs;
    lastDigest = snap.semanticDigest;
    phaseLabel.textContent = `phase: ${snap.phase.name} (${snap.phase.progress.toFixed(2)})`;
    telLabel.textContent = `E:${snap.telemetry.energy.toFixed(2)} T:${snap.telemetry.texture.toFixed(2)} M:${snap.telemetry.motion.toFixed(2)} S:${snap.telemetry.spectral.toFixed(2)}`;
    perfLabel.textContent = `f=${snap.frame} wasm=${lastStepMs.toFixed(2)}ms draw=${lastRenderMs.toFixed(2)}ms n=${parts.count}`;

    if (audioOk) {
      setTelemetry(snap.telemetry);
      if (snap.musicEvents.length) {
        scheduleNotes(snap.musicEvents, w.audio);
      }
    }
  };

  const params = new URLSearchParams(window.location.search);
  const replayUrl = params.get("replay");
  const headless = params.get("headless") === "1";
  const maxFrames = Number(params.get("frames") ?? "0");

  if (replayUrl) {
    const text = await fetch(replayUrl).then((r) => r.text());
    runtime.loadReplay(text);
  }

  let running = true;
  const tick = () => {
    if (!running) return;
    const snap = runtime.stepFrame();
    draw(snap);
    if (maxFrames > 0 && snap.frame + 1 >= maxFrames) {
      running = false;
      return;
    }
    if (!headless) requestAnimationFrame(tick);
  };

  if (headless) {
    // Expose harness; tests drive steps
  } else {
    requestAnimationFrame(tick);
  }

  const harness: LatticefallHarness = {
    runtime,
    renderer,
    status: () => ({
      ...runtime.getStatus(),
      shadersReady: renderer.compiled,
      frame: runtime.getFrame(),
      digest: lastDigest,
    }),
    step: (n = 1, opts?: { drawEvery?: boolean }) => {
      let dig = lastDigest ?? "";
      let snap: ReturnType<LatticefallRuntime["stepFrame"]> | null = null;
      for (let i = 0; i < n; i++) {
        snap = runtime.stepFrame();
        dig = snap.semanticDigest;
        if (opts?.drawEvery) draw(snap);
      }
      if (snap && !opts?.drawEvery) draw(snap);
      return dig;
    },
    injectEvents: (json: string) => {
      runtime.loadReplay(json);
    },
    resetAndReplay: (json: string) => {
      runtime.loadReplay(json);
      runtime.resetSimulation();
      runtime.loadReplay(json);
      const checkpoints = [0, 60, 120, 180];
      return runtime.runToCheckpoints(checkpoints);
    },
    exportEvents: () => runtime.exportEventsJSON(),
  };

  window.__LATTICEFALL__ = harness;
  return harness;
}

async function main() {
  const hud = document.getElementById("hud");
  const canvas = document.getElementById("canvas");
  if (!hud || !canvas) {
    console.error("missing #hud or #canvas");
    return;
  }
  await bootstrapLatticefall({ hud, canvasHost: canvas });
}

const isLatticefallPage =
  typeof window !== "undefined" &&
  (window.location.pathname.includes("latticefall") ||
    new URLSearchParams(window.location.search).get("piece") === "latticefall");

if (isLatticefallPage) {
  void main();
}
