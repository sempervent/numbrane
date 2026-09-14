/**
 * LATTICEFALL runtime conductor.
 *
 * DOM → NAP events → reducer → simulation → telemetry → musical events → (Tone)
 * Logical time only for deterministic state.
 */

import type { NapEvent } from "../events";
import { EventRecorder, EventReplayer } from "../events";
import { semanticDigest } from "./digest";
import {
  createMusicState,
  generateMusicalEvents,
  type MusicalEvent,
  type MusicState,
} from "./music";
import { phaseAt, progressFromFrame, type PhaseSnapshot } from "./phases";
import {
  computeTelemetry,
  emptyPrev,
  type LatticefallTelemetry,
  type TelemetryPrev,
} from "./telemetry";
import {
  loadLatticefallWasm,
  particleParamsFromWorld,
  type LatticefallSimApi,
  type WasmModule,
} from "./wasm";

export type LatticefallWorld = {
  protocol_version: string;
  piece_id: string;
  seed: number;
  streams: Record<string, number>;
  geometry: {
    nodes: Array<{ id: string; x: number; y: number; ring?: number }>;
    edges: string[][];
    radius: number;
  };
  field: {
    scale: number;
    strength: number;
    warp: number;
    octaves: number;
    summary: { mean_mag: number; max_mag: number };
  };
  particles: {
    count: number;
    speed: number;
    drag: number;
    life: number;
    lattice_attraction: number;
    escape_force: number;
  };
  fractal: { mode: string; power: number; zoom: number; chaos: number };
  color: { palette: string; exposure: number; saturation: number };
  audio: {
    bpm: number;
    scale: string;
    density: number;
    reverb: number;
    delay: number;
  };
  interaction: { strength: number; radius: number };
  composition: { phases: string[]; phase_timing: number[] };
  fps: number;
  duration_frames: number;
};

export type RuntimeControls = {
  chaos: number;
  fieldStrength: number;
  latticeGravity: number;
  fractalPressureBias: number;
  audioDensity: number;
};

export type AttractorState = {
  x: number;
  y: number;
  strength: number;
  active: boolean;
};

export type FrameSnapshot = {
  frame: number;
  t: number;
  phase: PhaseSnapshot;
  telemetry: LatticefallTelemetry;
  musicEvents: MusicalEvent[];
  particleDigest: string;
  semanticDigest: string;
  controls: RuntimeControls;
  attractor: AttractorState;
  perf: { stepMs: number; telemetryMs: number };
};

export type LatticefallStatus = {
  wasmReady: boolean;
  shadersReady: boolean;
  webgl2: boolean;
  error: string | null;
};

function defaultControls(world: LatticefallWorld): RuntimeControls {
  return {
    chaos: world.fractal.chaos,
    fieldStrength: world.field.strength,
    latticeGravity: world.particles.lattice_attraction,
    fractalPressureBias: 0,
    audioDensity: world.audio.density,
  };
}

export class LatticefallRuntime {
  readonly world: LatticefallWorld;
  readonly recorder = new EventRecorder();
  private wasm: WasmModule | null = null;
  private sim: LatticefallSimApi | null = null;
  private frame = 0;
  private controls: RuntimeControls;
  private attractor: AttractorState = {
    x: 0,
    y: 0,
    strength: 0,
    active: false,
  };
  private musicState: MusicState = createMusicState();
  private prevTel: TelemetryPrev;
  private lastTelemetry: LatticefallTelemetry = {
    energy: 0,
    texture: 0,
    motion: 0,
    spectral: 0,
  };
  private lastMusic: MusicalEvent[] = [];
  private replayer: EventReplayer | null = null;
  private status: LatticefallStatus = {
    wasmReady: false,
    shadersReady: false,
    webgl2: true,
    error: null,
  };
  private crossingHint = 0;

  constructor(world: LatticefallWorld) {
    this.world = world;
    this.controls = defaultControls(world);
    this.prevTel = emptyPrev(world.particles.count);
  }

  getStatus(): LatticefallStatus {
    return { ...this.status };
  }

  private pushParamsToSim(): void {
    if (!this.sim) return;
    const params = particleParamsFromWorld({
      field: {
        strength: this.controls.fieldStrength,
        scale: this.world.field.scale,
      },
      particles: {
        ...this.world.particles,
        lattice_attraction: this.controls.latticeGravity,
      },
    });
    this.sim.set_params(params);
  }

  setShadersReady(ok: boolean, err?: string): void {
    this.status.shadersReady = ok;
    if (!ok && err) this.status.error = err;
  }

