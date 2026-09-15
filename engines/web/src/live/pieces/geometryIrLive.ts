/**
 * Geometry IR LIVE — draws centers/edges from structured Seed Artifact geometry.
 */

import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

type Center = { x: number; y: number; r: number };
type Edge = { a: number; b: number };

function defaultMetatron(seed: number): { centers: Center[]; edges: Edge[] } {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s & 0xffff) / 0x10000;
  };
  const R = 0.28 + rnd() * 0.08;
  const centers: Center[] = [{ x: 0, y: 0, r: R }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    centers.push({ x: Math.cos(a) * R * 2, y: Math.sin(a) * R * 2, r: R });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    centers.push({
      x: Math.cos(a) * R * 2 * Math.sqrt(3),
      y: Math.sin(a) * R * 2 * Math.sqrt(3),
      r: R,
    });
  }
  const edges: Edge[] = [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const dx = centers[i]!.x - centers[j]!.x;
      const dy = centers[i]!.y - centers[j]!.y;
      if (Math.hypot(dx, dy) < R * 4.2) edges.push({ a: i, b: j });
    }
  }
  return { centers, edges };
}

function parseIr(json: Record<string, unknown>): { centers: Center[]; edges: Edge[] } | null {
  const centersRaw = (json.centers ?? json.nodes ?? []) as Array<Record<string, number>>;
  if (!Array.isArray(centersRaw) || centersRaw.length === 0) return null;
  const centers: Center[] = centersRaw.map((c) => ({
    x: Number(c.x ?? 0),
    y: Number(c.y ?? 0),
    r: Number(c.r ?? c.radius ?? 0.2),
  }));
  const edgesRaw = (json.edges ?? json.lines ?? []) as Array<Record<string, number> | number[]>;
  const edges: Edge[] = [];
  for (const e of edgesRaw) {
    if (Array.isArray(e)) edges.push({ a: Number(e[0]), b: Number(e[1]) });
    else edges.push({ a: Number(e.a ?? e.i0 ?? 0), b: Number(e.b ?? e.i1 ?? 0) });
  }
  return { centers, edges };
}

function compileBlit(gl: WebGL2RenderingContext): {
  prog: WebGLProgram;
  buf: WebGLBuffer;
  tex: WebGLTexture;
} {
  const vsSrc = `#version 300 es
in vec2 a; out vec2 v; void main(){ v=a*0.5+0.5; gl_Position=vec4(a,0.,1.);}`;
  const fsSrc = `#version 300 es
precision highp float; uniform sampler2D u; in vec2 v; out vec4 o;
void main(){ o = texture(u, vec2(v.x, 1.0 - v.y)); }`;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { prog, buf, tex };
}

export async function createGeometryIrPiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const blit = compileBlit(gl);
  const scratch = document.createElement("canvas");
  let centers: Center[] = [];
  let edges: Edge[] = [];
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
    chaos: 0.15,
    density: 0.7,
    zoom: 1,
    rotation: 0,
    hue: 0.55,
    exposure: 1.2,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };
  let irJson: Record<string, unknown> | null = null;

  const rebuild = () => {
    const parsed = irJson ? parseIr(irJson) : null;
    if (parsed) {
      centers = parsed.centers;
      edges = parsed.edges;
    } else {
      const d = defaultMetatron(seed);
      centers = d.centers;
      edges = d.edges;
    }
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.15 + 0.5;
      rebuild();
    },
    resize() {},
    update(frame) {
      last = frame;
      if (audio.onset > 0.55) params.rotation += 0.04;
      params.rotation += audio.low * 0.01;
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
        motion: Math.abs(Math.sin(last.t)),
        spectral: audio.mid,
      };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      scratch.width = ctx.width;
      scratch.height = ctx.height;
      const c2 = scratch.getContext("2d");
      if (!c2) return;
      c2.fillStyle = "#050508";
      c2.fillRect(0, 0, ctx.width, ctx.height);
      const cx = ctx.width * 0.5;
      const cy = ctx.height * 0.5;
      const scale = Math.min(ctx.width, ctx.height) * 0.35 * params.zoom * (1 + audio.energy * 0.15);
      const rot = params.rotation + last.t * 0.05 * params.chaos;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rgb = `hsl(${params.hue * 360} 70% ${45 + audio.energy * 20}%)`;
      c2.strokeStyle = rgb;
      c2.lineWidth = 1.25 + params.density;
      c2.globalAlpha = 0.9;
      const xf = (x: number, y: number) => {
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        return [cx + xr * scale, cy + yr * scale] as const;
      };
      for (const e of edges) {
        const a = centers[e.a];
        const b = centers[e.b];
        if (!a || !b) continue;
        const [x0, y0] = xf(a.x, a.y);
        const [x1, y1] = xf(b.x, b.y);
        c2.beginPath();
        c2.moveTo(x0, y0);
        c2.lineTo(x1, y1);
        c2.stroke();
      }
      for (const p of centers) {
        const [x, y] = xf(p.x, p.y);
        c2.beginPath();
        c2.arc(x, y, Math.max(2, p.r * scale), 0, Math.PI * 2);
        c2.stroke();
      }
      gl.bindTexture(gl.TEXTURE_2D, blit.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      gl.useProgram(blit.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, blit.buf);
      const loc = gl.getAttribLocation(blit.prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blit.tex);
      gl.uniform1i(gl.getUniformLocation(blit.prog, "u"), 0);
      if (ctx.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(blit.prog);
      gl.deleteBuffer(blit.buf);
      gl.deleteTexture(blit.tex);
    },
    exportState() {
      return {
        arrays: {},
        shapes: {},
        json: { kind: "geometry-ir", seed, centers, edges, pieceId },
      };
    },
    importState(s) {
      if (s.json?.geometry_ir && typeof s.json.geometry_ir === "object") {
        irJson = s.json.geometry_ir as Record<string, unknown>;
        rebuild();
      } else if (s.json?.centers) {
        irJson = s.json;
        rebuild();
      }
    },
  };
}
