/**
 * Differential growth LIVE — persistent segments with Seed Artifact continuity.
 */

import { FULLSCREEN_VERTEX_SHADER, loadShader } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { fetchNpyFloat32 } from "../npy";

type Seg = { sx: number; sy: number; ex: number; ey: number; thick: number; age: number; alive: boolean };

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`dg shader: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`dg link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export async function createDifferentialGrowthPiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const dispProg = compile(gl, FULLSCREEN_VERTEX_SHADER, await loadShader("slime_display.frag"));
  let simW = 256;
  let simH = 256;
  let segs: Seg[] = [];
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
    chaos: 0.25,
    density: 0.65,
    zoom: 1,
    rotation: 0,
    hue: 0.38,
    exposure: 1,
    growth_rate: 1,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const loc = (name: string) => gl.getUniformLocation(dispProg, name);

  let rng = seed >>> 0 || 1;
  const rnd = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return (rng & 0xffff) / 0x10000;
  };

  const spawn = () => {
    rng = seed >>> 0 || 1;
    const cx = simW * 0.5;
    const cy = simH * 0.5;
    const r = 18;
    segs = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      segs.push({
        sx: cx + Math.cos(a0) * r,
        sy: cy + Math.sin(a0) * r,
        ex: cx + Math.cos(a1) * r,
        ey: cy + Math.sin(a1) * r,
        thick: 1.2,
        age: 0,
        alive: true,
      });
    }
    trail.fill(0);
  };

  const stampSeg = (s: Seg) => {
    const steps = Math.max(2, Math.hypot(s.ex - s.sx, s.ey - s.sy) | 0);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = s.sx + (s.ex - s.sx) * t;
      const y = s.sy + (s.ey - s.sy) * t;
      const ix = Math.max(0, Math.min(simW - 1, x | 0));
      const iy = Math.max(0, Math.min(simH - 1, y | 0));
      trail[iy * simW + ix]! += s.thick;
    }
  };

  const uploadTrail = () => {
    const rgba = new Float32Array(simW * simH * 4);
    let max = 1e-6;
    for (let i = 0; i < trail.length; i++) max = Math.max(max, trail[i]!);
    for (let i = 0; i < trail.length; i++) {
      const v = trail[i]! / max;
      rgba[i * 4] = v * 0.6;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v * 0.85;
      rgba[i * 4 + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, simW, simH, 0, gl.RGBA, gl.FLOAT, rgba);
  };

  return {
    id: pieceId,
    async initialize(_recipe, s) {
      seed = s >>> 0;
      if (seedUrl) {
        try {
          const arr = await fetchNpyFloat32(`${seedUrl}/state/segments.npy`);
          if (arr.data.length >= 7) {
            segs = [];
            const n = Math.floor(arr.data.length / 7);
            for (let i = 0; i < n; i++) {
              const o = i * 7;
              segs.push({
                sx: arr.data[o]!,
                sy: arr.data[o + 1]!,
                ex: arr.data[o + 2]!,
                ey: arr.data[o + 3]!,
                thick: arr.data[o + 4]!,
                age: arr.data[o + 5]!,
                alive: arr.data[o + 6]! > 0.5,
              });
            }
            trail.fill(0);
            for (const seg of segs) if (seg.alive) stampSeg(seg);
            uploadTrail();
            return;
          }
        } catch {
          /* fall through */
        }
      }
      spawn();
      for (const seg of segs) stampSeg(seg);
      uploadTrail();
    },
    resize() {},
    update(frame) {
      last = frame;
      const rate = params.growth_rate * (0.5 + params.chaos + audio.energy);
      for (let i = 0; i < trail.length; i++) trail[i]! *= 0.985;
      const next: Seg[] = [];
      for (const seg of segs) {
        if (!seg.alive) continue;
        const dx = seg.ex - seg.sx;
        const dy = seg.ey - seg.sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const push = (rnd() - 0.5 + audio.mid * 0.3) * rate * 2.5;
        seg.ex += nx * push;
        seg.ey += ny * push;
        seg.age += 1;
        stampSeg(seg);
        next.push(seg);
        if (seg.age > 8 && rnd() < 0.08 * rate && next.length < 400) {
          const mx = (seg.sx + seg.ex) * 0.5;
          const my = (seg.sy + seg.ey) * 0.5;
          next.push({
            sx: mx,
            sy: my,
            ex: mx + nx * 6,
            ey: my + ny * 6,
            thick: seg.thick * 0.85,
            age: 0,
            alive: true,
          });
        }
      }
      segs = next;
      if (audio.onset > 0.6) {
        for (let k = 0; k < 3; k++) {
          const a = rnd() * Math.PI * 2;
          const cx = simW * 0.5 + Math.cos(a) * 40;
          const cy = simH * 0.5 + Math.sin(a) * 40;
          segs.push({
            sx: cx,
            sy: cy,
            ex: cx + Math.cos(a) * 8,
            ey: cy + Math.sin(a) * 8,
            thick: 1,
            age: 0,
            alive: true,
          });
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
        motion: Math.min(1, segs.length / 200),
        spectral: audio.mid,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.025, 1);
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
      const arr = new Float32Array(segs.length * 7);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        const o = i * 7;
        arr[o] = s.sx;
        arr[o + 1] = s.sy;
        arr[o + 2] = s.ex;
        arr[o + 3] = s.ey;
        arr[o + 4] = s.thick;
        arr[o + 5] = s.age;
        arr[o + 6] = s.alive ? 1 : 0;
      }
      return {
        arrays: { segments: arr, trail: trail.slice() },
        shapes: { segments: [segs.length, 7], trail: [simH, simW] },
        json: { seed, kind: "differential-growth" },
      };
    },
    importState(s: {
      arrays: Record<string, Float32Array>;
      shapes: Record<string, number[]>;
      json?: Record<string, unknown>;
    }) {
      const raw = s.arrays.segments;
      if (raw) {
        const n = s.shapes.segments?.[0] ?? Math.floor(raw.length / 7);
        segs = [];
        for (let i = 0; i < n; i++) {
          const o = i * 7;
          segs.push({
            sx: raw[o]!,
            sy: raw[o + 1]!,
            ex: raw[o + 2]!,
            ey: raw[o + 3]!,
            thick: raw[o + 4]!,
            age: raw[o + 5]!,
            alive: raw[o + 6]! > 0.5,
          });
        }
      }
      if (s.arrays.trail && s.shapes.trail) {
        simH = s.shapes.trail[0] ?? simH;
        simW = s.shapes.trail[1] ?? simW;
        trail = new Float32Array(s.arrays.trail);
      } else {
        trail.fill(0);
        for (const seg of segs) if (seg.alive) stampSeg(seg);
      }
      uploadTrail();
    },
  };
}
