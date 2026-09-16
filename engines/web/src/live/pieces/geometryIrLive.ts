/**
 * Geometry IR LIVE — draws piece-specific structured IR (no shared Metatron fallback).
 */

import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { buildGeometryIr, type GeomIR } from "../../studio/geometry/generators";

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
  let ir: GeomIR = buildGeometryIr(pieceId, 42, {});
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
    "geom.radius": 1,
    "geom.levels": 2,
  };
  const audio = { energy: 0, low: 0, mid: 0, high: 0, onset: 0 };

  const rebuild = () => {
    ir = buildGeometryIr(pieceId, seed, params);
  };

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = ((seed % 1000) / 1000) * 0.15 + 0.45;
      rebuild();
    },
    resize() {},
    update(frame) {
      last = frame;
      if (audio.onset > 0.55) params.rotation += 0.03;
      params.rotation += audio.low * 0.008;
    },
    setParameter(name, value) {
      if (typeof value === "number") {
        if (name.startsWith("audio.")) {
          const k = name.slice(6) as keyof typeof audio;
          if (k in audio) audio[k] = value;
        } else {
          params[name] = value;
          if (name.startsWith("geom.") || name === "count" || name === "chaos") rebuild();
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
      const scale = Math.min(ctx.width, ctx.height) * 0.35 * params.zoom * (1 + audio.energy * 0.12);
      const rot = params.rotation + last.t * 0.04 * params.chaos;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rgb = `hsl(${params.hue * 360} 70% ${48 + audio.energy * 18}%)`;
      c2.strokeStyle = rgb;
      c2.lineWidth = 1.2 + params.density * 0.8;
      c2.globalAlpha = 0.92;
      const xf = (x: number, y: number) => {
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        return [cx + xr * scale, cy + yr * scale] as const;
      };
      const primitiveCount = ir.primitives?.length ?? 0;
      const edgeCount = ir.edges.length;
      const centerCount = ir.centers.length;
      const totalSteps = Math.max(24, primitiveCount || edgeCount + centerCount);
      const buildFrames = Math.max(120, totalSteps * 2);
      const buildProgress = Math.min(1, last.frame / buildFrames);
      const reveal = 0.15 + buildProgress * 0.85;
      const maxPrimitives =
        primitiveCount > 0 ? Math.max(1, Math.floor(primitiveCount * buildProgress)) : 0;
      const maxEdges = edgeCount > 0 ? Math.max(1, Math.floor(edgeCount * buildProgress)) : 0;
      const maxCenters = centerCount > 0 ? Math.max(1, Math.floor(centerCount * buildProgress)) : 0;
      if (ir.primitives?.length) {
        for (let i = 0; i < maxPrimitives; i++) {
          const p = ir.primitives[i]!;
          const local = Math.min(1, buildProgress * totalSteps - i);
          if (p.kind === "line") {
            const [x0, y0] = xf(Number(p.x1), Number(p.y1));
            const [x1, y1] = xf(Number(p.x2), Number(p.y2));
            const mx = x0 + (x1 - x0) * local;
            const my = y0 + (y1 - y0) * local;
            c2.beginPath();
            c2.moveTo(x0, y0);
            c2.lineTo(mx, my);
            c2.stroke();
          } else if (p.kind === "circle") {
            const [x, y] = xf(Number(p.cx), Number(p.cy));
            const r = Math.max(2, Number(p.r) * scale * reveal * local);
            c2.beginPath();
            c2.arc(x, y, r, 0, Math.PI * 2);
            c2.stroke();
          }
        }
      } else {
        for (let i = 0; i < maxEdges; i++) {
          const e = ir.edges[i]!;
          const a = ir.centers[e.a];
          const b = ir.centers[e.b];
          if (!a || !b) continue;
          const local = Math.min(1, buildProgress * totalSteps - i);
          const [x0, y0] = xf(a.x, a.y);
          const [x1, y1] = xf(b.x, b.y);
          const mx = x0 + (x1 - x0) * local;
          const my = y0 + (y1 - y0) * local;
          c2.beginPath();
          c2.moveTo(x0, y0);
          c2.lineTo(mx, my);
          c2.stroke();
        }
        for (let i = 0; i < maxCenters; i++) {
          const p = ir.centers[i]!;
          const local = Math.min(1, buildProgress * totalSteps - (edgeCount + i));
          const [x, y] = xf(p.x, p.y);
          const r = Math.max(2, p.r * scale * reveal * Math.max(0.2, local));
          c2.beginPath();
          c2.arc(x, y, r, 0, Math.PI * 2);
          c2.stroke();
        }
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
      gl.clearColor(0.02, 0.02, 0.03, 1);
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
        json: { kind: "geometry-ir", ...ir },
      };
    },
    importState(s) {
      if (s.json?.centers || s.json?.primitives) {
        ir = {
          pieceId,
          seed,
          centers: (s.json.centers as GeomIR["centers"]) ?? [],
          edges: (s.json.edges as GeomIR["edges"]) ?? [],
          primitives: s.json.primitives as GeomIR["primitives"],
          meta: (s.json.meta as GeomIR["meta"]) ?? {},
        };
      } else {
        rebuild();
      }
    },
  };
}
