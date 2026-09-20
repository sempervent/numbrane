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
  const userBase: Record<string, number> = {
    zoom: 1.15,
    power: 2,
    chaos: 0.15,
    density: 0.7,
    hue: 0.55,
    exposure: 1,
    center_x: -0.5,
    center_y: 0,
  };
  const params: Record<string, number> = { ...userBase };
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

  const applyLiveOrbit = (t: number) => {
    const phase = t + (seed % 1000) * 0.001;
    params.zoom = userBase.zoom * (0.82 + 0.28 * (0.5 + 0.5 * Math.sin(phase * 0.13)));
    params.center_x = userBase.center_x + 0.16 * Math.sin(phase * 0.11);
    params.center_y = userBase.center_y + 0.12 * Math.cos(phase * 0.097);
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      userBase.center_x = -0.5 + ((seed % 97) / 97 - 0.5) * 0.35;
      userBase.center_y = ((seed % 53) / 53 - 0.5) * 0.28;
      userBase.zoom = 0.95 + ((seed % 41) / 41) * 0.55;
      userBase.hue = ((seed % 360) / 360) * 360;
      Object.assign(params, userBase);
      applyLiveOrbit(0);
    },
    resize() {},
    update(frame) {
      last = frame;
      applyLiveOrbit(frame.t);
    },
    setParameter(name, value) {
      if (typeof value !== "number") return;
      if (name === "zoom" || name === "power" || name === "chaos" || name === "density" || name === "exposure") {
        userBase[name] = value;
        params[name] = value;
      }
      if (name === "center_x" || name === "center_y") {
        userBase[name] = value;
        params[name] = value;
      }
      if (name === "hue") {
        userBase.hue = value * 360;
        params.hue = userBase.hue;
      }
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...userBase };
    },
    getTelemetry(): LiveTelemetry {
      return {
        energy: Math.min(1, params.zoom / 2),
        texture: params.density,
        motion: 0.55,
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
