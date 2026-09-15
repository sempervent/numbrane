/**
 * Progressive L-system turtle construction over time.
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform sampler2D u_ink;
uniform float u_hue;
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  float v=texture(u_ink,uv).r;
  vec3 col=hsl2rgb(vec3(fract(u_hue),0.35,0.05+v*0.7));
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
    throw new Error(`lsystem: ${gl.getShaderInfoLog(fs)}`);
  }
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

type Seg = { x0: number; y0: number; x1: number; y1: number };

function expand(seed: number, generations: number): string {
  let s = "F";
  const rules = seed % 2 === 0 ? { F: "F[+F]F[-F]F" } : { F: "FF+[+F-F-F]-[-F+F+F]" };
  for (let g = 0; g < generations; g++) {
    let n = "";
    for (const ch of s) n += (rules as Record<string, string>)[ch] ?? ch;
    s = n;
    if (s.length > 4000) break;
  }
  return s;
}

function turtle(axiom: string, angleDeg: number): Seg[] {
  const segs: Seg[] = [];
  let x = 0;
  let y = -0.8;
  let a = Math.PI / 2;
  const stack: { x: number; y: number; a: number }[] = [];
  const step = 0.045;
  const rad = (angleDeg * Math.PI) / 180;
  for (const ch of axiom) {
    if (ch === "F") {
      const x1 = x + Math.cos(a) * step;
      const y1 = y + Math.sin(a) * step;
      segs.push({ x0: x, y0: y, x1, y1 });
      x = x1;
      y = y1;
    } else if (ch === "+") a += rad;
    else if (ch === "-") a -= rad;
    else if (ch === "[") stack.push({ x, y, a });
    else if (ch === "]") {
      const s = stack.pop();
      if (s) {
        x = s.x;
        y = s.y;
        a = s.a;
      }
    }
  }
  return segs;
}

export async function createLSystemLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, FRAG);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const W = 512;
  const H = 512;
  const ink = new Uint8Array(W * H);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, ink);

  let segs: Seg[] = [];
  let cursor = 0;
  let seed = 42;
  const params: Record<string, number> = { density: 0.7, chaos: 0.2, hue: 0.35 };
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

  const plot = (x: number, y: number) => {
    const ix = Math.floor(((x + 1) * 0.5) * (W - 1));
    const iy = Math.floor(((y + 1) * 0.5) * (H - 1));
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    ink[iy * W + ix] = 255;
  };

  const stroke = (s: Seg) => {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      plot(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t);
    }
  };

  const rebuild = (s: number) => {
    seed = s >>> 0;
    ink.fill(0);
    cursor = 0;
    const gens = 3 + Math.floor(params.density * 2);
    const axiom = expand(seed, gens);
    segs = turtle(axiom, 22.5 + (seed % 10));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, ink);
  };

  return {
    id: pieceId,
    initialize(_r, s) {
      rebuild(s);
    },
    resize() {},
    update(frame) {
      last = frame;
      const rate = Math.max(1, Math.floor(2 + params.density * 8));
      for (let i = 0; i < rate && cursor < segs.length; i++) {
        stroke(segs[cursor++]!);
      }
      if (cursor > 0 && cursor % 8 === 0) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.UNSIGNED_BYTE, ink);
      }
      // Loop construction after full reveal
      if (cursor >= segs.length && frame.frame % 180 === 0) {
        rebuild(seed + 1);
      }
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
      return {
        energy: segs.length ? cursor / segs.length : 0,
        texture: params.density,
        motion: 0.4,
        spectral: params.chaos,
      };
    },
    render(ctx: RenderContext) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.UNSIGNED_BYTE, ink);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc("u_ink"), 0);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      void last;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
    },
  };
}
