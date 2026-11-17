/**
 * Geometry-IR scratch canvas must not reset width/height every frame.
 * Setting canvas.width clears the surface and forces reallocation — a major stall source.
 */

import { describe, expect, it, vi } from "vitest";
import { createGeometryIrPiece } from "../src/live/pieces/geometryIrLive";

function mockGl(): WebGL2RenderingContext {
  const locs = new Map<string, WebGLUniformLocation>();
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    COLOR_BUFFER_BIT: 0x4000,
    TEXTURE0: 0x84c0,
    TRIANGLES: 0x0004,
    FRAMEBUFFER: 0x8d40,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    deleteShader: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    createTexture: () => ({}),
    bindTexture: () => {},
    texParameteri: () => {},
    getAttribLocation: () => 0,
    getUniformLocation: (prog: unknown, name: string) => {
      if (!locs.has(name)) locs.set(name, { name } as unknown as WebGLUniformLocation);
      return locs.get(name)!;
    },
    bindFramebuffer: () => {},
    viewport: () => {},
    texImage2D: () => {},
    useProgram: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    activeTexture: () => {},
    uniform1i: () => {},
    clearColor: () => {},
    clear: () => {},
    drawArrays: () => {},
    deleteProgram: () => {},
    deleteBuffer: () => {},
    deleteTexture: () => {},
  };
  return gl as unknown as WebGL2RenderingContext;
}

describe("geometry IR scratch reuse", () => {
  it("does not reassign canvas dimensions when size is unchanged", async () => {
    const widthSets: number[] = [];
    const heightSets: number[] = [];
    const RealCanvas = globalThis.HTMLCanvasElement;
    class FakeCanvas {
      private _w = 0;
      private _h = 0;
      get width() {
        return this._w;
      }
      set width(v: number) {
        widthSets.push(v);
        this._w = v;
      }
      get height() {
        return this._h;
      }
      set height(v: number) {
        heightSets.push(v);
        this._h = v;
      }
      getContext() {
        return {
          fillStyle: "",
          globalAlpha: 1,
          lineCap: "round",
          lineJoin: "round",
          lineWidth: 1,
          shadowColor: "",
          shadowBlur: 0,
          strokeStyle: "",
          fillRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          arc: () => {},
          fill: () => {},
        };
      }
    }
    vi.stubGlobal(
      "document",
      {
        createElement: (tag: string) => {
          if (tag === "canvas") return new FakeCanvas();
          throw new Error(`unexpected element ${tag}`);
        },
      } as unknown as Document,
    );

    try {
      const piece = await createGeometryIrPiece(mockGl(), "geometry/metatron");
      piece.initialize({ piece: "geometry/metatron" }, 42);
      const fb = {} as WebGLFramebuffer;
      for (let i = 0; i < 5; i++) {
        piece.render({ framebuffer: fb, width: 960, height: 540, transparent: false });
      }
      expect(widthSets).toEqual([960]);
      expect(heightSets).toEqual([540]);
      // 1280×720 is capped to max edge 960 → 960×540 (no new alloc if already that size).
      piece.render({ framebuffer: fb, width: 1280, height: 720, transparent: false });
      expect(widthSets).toEqual([960]);
      expect(heightSets).toEqual([540]);
      piece.render({ framebuffer: fb, width: 640, height: 360, transparent: false });
      expect(widthSets).toEqual([960, 640]);
      expect(heightSets).toEqual([540, 360]);
      piece.dispose();
    } finally {
      if (RealCanvas) vi.stubGlobal("HTMLCanvasElement", RealCanvas);
      vi.unstubAllGlobals();
    }
  });
});
