/**
 * Physarum-style slime mold LIVE runtime (CPU agents + trail texture).
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { fetchNpyFloat32 } from "../npy";

type Agent = { x: number; y: number; a: number };

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`slime shader: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`slime link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export async function createSlimeMoldPiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const dispProg = compile(gl, FULLSCREEN_VERTEX_SHADER, await loadShader("slime_display.frag"));
  let simW = 256;
  let simH = 256;
  let trail = new Float32Array(simW * simH);
  let agents: Agent[] = [];
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
    chaos: 0.3,
    density: 0.7,
    zoom: 1,
    rotation: 0,
    hue: 0.42,
    exposure: 1,
    sensorAngle: 45,
    sensorDistance: 9,
    rotationAngle: 45,
    stepSize: 1,
    deposit: 1,
    decay: 0.1,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const loc = (name: string) => gl.getUniformLocation(dispProg, name);

  const sample = (x: number, y: number) => {
    const ix = Math.max(0, Math.min(simW - 1, x | 0));
    const iy = Math.max(0, Math.min(simH - 1, y | 0));
    return trail[iy * simW + ix]!;
  };

  const spawn = (n: number) => {
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return (s & 0xffff) / 0x10000;
    };
    agents = [];
    for (let i = 0; i < n; i++) {
      agents.push({
        x: rnd() * simW,
        y: rnd() * simH,
        a: rnd() * Math.PI * 2,
      });
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
      rgba[i * 4 + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, simW, simH, 0, gl.RGBA, gl.FLOAT, rgba);
  };

  return {
    id: pieceId,
    async initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.25 + 0.35;
      if (seedUrl) {
        try {
          const base = seedUrl.endsWith("/") ? seedUrl : `${seedUrl}/`;
          const ag = await fetchNpyFloat32(`${base}state/agents.npy`);
          const tr = await fetchNpyFloat32(`${base}state/trail.npy`);
          simH = tr.shape[0] ?? simH;
          simW = tr.shape[1] ?? simW;
          trail = new Float32Array(tr.data);
          agents = [];
          const n = ag.shape[0] ?? 0;
          for (let i = 0; i < n; i++) {
            agents.push({
              x: ag.data[i * 3]!,
              y: ag.data[i * 3 + 1]!,
              a: ag.data[i * 3 + 2]!,
            });
          }
          uploadTrail();
          return;
        } catch {
          /* fall through */
        }
      }
      const n = Math.floor(200 + params.density * 600);
      spawn(n);
      uploadTrail();
    },
    resize() {},
    update(frame) {
      last = frame;
      const sa = ((params.sensorAngle + audio.mid * 20) * Math.PI) / 180;
      const ra = ((params.rotationAngle + audio.low * 15) * Math.PI) / 180;
      const sd = params.sensorDistance * (1 + audio.energy * 0.5);
      const step = params.stepSize * (1 + audio.high * 0.4);
      const deposit = params.deposit * (1 + audio.onset * 2);
      const decay = Math.min(0.5, params.decay + audio.high * 0.05);
      for (const ag of agents) {
        const left = sample(ag.x + Math.cos(ag.a - sa) * sd, ag.y + Math.sin(ag.a - sa) * sd);
        const center = sample(ag.x + Math.cos(ag.a) * sd, ag.y + Math.sin(ag.a) * sd);
        const right = sample(ag.x + Math.cos(ag.a + sa) * sd, ag.y + Math.sin(ag.a + sa) * sd);
        if (left > center && left > right) ag.a -= ra;
        else if (right > center && right > left) ag.a += ra;
        ag.x = (ag.x + Math.cos(ag.a) * step + simW) % simW;
        ag.y = (ag.y + Math.sin(ag.a) * step + simH) % simH;
        const ix = ag.x | 0;
        const iy = ag.y | 0;
        trail[iy * simW + ix]! += deposit;
      }
      for (let i = 0; i < trail.length; i++) trail[i]! *= 1 - decay;
      // cheap diffusion
      const next = new Float32Array(trail.length);
      for (let y = 0; y < simH; y++) {
        for (let x = 0; x < simW; x++) {
          const i = y * simW + x;
          const u = trail[((y - 1 + simH) % simH) * simW + x]!;
          const d = trail[((y + 1) % simH) * simW + x]!;
          const l = trail[y * simW + ((x - 1 + simW) % simW)]!;
          const r = trail[y * simW + ((x + 1) % simW)]!;
          next[i] = 0.25 * (u + d + l + r);
        }
      }
      trail = next;
      uploadTrail();
    },
    setParameter(name, value) {
      if (name === "seedArtifact" && typeof value === "string") {
        seedUrl = value.endsWith("/") ? value : value.replace(/manifest\.json$/, "");
        if (!seedUrl.endsWith("/")) seedUrl += "/";
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
        motion: Math.min(1, agents.length / 800),
        spectral: audio.high,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.03, 1);
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
      void last;
    },
    dispose() {
      gl.deleteProgram(dispProg);
      gl.deleteTexture(tex);
    },
    exportState() {
      const agentsArr = new Float32Array(agents.length * 3);
      for (let i = 0; i < agents.length; i++) {
        agentsArr[i * 3] = agents[i]!.x;
        agentsArr[i * 3 + 1] = agents[i]!.y;
        agentsArr[i * 3 + 2] = agents[i]!.a;
      }
      return {
        arrays: { agents: agentsArr, trail: trail.slice() },
        shapes: {
          agents: [agents.length, 3],
          trail: [simH, simW],
        },
        json: { seed, kind: "slime" },
      };
    },
    importState(s: {
      arrays: Record<string, Float32Array>;
      shapes: Record<string, number[]>;
      json?: Record<string, unknown>;
    }) {
      const tr = s.arrays.trail;
      const ag = s.arrays.agents;
      if (tr && s.shapes.trail) {
        simH = s.shapes.trail[0] ?? simH;
        simW = s.shapes.trail[1] ?? simW;
        trail = new Float32Array(tr);
      }
      if (ag) {
        const n = s.shapes.agents?.[0] ?? Math.floor(ag.length / 3);
        agents = [];
        for (let i = 0; i < n; i++) {
          agents.push({ x: ag[i * 3]!, y: ag[i * 3 + 1]!, a: ag[i * 3 + 2]! });
        }
      }
      uploadTrail();
    },
  };
}
