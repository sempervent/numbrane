/** WebGL visual engine. */
import { FULLSCREEN_VERTEX_SHADER, GLUtils, loadShader } from "./gl";
import { useStore } from "./state";
import { clamp01, makeClock, type LogicalClock, type VisualMode } from "./types";

export type { VisualMode };

export type VisualTelemetry = {
  energy: number;
  texture: number;
  motion: number;
  spectral: number;
};

export type VisualSeed = {
  id: number;
  x: number;
  y: number;
  strength: number;
  age: number;
};

type RenderParams = {
  complexity: number;
  mutation: number;
  chaos: number;
  palette: number;
  exposure: number;
};

class VisualEngine {
  private canvas: HTMLCanvasElement;
  private gl: GLUtils;
  private currentMode: VisualMode = "plasma";
  private seeds: VisualSeed[] = [];
  private seedIdCounter = 0;
  private lastTelemetry: VisualTelemetry = {
    energy: 0,
    texture: 0,
    motion: 0,
    spectral: 0,
  };
  private telemetrySmoothing = 0.95;
  private frameCount = 0;
  private telemetryUpdateInterval = 8;
  private clock: LogicalClock = makeClock(0, 60);
  onTelemetryUpdate?: (telemetry: VisualTelemetry) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = new GLUtils(canvas);
    this.setupCanvas();
    void this.initializeShaders();
  }

  /** Feed logical time from the live/deterministic driver. */
  setClock(clock: LogicalClock) {
    this.clock = clock;
  }

  private setupCanvas() {
    const resizeCanvas = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";

      const gl = this.gl.getGL();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  private async initializeShaders() {
    try {
      const plasmaFrag = await loadShader("plasma.frag");
      await this.gl.createProgram(FULLSCREEN_VERTEX_SHADER, plasmaFrag, "plasma");

      const escapeFrag = await loadShader("escape.frag");
      await this.gl.createProgram(FULLSCREEN_VERTEX_SHADER, escapeFrag, "escape");

      const rdFrag = await loadShader("rd_view.frag");
      await this.gl.createProgram(FULLSCREEN_VERTEX_SHADER, rdFrag, "rd");
    } catch (error) {
      console.error("Failed to load shaders:", error);
    }
  }

  setMode(mode: VisualMode) {
    this.currentMode = mode;
  }

  addSeed(x: number, y: number, strength: number = 1.0) {
    this.seeds.push({
      id: ++this.seedIdCounter,
      x,
      y,
      strength,
      age: 0,
    });
  }

  removeNearestSeed(x: number, y: number) {
    if (this.seeds.length === 0) return;

    let nearestIndex = 0;
    let minDistance = Infinity;

    this.seeds.forEach((seed, index) => {
      const dx = seed.x - x;
      const dy = seed.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    this.seeds.splice(nearestIndex, 1);
  }

  updateParams(_params: RenderParams) {
    const dt = this.clock.dt;
    this.seeds.forEach((seed) => {
      seed.age += dt;
      seed.strength *= 0.999;
    });
    this.seeds = this.seeds.filter((seed) => seed.strength > 0.01);
  }

  render() {
    const gl = this.gl.getGL();
    const store = useStore.getState();

    gl.clear(gl.COLOR_BUFFER_BIT);

    const params: RenderParams = {
      complexity: store.complexity,
      mutation: store.mutation,
      chaos: store.chaos,
      palette: store.palette,
      exposure: store.exposure,
    };

    switch (this.currentMode) {
      case "plasma":
        this.renderPlasma(params);
        break;
      case "escape":
        this.renderEscape(params);
        break;
      case "rd":
        this.renderReactionDiffusion(params);
        break;
      case "flow":
        this.renderFlow(params);
        break;
    }

    this.frameCount++;
    if (this.frameCount % this.telemetryUpdateInterval === 0) {
      this.emitTelemetry();
    }
  }

  private logicalTime(): number {
    return this.clock.t;
  }

  private renderPlasma(params: RenderParams) {
    const program = this.gl.getProgram("plasma");
    if (!program) return;

    this.gl.renderFullscreen(program, {
      u_res: [this.canvas.width, this.canvas.height],
      u_time: this.logicalTime(),
      u_chaos: params.chaos,
      u_mutation: params.mutation,
      u_paletteHue: params.palette,
      u_exposure: params.exposure,
    });

    this.smoothTelemetry({
      energy: params.chaos * 0.8 + params.mutation * 0.2,
      texture: params.complexity / 128.0,
      motion: params.mutation * 0.6 + params.chaos * 0.4,
      spectral: (params.palette / 360.0) * 0.5 + 0.5,
    });
  }

  private renderEscape(params: RenderParams) {
    const program = this.gl.getProgram("escape");
    if (!program) return;

    let zoom = 1.0;
    let center = [0.0, 0.0];

    if (this.seeds.length > 0) {
      const primarySeed = this.seeds[0];
      center = [primarySeed.x * 2.0 - 1.0, primarySeed.y * 2.0 - 1.0];
      zoom = 1.0 + primarySeed.strength * 2.0;
    }

    const power = 2.0 + params.chaos * 1.5;

    this.gl.renderFullscreen(program, {
      u_res: [this.canvas.width, this.canvas.height],
      u_time: this.logicalTime(),
      u_chaos: params.chaos,
      u_mutation: params.mutation,
      u_paletteHue: params.palette,
      u_exposure: params.exposure,
      u_center: center,
      u_zoom: zoom,
      u_power: power,
    });

    const seedInfluence = this.seeds.length > 0 ? this.seeds[0].strength : 0;
    this.smoothTelemetry({
      energy: params.chaos * 0.6 + seedInfluence * 0.4,
      texture: (power - 2.0) / 1.5,
      motion: params.mutation * 0.4 + params.chaos * 0.3 + seedInfluence * 0.3,
      spectral: (params.palette / 360.0) * 0.3 + (power - 2.0) * 0.2 + 0.5,
    });
  }

  private renderReactionDiffusion(params: RenderParams) {
    const program = this.gl.getProgram("rd");
    if (!program) return;

    this.gl.renderFullscreen(program, {
      u_res: [this.canvas.width, this.canvas.height],
      u_time: this.logicalTime(),
      u_chaos: params.chaos,
      u_mutation: params.mutation,
      u_paletteHue: params.palette,
      u_exposure: params.exposure,
    });

    const reactionRate = params.mutation * 0.6 + params.chaos * 0.4;
    const diffusionRate = params.complexity / 128.0;
    this.smoothTelemetry({
      energy: reactionRate * 0.8 + diffusionRate * 0.2,
      texture: diffusionRate * 0.7 + reactionRate * 0.3,
      motion: reactionRate * 0.5 + params.chaos * 0.3 + params.mutation * 0.2,
      spectral: (params.palette / 360.0) * 0.5 + reactionRate * 0.3 + 0.2,
    });
  }

  private renderFlow(params: RenderParams) {
    const gl = this.gl.getGL();
    gl.clearColor(0.05, 0.06, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = this.gl.getProgram("plasma");
    if (!program) return;

    this.gl.renderFullscreen(program, {
      u_res: [this.canvas.width, this.canvas.height],
      u_time: this.logicalTime(),
      u_chaos: params.chaos * 0.7,
      u_mutation: params.mutation * 1.5,
      u_paletteHue: params.palette,
      u_exposure: params.exposure * 0.8,
    });

    const flowIntensity = params.mutation * 0.8 + params.chaos * 0.2;
    const seedCount = this.seeds.length;
    this.smoothTelemetry({
      energy: flowIntensity * 0.7 + (seedCount / 10.0) * 0.3,
      texture: (params.complexity / 128.0) * 0.6 + flowIntensity * 0.4,
      motion: flowIntensity * 0.8 + params.mutation * 0.2,
      spectral: (params.palette / 360.0) * 0.4 + flowIntensity * 0.3 + 0.3,
    });
  }

  private smoothTelemetry(raw: VisualTelemetry) {
    const alpha = 1.0 - this.telemetrySmoothing;
    this.lastTelemetry.energy = clamp01(
      this.lerp(this.lastTelemetry.energy, raw.energy, alpha),
    );
    this.lastTelemetry.texture = clamp01(
      this.lerp(this.lastTelemetry.texture, raw.texture, alpha),
    );
    this.lastTelemetry.motion = clamp01(
      this.lerp(this.lastTelemetry.motion, raw.motion, alpha),
    );
    this.lastTelemetry.spectral = clamp01(
      this.lerp(this.lastTelemetry.spectral, raw.spectral, alpha),
    );
  }

  private emitTelemetry() {
    this.onTelemetryUpdate?.(this.getTelemetry());
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  getTelemetry(): VisualTelemetry {
    return {
      energy: clamp01(this.lastTelemetry.energy),
      texture: clamp01(this.lastTelemetry.texture),
      motion: clamp01(this.lastTelemetry.motion),
      spectral: clamp01(this.lastTelemetry.spectral),
    };
  }

  destroy() {
    this.gl.destroy();
  }
}

let visualEngine: VisualEngine | null = null;

export function startVisual(rootEl: HTMLElement): VisualEngine {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  rootEl.appendChild(canvas);

  try {
    visualEngine = new VisualEngine(canvas);
  } catch (error) {
    console.error("Failed to create WebGL2 context:", error);
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--neon);font-family:inherit;text-align:center;padding:20px;";
    errorDiv.innerHTML =
      "<div><h2>WebGL2 Not Supported</h2><p>A modern browser with WebGL2 is required.</p></div>";
    rootEl.appendChild(errorDiv);
    throw error;
  }

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (e.button === 0) {
      visualEngine?.addSeed(x, y);
    } else if (e.button === 2) {
      visualEngine?.removeNearestSeed(x, y);
    }
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return visualEngine;
}

export function setMode(mode: VisualMode) {
  visualEngine?.setMode(mode);
}

export function updateParams(params: RenderParams) {
  visualEngine?.updateParams(params);
}

export function getTelemetry(): VisualTelemetry {
  return (
    visualEngine?.getTelemetry() ?? {
      energy: 0,
      texture: 0,
      motion: 0,
      spectral: 0,
    }
  );
}

export function setTelemetryCallback(callback: (telemetry: VisualTelemetry) => void) {
  if (visualEngine) {
    visualEngine.onTelemetryUpdate = callback;
  }
}

export function setVisualClock(clock: LogicalClock) {
  visualEngine?.setClock(clock);
}

export function renderVisualFrame() {
  visualEngine?.render();
}

export function getVisualEngine(): VisualEngine | null {
  return visualEngine;
}
