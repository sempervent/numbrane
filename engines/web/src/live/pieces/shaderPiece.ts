/**
 * GLSL-backed LIVE visuals for catalog pieces without dedicated sim adapters.
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { pieceMode, pieceSubmode } from "./pieceModes";

export async function createShaderPiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const fragSrc = await loadShader("live_piece.frag");
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`live_piece compile: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`live_piece link: ${gl.getProgramInfoLog(prog)}`);
  }

  const params: Record<string, number> = {
    chaos: 0.3,
    density: 0.7,
    zoom: 1.0,
    rotation: 0,
    hue: 0.55,
    exposure: 1,
  };
  let seed = 42;
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
  const mode = pieceMode(pieceId);
  const submode = pieceSubmode(pieceId);
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };

  const loc = (name: string) => gl.getUniformLocation(prog, name);

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.2 + 0.45;
    },
    resize(_width, _height) {},
    update(frame) {
      last = frame;
    },
    setParameter(name, value) {
      if (typeof value === "number") {
        if (name.startsWith("audio.")) {
          const k = name.slice(6) as keyof typeof audio;
          if (k in audio) audio[k] = value;
        } else {
          params[name] = value;
        }
      }
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      return {
        energy: audio.energy,
        texture: params.density,
        motion: Math.abs(Math.sin(last.beatPhase * Math.PI * 2)) * 0.5,
        spectral: audio.high,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(null);
      gl.useProgram(prog);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1f(loc("u_beat"), last.beat);
      gl.uniform1f(loc("u_beatPhase"), last.beatPhase);
      gl.uniform1f(loc("u_chaos"), params.chaos ?? 0.3);
      gl.uniform1f(loc("u_density"), params.density ?? 0.7);
      gl.uniform1f(loc("u_zoom"), params.zoom ?? 1);
      gl.uniform1f(loc("u_rotation"), params.rotation ?? 0);
      gl.uniform1f(loc("u_hue"), params.hue ?? 0.5);
      gl.uniform1f(loc("u_energy"), audio.energy);
      gl.uniform1f(loc("u_low"), audio.low);
      gl.uniform1f(loc("u_mid"), audio.mid);
      gl.uniform1f(loc("u_high"), audio.high);
      gl.uniform1f(loc("u_onset"), audio.onset);
      gl.uniform1i(loc("u_mode"), mode);
      gl.uniform1i(loc("u_submode"), submode);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
