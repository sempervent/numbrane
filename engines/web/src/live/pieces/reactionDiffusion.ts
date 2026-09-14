/**
 * Authentic Gray-Scott reaction-diffusion LIVE runtime (GPU ping-pong).
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
    throw new Error(`rd shader: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`rd link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function makeTex(gl: WebGL2RenderingContext, w: number, h: number, data?: Float32Array): {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
} {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data ?? null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("RD framebuffer incomplete (need float color buffer)");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

function seedField(w: number, h: number, seed: number): Float32Array {
  const data = new Float32Array(w * h * 4);
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s & 0xffff) / 0x10000;
  };
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 1;
    data[i * 4 + 1] = 0;
    data[i * 4 + 3] = 1;
  }
  for (let n = 0; n < 10; n++) {
    const cx = Math.floor(rnd() * w);
    const cy = Math.floor(rnd() * h);
    const r = 5 + Math.floor(rnd() * 15);
    for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) {
          data[(y * w + x) * 4 + 1] = 1;
        }
      }
    }
  }
  return data;
}

export async function createReactionDiffusionPiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const ext = gl.getExtension("EXT_color_buffer_float");
  if (!ext) throw new Error("EXT_color_buffer_float required for Gray-Scott LIVE");

  const stepProg = compile(gl, FULLSCREEN_VERTEX_SHADER, await loadShader("rd_step.frag"));
  const dispProg = compile(gl, FULLSCREEN_VERTEX_SHADER, await loadShader("rd_display.frag"));

  let simW = 256;
  let simH = 256;
  let a = makeTex(gl, simW, simH);
  let b = makeTex(gl, simW, simH);
  let readA = true;
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
  const params: Record<string, number> = {
    chaos: 0.3,
    density: 0.7,
    zoom: 1,
    rotation: 0,
    hue: 0.55,
    exposure: 1,
    f: 0.055,
    k: 0.062,
    du: 0.16,
    dv: 0.08,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
  let stepsPerFrame = 4;
  let seedUrl: string | null = null;

  const loc = (prog: WebGLProgram, name: string) => gl.getUniformLocation(prog, name);

  const uploadState = (U: Float32Array, V: Float32Array, w: number, h: number) => {
    const packed = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      packed[i * 4] = U[i] ?? 1;
      packed[i * 4 + 1] = V[i] ?? 0;
      packed[i * 4 + 3] = 1;
    }
    gl.deleteTexture(a.tex);
    gl.deleteTexture(b.tex);
    gl.deleteFramebuffer(a.fbo);
    gl.deleteFramebuffer(b.fbo);
    simW = w;
    simH = h;
    a = makeTex(gl, w, h, packed);
    b = makeTex(gl, w, h);
    readA = true;
  };

  const initRandom = () => {
    const data = seedField(simW, simH, seed);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, simW, simH, 0, gl.RGBA, gl.FLOAT, data);
    readA = true;
  };

  return {
    id: pieceId,
    async initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.2 + 0.45;
      if (seedUrl) {
        try {
          const base = seedUrl.replace(/manifest\.json$/, "");
          const u = await fetchNpyFloat32(`${base}state/U.npy`);
          const v = await fetchNpyFloat32(`${base}state/V.npy`);
          const h = u.shape[0] ?? simH;
          const w = u.shape[1] ?? simW;
          uploadState(u.data, v.data, w, h);
          return;
        } catch {
          /* fall through */
        }
      }
      initRandom();
    },
    resize(_width, _height) {
      /* sim resolution independent of display */
    },
    update(frame) {
      last = frame;
      gl.useProgram(stepProg);
      gl.bindVertexArray(null);
      for (let i = 0; i < stepsPerFrame; i++) {
        const src = readA ? a : b;
        const dst = readA ? b : a;
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, simW, simH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(loc(stepProg, "u_state"), 0);
        gl.uniform2f(loc(stepProg, "u_texel"), 1 / simW, 1 / simH);
        gl.uniform1f(loc(stepProg, "u_f"), params.f + audio.low * 0.02);
        gl.uniform1f(loc(stepProg, "u_k"), params.k + audio.high * 0.015);
        gl.uniform1f(loc(stepProg, "u_du"), params.du);
        gl.uniform1f(loc(stepProg, "u_dv"), params.dv);
        gl.uniform1f(loc(stepProg, "u_dt"), 1.0);
        gl.uniform1f(loc(stepProg, "u_feedBoost"), audio.onset * 0.08);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        readA = !readA;
      }
    },
    setParameter(name, value) {
      if (typeof value !== "number" && typeof value !== "string") return;
      if (name === "seedArtifact" && typeof value === "string") {
        seedUrl = value.endsWith("/") ? value : value.replace(/manifest\.json$/, "");
        if (!seedUrl.endsWith("/")) seedUrl += "/";
        return;
      }
      if (typeof value !== "number") return;
      if (name.startsWith("audio.")) {
        const k = name.slice(6) as keyof typeof audio;
        if (k in audio) audio[k] = value;
      } else if (name === "stepsPerFrame") {
        stepsPerFrame = Math.max(1, Math.min(16, Math.floor(value)));
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
        motion: Math.min(1, stepsPerFrame / 8),
        spectral: audio.high,
      };
    },
    render(ctx: RenderContext) {
      const src = readA ? a : b;
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(dispProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(loc(dispProg, "u_state"), 0);
      gl.uniform2f(loc(dispProg, "u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc(dispProg, "u_hue"), params.hue);
      gl.uniform1f(loc(dispProg, "u_energy"), audio.energy);
      gl.uniform1f(loc(dispProg, "u_exposure"), params.exposure);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(stepProg);
      gl.deleteProgram(dispProg);
      gl.deleteTexture(a.tex);
      gl.deleteTexture(b.tex);
      gl.deleteFramebuffer(a.fbo);
      gl.deleteFramebuffer(b.fbo);
    },
  };
}