  async initWasm(): Promise<void> {
    try {
      this.wasm = await loadLatticefallWasm();
      const nodes = this.world.geometry.nodes;
      const nodeXy = new Float32Array(nodes.length * 2);
      nodes.forEach((n, i) => {
        nodeXy[i * 2] = n.x;
        nodeXy[i * 2 + 1] = n.y;
      });
      const params = particleParamsFromWorld(this.world);
      // apply live control overrides into params[0], params[1]
      params[0] = this.controls.fieldStrength * (0.5 + this.world.particles.speed);
      params[1] = this.controls.latticeGravity;
      this.sim = new this.wasm.LatticefallSim(
        this.world.seed >>> 0,
        this.world.particles.count,
        nodeXy,
        params,
      );
      this.status.wasmReady = true;
      this.status.error = null;
    } catch (e) {
      this.status.wasmReady = false;
      this.status.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  getFrame(): number {
    return this.frame;
  }

  getControls(): RuntimeControls {
    return { ...this.controls };
  }

  getAttractor(): AttractorState {
    return { ...this.attractor };
  }

  getParticleBuffer(): {
    buffer: Float32Array;
    count: number;
    floatsPer: number;
    digest: string;
  } {
    if (!this.sim) {
      return {
        buffer: new Float32Array(0),
        count: 0,
        floatsPer: 9,
        digest: "no-sim",
      };
    }
    return {
      buffer: this.sim.particle_buffer(),
      count: this.sim.particle_count(),
      floatsPer: this.sim.floats_per_particle(),
      digest: this.sim.digest(),
    };
  }

  /** Apply a NAP event to runtime state (reducer). */
  applyEvent(ev: NapEvent, record = false): void {
    if (record) this.recorder.record(ev);
    switch (ev.type) {
      case "pointer.down":
      case "pointer.move": {
        const x = ev.pointer.x;
        const y = ev.pointer.y;
        // Expect cartesian-2d world coords when space set; else normalize screen → approx world
        const space = ev.pointer.space ?? "normalized-screen";
        let wx = x;
        let wy = y;
        if (space === "normalized-screen") {
          wx = (x * 2 - 1) * 1.6;
          wy = (1 - y * 2) * 1.0;
        }
        this.attractor = {
          x: wx,
          y: wy,
          strength:
            this.world.interaction.strength *
            (ev.type === "pointer.down" ? 1.2 : 1.0),
          active: true,
        };
        break;
      }
      case "pointer.up":
        this.attractor = { ...this.attractor, active: false, strength: 0 };
        break;
      case "parameter.change": {
        const path = ev.parameter.path;
        const v = Number(ev.parameter.value);
        if (!Number.isFinite(v)) break;
        if (path === "chaos" || path === "fractal.chaos") this.controls.chaos = v;
        if (path === "field.strength" || path === "fieldStrength")
          this.controls.fieldStrength = v;
        if (path === "lattice.gravity" || path === "latticeGravity")
          this.controls.latticeGravity = v;
        if (path === "fractal.pressure" || path === "fractalPressure")
          this.controls.fractalPressureBias = v;
        if (path === "audio.density" || path === "audioDensity")
          this.controls.audioDensity = v;
        this.pushParamsToSim();
        break;
      }
      default:
        break;
    }
  }

  loadReplay(json: string): void {
    const { replayer } = EventReplayer.fromJSON(json);
    this.replayer = replayer;
  }

  resetSimulation(): void {
    if (!this.wasm) throw new Error("WASM not initialized");
    this.sim?.free();
    this.frame = 0;
    this.controls = defaultControls(this.world);
    this.attractor = { x: 0, y: 0, strength: 0, active: false };
    this.musicState = createMusicState();
    this.prevTel = emptyPrev(this.world.particles.count);
    this.recorder.clear();
    this.replayer?.reset();
    const nodes = this.world.geometry.nodes;
    const nodeXy = new Float32Array(nodes.length * 2);
    nodes.forEach((n, i) => {
      nodeXy[i * 2] = n.x;
      nodeXy[i * 2 + 1] = n.y;
    });
    const params = particleParamsFromWorld(this.world);
    this.sim = new this.wasm.LatticefallSim(
      this.world.seed >>> 0,
      this.world.particles.count,
      nodeXy,
      params,
    );
  }

  /** Advance one logical frame. */
  stepFrame(): FrameSnapshot {
    if (!this.sim) throw new Error("WASM simulation not ready");

    if (this.replayer) {
      for (const ev of this.replayer.eventsAt(this.frame)) {
        this.applyEvent(ev, false);
      }
    }

    const fps = this.world.fps || 60;
    const dt = 1 / fps;
    const t = this.frame / fps;
    const progress = progressFromFrame(this.frame, this.world.duration_frames);
    const phase = phaseAt(progress, this.world.composition.phase_timing);

    // Phase modulates attractor + effective strengths
    const attrStrength = this.attractor.active
      ? this.attractor.strength * (0.6 + phase.particleActivity * 0.8)
      : 0;

    // LIVE_ONLY_WALL_CLOCK — HUD / instrumentation only; never feeds digests.
    const t0 =
      typeof performance !== "undefined" ? performance.now() : 0;
    this.sim.step(
      dt,
      t,
      this.attractor.x,
      this.attractor.y,
      attrStrength,
    );
    const t1 =
      typeof performance !== "undefined" ? performance.now() : 0;

    const buf = this.sim.particle_buffer();
    const count = this.sim.particle_count();
    const floatsPer = this.sim.floats_per_particle();

    // Crossing hint: particles near any lattice node
    let crossings = 0;
    const nodes = this.world.geometry.nodes;
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 64))) {
      const o = i * floatsPer;
      const x = buf[o + 1] ?? 0;
      const y = buf[o + 2] ?? 0;
      for (const n of nodes) {
        if ((x - n.x) * (x - n.x) + (y - n.y) * (y - n.y) < 0.01) {
          crossings += 1;
          break;
        }
      }
    }
    this.crossingHint = crossings / 64;

