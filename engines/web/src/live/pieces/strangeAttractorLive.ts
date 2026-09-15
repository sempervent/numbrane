/**
 * Continuous strange-attractor trajectory accumulation (Clifford/Lorenz-ish).
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform sampler2D u_trail;
uniform float u_hue;
uniform float u_exposure;
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  float ink=texture(u_trail,uv).r;
  float hue=fract(u_hue+ink*0.2);
  vec3 col=hsl2rgb(vec3(hue,0.35,0.04+ink*0.7*u_exposure));
  o=vec4(col,1.0);
}`;

function compile(gl: WebGL2RenderingContext, src: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, src);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`attractor: ${gl.getShaderInfoLog(fs)}`);
  }
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

export async function createStrangeAttractorLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, FRAG);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const W = 512;
  const H = 512;
  const trail = new Uint8Array(W * H);
  const trailTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, trailTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, trail);

  let seed = 42;
  let x = 0.1;
  let y = 0.1;
  let z = 0.1;
  const params: Record<string, number> = {
    density: 0.7,
    chaos: 0.3,
    hue: 0.55,
    exposure: 1.2,
    ink: 1.4,
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

  const reset = (s: number) => {
    seed = s >>> 0;
    x = ((seed % 1000) / 1000) * 0.4 + 0.05;
    y = ((seed % 777) / 777) * 0.4 + 0.05;
    z = 0.1;
    trail.fill(0);
    gl.bindTexture(gl.TEXTURE_2D, trailTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, trail);
  };

  const stamp = (px: number, py: number, amt: number) => {
    const ix = Math.floor(((px + 2.5) / 5) * (W - 1));
    const iy = Math.floor(((py + 2.5) / 5) * (H - 1));
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const i = iy * W + ix;
    trail[i] = Math.min(255, (trail[i] ?? 0) + Math.floor(amt * 255));
  };

  return {
    id: pieceId,
    initialize(_r, s) {
      reset(s);
    },
    resize() {},
    update(frame) {
      last = frame;
      // Clifford-like map with mild 3D Lorenz blend — continuous integration
      const a = -1.4 + (seed % 50) * 0.01;
      const b = 1.6;
      const c = 1.0;
      const d = 0.7 + params.chaos * 0.4;
      const steps = Math.floor(80 + params.density * 220);
      const ink = 0.04 * params.ink;
      for (let i = 0; i < steps; i++) {
        const nx = Math.sin(a * y) + c * Math.cos(a * x);
        const ny = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        y = ny;
        z = z * 0.99 + (x * y) * 0.01;
        stamp(x, y, ink);
      }
      // fade trail slightly for motion persistence
      for (let i = 0; i < trail.length; i += 17) {
        trail[i] = Math.floor((trail[i] ?? 0) * 0.992);
      }
      gl.bindTexture(gl.TEXTURE_2D, trailTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.UNSIGNED_BYTE, trail);
    },
    setParameter(name, value) {
      if (typeof value === "number" && name in params) params[name] = value;
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      return { energy: 0.6, texture: params.density, motion: 0.8, spectral: params.chaos };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTex);
      gl.uniform1i(loc("u_trail"), 0);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_exposure"), params.exposure);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      void last;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteTexture(trailTex);
    },
  };
}
