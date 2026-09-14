/** NUMBRANE web live driver. */
import "./hud.css";
import { initAudio, scheduleFromNodes, setTelemetry } from "./audio";
import { EventRecorder, modeChangeEvent } from "./events";
import { Rng } from "./rng";
import { useStore } from "./state";
import { makeClock, type VisualMode } from "./types";
import {
  renderVisualFrame,
  setMode,
  setTelemetryCallback,
  setVisualClock,
  startVisual,
  updateParams,
} from "./visual";

const recorder = new EventRecorder();
/** Audio reschedule every N logical frames (not wall clock). */
const AUDIO_SCHEDULE_EVERY = 12;

function createSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
) {
  const control = document.createElement("div");
  control.className = "control";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  control.appendChild(labelEl);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = min.toString();
  slider.max = max.toString();
  slider.step = step.toString();
  slider.value = value.toString();
  slider.addEventListener("input", () => onChange(parseFloat(slider.value)));

  control.appendChild(slider);
  return control;
}

function createSelect(
  label: string,
  options: string[],
  value: string,
  onChange: (v: string) => void,
) {
  const control = document.createElement("div");
  control.className = "control";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  control.appendChild(labelEl);

  const select = document.createElement("select");
  select.className = "select";
  options.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option;
    optionEl.textContent = option;
    if (option === value) optionEl.selected = true;
    select.appendChild(optionEl);
  });
  select.addEventListener("change", () => onChange(select.value));

  control.appendChild(select);
  return control;
}

async function bootstrap() {
  const hud = document.getElementById("hud");
  const canvas = document.getElementById("canvas");

  if (!hud || !canvas) {
    console.error("Could not find HUD or canvas elements");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");
  const seed = seedParam !== null ? Number(seedParam) >>> 0 : 42;
  useStore.getState().hydrateFromRecipe(seed);

  const title = document.createElement("h1");
  title.textContent = "NUMBRANE";
  hud.appendChild(title);

  const store = useStore.getState();

  hud.appendChild(
    createSelect("Mode", ["plasma", "escape", "rd", "flow"], store.mode, (mode) => {
      const s = useStore.getState();
      s.setParam("mode", mode as VisualMode);
      setMode(mode as VisualMode);
      recorder.record(modeChangeEvent(s.frame, mode));
    }),
  );

  hud.appendChild(
    createSlider("BPM", 60, 140, 1, store.bpm, (bpm) => {
      const s = useStore.getState();
      s.setParam("bpm", bpm);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "bpm", value: bpm },
      });
      recorder.record({
        type: "transport.change",
        frame: s.frame,
        transport: { bpm },
      });
    }),
  );

  hud.appendChild(
    createSlider("Complexity", 8, 128, 1, store.complexity, (complexity) => {
      const s = useStore.getState();
      s.setParam("complexity", complexity);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "complexity", value: complexity },
      });
    }),
  );

  hud.appendChild(
    createSlider("Mutation", 0, 1, 0.01, store.mutation, (mutation) => {
      const s = useStore.getState();
      s.setParam("mutation", mutation);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "mutation", value: mutation },
      });
    }),
  );

  hud.appendChild(
    createSlider("Chaos", 0, 1, 0.01, store.chaos, (chaos) => {
      const s = useStore.getState();
      s.setParam("chaos", chaos);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "chaos", value: chaos },
      });
    }),
  );

  hud.appendChild(
    createSlider("Palette", 0, 360, 1, store.palette, (palette) => {
      const s = useStore.getState();
      s.setParam("palette", palette);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "palette", value: palette },
      });
    }),
  );

  hud.appendChild(
    createSlider("Exposure", 0.5, 2.5, 0.1, store.exposure, (exposure) => {
      const s = useStore.getState();
      s.setParam("exposure", exposure);
      recorder.record({
        type: "parameter.change",
        frame: s.frame,
        parameter: { path: "exposure", value: exposure },
      });
    }),
  );

  hud.appendChild(
    createSelect(
      "Harmony",
      ["major", "minor", "ambient", "atonal"],
      store.harmony,
      (harmony) => {
        const s = useStore.getState();
        s.setParam("harmony", harmony as typeof s.harmony);
        recorder.record({
          type: "parameter.change",
          frame: s.frame,
          parameter: { path: "harmony", value: harmony },
        });
      },
    ),
  );

  const powerBtn = document.createElement("button");
  powerBtn.textContent = "POWER ON";
  powerBtn.style.cssText = `
    width: 100%;
    padding: 12px 18px;
    margin-top: 20px;
    font-family: inherit;
    font-size: 14px;
    letter-spacing: 0.16em;
    color: var(--bg);
    background: var(--neon);
    border: 1px solid #0b3f46;
    box-shadow: 0 0 18px rgba(139,246,255,0.8), inset 0 0 12px rgba(255,255,255,0.4);
    cursor: pointer;
  `;
  hud.appendChild(powerBtn);

  const visualEngine = startVisual(canvas);
  setTelemetryCallback(setTelemetry);

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const s = useStore.getState();
    recorder.record({
      type: e.button === 0 ? "pointer.down" : "pointer.up",
      frame: s.frame,
      pointer: { x, y, space: "normalized-screen", button: e.button },
    });
    if (e.button === 0) {
      s.addNode(x, y);
      recorder.record({
        type: "node.create",
        frame: s.frame,
        node: { x, y },
      });
    } else if (e.button === 2) {
      s.removeNearest(x, y);
      recorder.record({
        type: "node.delete",
        frame: s.frame,
        node: { x, y },
      });
    }
  });

  powerBtn.addEventListener("click", async () => {
    try {
      await initAudio();
      useStore.getState().setParam("playing", true);
      recorder.record({
        type: "transport.change",
        frame: useStore.getState().frame,
        transport: { playing: true },
      });
      powerBtn.textContent = "ONLINE";
      powerBtn.style.background = "var(--neon-alt)";
    } catch (error) {
      console.error("Failed to initialize audio:", error);
    }
  });

  // Deterministic initial seeds/nodes from recipe seed (Rng), not Math.random.
  const rng = new Rng(seed);
  const complexity = useStore.getState().complexity;
  const targetSeeds = Math.min(3, Math.floor(complexity / 8));
  for (let i = 0; i < targetSeeds; i++) {
    visualEngine.addSeed(rng.randomF64(), rng.randomF64(), 0.8);
  }
  const targetNodes = Math.min(5, Math.floor(complexity / 6));
  for (let i = 0; i < targetNodes; i++) {
    const x = rng.randomF64();
    const y = rng.randomF64();
    useStore.getState().addNode(x, y);
    recorder.record({
      type: "node.create",
      frame: 0,
      node: { x, y },
    });
  }

  const mainLoop = () => {
    const s = useStore.getState();
    const nextFrame = s.frame + 1;
    const clock = makeClock(nextFrame, s.fps);
    s.setFrame(nextFrame);
    s.tickMutations(clock.dt);

    setVisualClock(clock);
    updateParams({
      complexity: s.complexity,
      mutation: s.mutation,
      chaos: s.chaos,
      palette: s.palette,
      exposure: s.exposure,
    });
    renderVisualFrame();

    if (nextFrame % AUDIO_SCHEDULE_EVERY === 0) {
      scheduleFromNodes(s.nodes, { harmony: s.harmony, chaos: s.chaos });
    }

    requestAnimationFrame(mainLoop);
  };

  requestAnimationFrame(mainLoop);

  // Expose recorder for debugging / export
  (window as unknown as { __numbraneEvents?: EventRecorder }).__numbraneEvents =
    recorder;
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((error) => {
    console.error("Bootstrap failed:", error);
  });
});
