/**
 * Noodles LIVE — curl-noise particle advection with Seed Artifact positions.
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { fetchNpyFloat32 } from "../npy";

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`noodles shader: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`noodles link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function curlNoise(x: number, y: number, t: number): [number, number] {
  const e = 0.01;
  const n1 = hash2(x, y + e + t);
  const n2 = hash2(x, y - e + t);
  const n3 = hash2(x + e + t, y);
  const n4 = hash2(x - e + t, y);
  return [(n1 - n2) / (2 * e), (n4 - n3) / (2 * e)];
}

export async function createNoodlesLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const dispProg = compile(gl, FULLSCREEN_VERTEX_SHADER, await loadShader("slime_display.frag"));
  let simW = 256;
  let simH = 256;
  let positions = new Float32Array(0);
  let trail = new Float32Array(simW * simH);
  let seed = 42;
  let seedUrl: string | null = null;
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
  const params: Record<string, number> = {
    chaos: 0.35,
    density: 0.7,
    zoom: 1,
    rotation: 0,
    hue: 0.48,
    exposure: 1,
    flow: 1.2,
    curl: 1,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const loc = (name: string) => gl.getUniformLocation(dispProg, name);

  const spawn = (n: number) => {
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return (s & 0xffff) / 0x10000;
    };
    positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2] = rnd() * simW;
      positions[i * 2 + 1] = rnd() * simH;
    }
    trail.fill(0);
  };

  const uploadTrail = () => {
    const rgba = new Float32Array(simW * simH * 4);
    let max = 1e-6;
    for (let i = 0; i < trail.length; i++) max = Math.max(max, trail[i]!);
    for (let i = 0; i < trail.length; i++) {
      const v = trail[i]! / max;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v * 0.7;
      rgba[i * 4 + 2] = v * 0.4;
      rgba[i * 4 + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, simW, simH, 0, gl.RGBA, gl.FLOAT, rgba);
  };

  return {
    id: pieceId,
    async initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.2 + 0.4;
      if (seedUrl) {
        try {
          const pos = await fetchNpyFloat32(`${seedUrl}/state/positions.npy`);
          if (pos.data.length >= 2) {
            positions = new Float32Array(pos.data);
            trail.fill(0);
            uploadTrail();
            return;
          }
        } catch {
          /* fall through */
        }
      }
      spawn(Math.floor(200 + params.density * 600));
      uploadTrail();
    },
    resize() {},
    update(frame) {
      last = frame;
      const flow = params.flow * (0.6 + audio.low * 1.4);
      const curl = params.curl * (0.5 + audio.high);
      const n = Math.floor(positions.length / 2);
      const decay = 0.96;
      for (let i = 0; i < trail.length; i++) trail[i]! *= decay;
      for (let i = 0; i < n; i++) {
        let x = positions[i * 2]!;
        let y = positions[i * 2 + 1]!;
        const [cx, cy] = curlNoise(x * 0.02, y * 0.02, last.t * 0.1 * curl);
        x = (x + cx * flow * 40 * last.dt + simW) % simW;
        y = (y + cy * flow * 40 * last.dt + simH) % simH;
        positions[i * 2] = x;
        positions[i * 2 + 1] = y;
        const ix = Math.max(0, Math.min(simW - 1, x | 0));
        const iy = Math.max(0, Math.min(simH - 1, y | 0));
        trail[iy * simW + ix]! += 0.8 + audio.energy;
      }
      if (audio.onset > 0.5) {
        for (let k = 0; k < 8; k++) {
          const i = (Math.random() * n) | 0;
          positions[i * 2] = Math.random() * simW;
          positions[i * 2 + 1] = Math.random() * simH;
        }
      }
      uploadTrail();
    },
    setParameter(name, value) {
      if (name === "seedArtifact" && typeof value === "string") {
        seedUrl = value;
        return;
      }
      if (typeof value !== "number") return;
      if (name.startsWith("audio.")) {
        const k = name.slice(6) as keyof typeof audio;
        if (k in audio) audio[k] = value;
      } else {
        params[name] = value;
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
        motion: Math.min(1, positions.length / 800),
        spectral: audio.high,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.015, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(dispProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc("u_trail"), 0);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_energy"), audio.energy);
      gl.uniform1f(loc("u_density"), params.density);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(dispProg);
      gl.deleteTexture(tex);
    },
    exportState() {
      return {
        arrays: { positions: positions.slice(), trail: trail.slice() },
        shapes: {
          positions: [Math.floor(positions.length / 2), 2],
          trail: [simH, simW],
        },
        json: { seed, kind: "noodles" },
      };
    },
    importState(s: {
      arrays: Record<string, Float32Array>;
      shapes: Record<string, number[]>;
      json?: Record<string, unknown>;
    }) {
      if (s.arrays.positions) positions = new Float32Array(s.arrays.positions);
      if (s.arrays.trail && s.shapes.trail) {
        simH = s.shapes.trail[0] ?? simH;
        simW = s.shapes.trail[1] ?? simW;
        trail = new Float32Array(s.arrays.trail);
      }
      uploadTrail();
    },
  };
}