    const fieldMag =
      this.world.field.summary.mean_mag * this.controls.fieldStrength;
    const tel = computeTelemetry(buf, count, this.prevTel, phase, fieldMag);
    this.prevTel = tel.next;
    // Blend fractal pressure bias into a copy for music/digest display
    const phaseEff: PhaseSnapshot = {
      ...phase,
      fractalPressure: Math.min(
        1,
        phase.fractalPressure + this.controls.fractalPressureBias,
      ),
    };
    this.lastTelemetry = tel.telemetry;

    const music = generateMusicalEvents({
      frame: this.frame,
      fps,
      masterSeed: this.world.seed,
      telemetry: tel.telemetry,
      phase: phaseEff,
      params: {
        bpm: this.world.audio.bpm,
        scale: this.world.audio.scale,
        density: this.controls.audioDensity,
      },
      nodeCount: nodes.length,
      crossingHint: this.crossingHint,
      state: this.musicState,
    });
    this.musicState = music.state;
    this.lastMusic = music.events;

    const particleDigest = this.sim.digest();
    const digest = semanticDigest({
      frame: this.frame,
      seed: this.world.seed,
      particleDigest,
      phase: phaseEff,
      telemetry: tel.telemetry,
      musicEvents: music.events,
      chaos: this.controls.chaos,
      fieldStrength: this.controls.fieldStrength,
      latticeGravity: this.controls.latticeGravity,
    });

    const snap: FrameSnapshot = {
      frame: this.frame,
      t,
      phase: phaseEff,
      telemetry: tel.telemetry,
      musicEvents: music.events,
      particleDigest,
      semanticDigest: digest,
      controls: { ...this.controls },
      attractor: { ...this.attractor },
      perf: {
        stepMs: t1 - t0,
        telemetryMs:
          typeof performance !== "undefined" ? performance.now() - t1 : 0,
      },
    };

    this.frame += 1;
    return snap;
  }

  /** Run N frames; return digests at requested checkpoints. */
  runToCheckpoints(checkpoints: number[]): Record<number, string> {
    const want = new Set(checkpoints);
    const out: Record<number, string> = {};
    const max = Math.max(...checkpoints);
    while (this.frame <= max) {
      const snap = this.stepFrame();
      // stepFrame increments frame; digest is for previous index
      const f = snap.frame;
      if (want.has(f)) out[f] = snap.semanticDigest;
    }
    return out;
  }

  exportEventsJSON(): string {
    return this.recorder.exportJSON(this.world.seed, this.world.fps);
  }

  lastTelemetrySnapshot(): LatticefallTelemetry {
    return { ...this.lastTelemetry };
  }

  lastMusicEvents(): MusicalEvent[] {
    return [...this.lastMusic];
  }
}

export async function loadWorld(url = "/latticefall/world.default.json"): Promise<LatticefallWorld> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load world: ${url}`);
  return (await res.json()) as LatticefallWorld;
}
