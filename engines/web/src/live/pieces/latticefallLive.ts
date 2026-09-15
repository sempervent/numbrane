/**
 * LATTICEFALL LIVE adapter — WASM particle sim + lattice glow display.
 *
 * Critical: particle texture must always be complete before sampling, or WebGL
 * draws black. RGBA32F is preferred; RGBA8 fallback for restricted GL contexts.
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import {
  loadLatticefallWasm,
  particleParamsFromWorld,
  type LatticefallSimApi,
} from "../../latticefall/wasm";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

const DISPLAY_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_hue;
uniform float u_energy;
uniform float u_time;
uniform sampler2D u_particles;
uniform int u_count;
uniform float u_brightness;

vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  float v=0.;
  // soft lattice rings — visible even with zero particles
  for(int i=0;i<6;i++){
    float a=float(i)*6.28318/6.;
    vec2 c=0.55*vec2(cos(a),sin(a));
    v=max(v,smoothstep(0.04,0.,abs(length(uv-c)-0.55)));
    v=max(v,smoothstep(0.035,0.,length(uv-c)-0.025));
  }
  v=max(v,smoothstep(0.04,0.,abs(length(uv)-0.55)));
  v=max(v,smoothstep(0.03,0.,length(uv)-0.02));
  // particle glow from texture rows (xy in [0,1] → [-1,1])
  int n=min(u_count,64);
  for(int i=0;i<64;i++){
    if(i>=n)break;
    float fi=(float(i)+0.5)/float(max(n,1));
    vec4 p=texture(u_particles,vec2(fi,0.5));
    vec2 q=p.xy*2.-1.;
    v+=exp(-36.*dot(uv-q,uv-q))*0.4;
  }
  float hue=fract(u_hue+v*0.15+u_time*0.01);
  float lum=0.08+v*0.62*u_brightness;
  vec3 col=hsl2rgb(vec3(hue,0.5+u_energy*0.2,lum));
  o=vec4(col,1.0);
}`;

function compile(gl: WebGL2RenderingContext, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error(`latticefall live VS: ${gl.getShaderInfoLog(vs)}`);
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`latticefall live FS: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`latticefall live link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function defaultNodes(): Float32Array {
  const n = 7;
  const out = new Float32Array(n * 2);
  out[0] = 0;
  out[1] = 0;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    out[(i + 1) * 2] = Math.cos(a) * 0.55;
    out[(i + 1) * 2 + 1] = Math.sin(a) * 0.55;
  }
  return out;
}

function supportsRgba32f(gl: WebGL2RenderingContext): boolean {
  // Sampling RGBA32F as texture (not FBO) — verify upload doesn't error.
  const t = gl.createTexture();
  if (!t) return false;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
  const ok = gl.getError() === gl.NO_ERROR;
  gl.deleteTexture(t);
  return ok;
}

export async function createLatticefallLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, DISPLAY_FRAG);
  let wasm;
  try {
    wasm = await loadLatticefallWasm();
  } catch (err) {
    gl.deleteProgram(prog);
    throw err;
  }
  let sim: LatticefallSimApi | null = null;
  let seed = 42;
  let count = 1200;
  const params: Record<string, number> = {
    chaos: 0.35,
    density: 0.7,
    zoom: 1,
    rotation: 0,
    hue: 0.58,
    exposure: 1,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
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
  const useFloat = supportsRgba32f(gl);
  const particleTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, particleTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Complete texture immediately so first draw is never black from incomplete sampling.
  if (useFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([0.5, 0.5, 0, 1]));
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));
  }

  const loc = (name: string) => gl.getUniformLocation(prog, name);

  const uploadParticles = (buf: Float32Array, fpp: number, n: number) => {
    const w = Math.max(n, 1);
    gl.bindTexture(gl.TEXTURE_2D, particleTex);
    if (useFloat) {
      const packed = new Float32Array(w * 4);
      for (let i = 0; i < n; i++) {
        // particle_buffer is in [-1,1]; convert once to [0,1] for texture
        packed[i * 4] = (buf[i * fpp]! + 1) * 0.5;
        packed[i * 4 + 1] = (buf[i * fpp + 1]! + 1) * 0.5;
        packed[i * 4 + 3] = 1;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, 1, 0, gl.RGBA, gl.FLOAT, packed);
    } else {
      const packed = new Uint8Array(w * 4);
      for (let i = 0; i < n; i++) {
        packed[i * 4] = Math.max(0, Math.min(255, Math.floor(((buf[i * fpp]! + 1) * 0.5) * 255)));
        packed[i * 4 + 1] = Math.max(
          0,
          Math.min(255, Math.floor(((buf[i * fpp + 1]! + 1) * 0.5) * 255)),
        );
        packed[i * 4 + 3] = 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
    }
  };

  const rebuild = () => {
    if (sim) sim.free();
    const worldParams = particleParamsFromWorld({
      field: { strength: 0.8 + params.chaos, scale: 0.7 },
      particles: {
        speed: 0.8 + audio.energy * 0.5,
        drag: 0.12,
        life: 4,
        lattice_attraction: 0.55 + audio.low * 0.4,
        escape_force: 0.2 + audio.high * 0.3,
      },
    });
    sim = new wasm.LatticefallSim(seed, count, defaultNodes(), worldParams);
    const buf = sim.particle_buffer();
    uploadParticles(buf, sim.floats_per_particle(), sim.particle_count());
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      count = Math.floor(600 + params.density * 1200);
      rebuild();
    },
    resize() {},
    update(frame) {
      last = frame;
      if (!sim) return;
      const atr = audio.onset > 0.4 ? 0.8 + audio.energy : 0.15;
      sim.step(frame.dt, frame.t, 0, 0, atr);
      uploadParticles(sim.particle_buffer(), sim.floats_per_particle(), sim.particle_count());
    },
    setParameter(name, value) {
      if (typeof value !== "number") return;
      if (name.startsWith("audio.")) {
        const k = name.slice(6) as keyof typeof audio;
        if (k in audio) audio[k] = value;
      } else {
        params[name] = value;
        if (name === "density" && sim) {
          count = Math.floor(600 + params.density * 1200);
          rebuild();
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
        motion: Math.min(1, (sim?.particle_count() ?? 0) / 2000),
        spectral: audio.high,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, particleTex);
      gl.uniform1i(loc("u_particles"), 0);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_energy"), audio.energy);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1i(loc("u_count"), sim?.particle_count() ?? 0);
      gl.uniform1f(loc("u_brightness"), Math.max(0.7, params.exposure));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      sim?.free();
      gl.deleteProgram(prog);
      gl.deleteTexture(particleTex);
    },
  };
}
