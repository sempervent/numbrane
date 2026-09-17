/**
 * Continuous GLSL escape-time / Mandelbrot-power fractal for Studio ANIMATE.
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

function compile(gl: WebGL2RenderingContext, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`escape-time: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`escape-time link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export async function createEscapeTimeLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const fsSrc = await loadShader("escape.frag");
  const prog = compile(gl, fsSrc);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  let seed = 42;
  const params: Record<string, number> = {
    zoom: 1,
    power: 2,
    chaos: 0.15,
    density: 0.7,
    hue: 0.55,
    exposure: 1,
    center_x: -0.5,
    center_y: 0,
  };
  let last: FrameState = {
    frame: 0,
    t: 0,
    dt: 1 / 60,
    fps: 60,
    beat: 0,
    bar: 0,
    beatPhase: 0,
    bpm: 120,
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.center_x = -0.5 + ((seed % 97) / 97 - 0.5) * 0.4;
      params.center_y = ((seed % 53) / 53 - 0.5) * 0.35;
      params.hue = ((seed % 360) / 360) * 360;
    },
    resize() {},
    update(frame) {
      last = frame;
      // Continuous mathematical evolution: slow zoom + orbit center
      params.zoom = Math.max(0.35, params.zoom * (1 + frame.dt * 0.04 * (0.5 + params.density)));
      if (params.zoom > 8) params.zoom = 0.8;
      params.center_x += Math.sin(frame.t * 0.11 + seed * 0.01) * frame.dt * 0.02;
      params.center_y += Math.cos(frame.t * 0.09) * frame.dt * 0.015;
    },
    setParameter(name, value) {
      if (typeof value !== "number") return;
      if (name === "zoom" || name === "power" || name === "chaos" || name === "density" || name === "exposure") {
        params[name] = value;
      }
      if (name === "hue") params.hue = value * 360;
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      return {
        energy: Math.min(1, params.zoom / 8),
        texture: params.density,
        motion: 0.5,
        spectral: params.chaos,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1f(loc("u_chaos"), params.chaos);
      gl.uniform1f(loc("u_mutation"), (seed % 1000) / 1000);
      gl.uniform1f(loc("u_exposure"), params.exposure);
      gl.uniform1f(loc("u_paletteHue"), params.hue);
      gl.uniform2f(loc("u_center"), params.center_x, params.center_y);
      gl.uniform1f(loc("u_zoom"), params.zoom);
      gl.uniform1f(loc("u_power"), params.power);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
