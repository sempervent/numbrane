/**
 * LATTICEFALL WebGL renderer — compiles latticefall.frag and feeds uniforms.
 */

import { FULLSCREEN_VERTEX_SHADER, GLUtils, loadShader } from "../gl";
import type { PhaseSnapshot } from "./phases";
import type { LatticefallTelemetry } from "./telemetry";

export type LatticefallWorldGeom = {
  nodes: Array<{ id: string; x: number; y: number }>;
};

export class LatticefallRenderer {
  readonly glUtils: GLUtils;
  private canvas: HTMLCanvasElement;
  private ready = false;
  private compileError: string | null = null;
  private programName = "latticefall";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    try {
      this.glUtils = new GLUtils(canvas);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`WebGL2 unavailable: ${msg}`);
    }
  }

  get compiled(): boolean {
    return this.ready;
  }

  get error(): string | null {
    return this.compileError;
  }

  async init(): Promise<void> {
    try {
      const frag = await loadShader("latticefall.frag");
      await this.glUtils.createProgram(FULLSCREEN_VERTEX_SHADER, frag, this.programName);
      this.ready = true;
      this.compileError = null;
    } catch (e) {
      this.compileError = e instanceof Error ? e.message : String(e);
      this.ready = false;
      throw e;
    }
  }

  resize(width: number, height: number, dpr = 1): void {
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const gl = this.glUtils.getGL();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(args: {
    t: number;
    phase: PhaseSnapshot;
    telemetry: LatticefallTelemetry;
    nodes: LatticefallWorldGeom["nodes"];
    particleBuffer: Float32Array;
    particleCount: number;
    floatsPer: number;
    chaos: number;
    zoom: number;
    power: number;
    exposure: number;
    saturation: number;
    attractor: { x: number; y: number; strength: number } | null;
  }): void {
    if (!this.ready) return;
    const program = this.glUtils.getProgram(this.programName);
    if (!program) return;

    const gl = this.glUtils.getGL();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.025, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const nodeCount = Math.min(32, args.nodes.length);
    const nodeXY: number[] = [];
    for (let i = 0; i < 32; i++) {
      if (i < nodeCount) {
        nodeXY.push(args.nodes[i]!.x, args.nodes[i]!.y);
      } else {
        nodeXY.push(0, 0);
      }
    }

    // Subsample particles for shader (max 64)
    const sampleCount = Math.min(64, args.particleCount);
    const step = Math.max(1, Math.floor(args.particleCount / sampleCount));
    const parts: number[] = [];
    let filled = 0;
    for (let i = 0; i < args.particleCount && filled < 64; i += step) {
      const o = i * args.floatsPer;
      parts.push(args.particleBuffer[o + 1] ?? 0, args.particleBuffer[o + 2] ?? 0);
      filled++;
    }
    while (filled < 64) {
      parts.push(0, 0);
      filled++;
    }

    const attr = args.attractor;
    const uniforms: Record<string, number | number[]> = {
      u_res: [this.canvas.width, this.canvas.height],
      u_time: args.t,
      u_geometryClarity: args.phase.geometryClarity,
      u_fieldVisibility: args.phase.fieldVisibility,
      u_fractalPressure: args.phase.fractalPressure,
      u_particleActivity: args.phase.particleActivity,
      u_decay: args.phase.decay,
      u_chaos: args.chaos,
      u_zoom: args.zoom,
      u_power: args.power,
      u_exposure: args.exposure,
      u_saturation: args.saturation,
      u_energy: args.telemetry.energy,
      u_texture: args.telemetry.texture,
      u_motion: args.telemetry.motion,
      u_spectral: args.telemetry.spectral,
      u_attractor: attr ? [attr.x, attr.y] : [-10, -10],
      u_attractorStrength: attr?.strength ?? 0,
    };

    gl.useProgram(program);
    for (const [name, value] of Object.entries(uniforms)) {
      this.glUtils.setUniform(program, name, value);
    }

    // Array uniforms need manual upload
    const locNodes = gl.getUniformLocation(program, "u_nodes");
    const locParts = gl.getUniformLocation(program, "u_particles");
    const locNc = gl.getUniformLocation(program, "u_nodeCount");
    const locPc = gl.getUniformLocation(program, "u_particleSampleCount");
    if (locNc) gl.uniform1i(locNc, nodeCount);
    if (locPc) gl.uniform1i(locPc, sampleCount);
    if (locNodes) gl.uniform2fv(locNodes, new Float32Array(nodeXY));
    if (locParts) gl.uniform2fv(locParts, new Float32Array(parts));

    this.glUtils.drawFullscreen(program);
  }

  destroy(): void {
    this.glUtils.destroy();
  }
}
