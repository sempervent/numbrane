import { describe, expect, it } from "vitest";
import {
  analyzeRgbaGrid,
  assertNotCompressedImageBytes,
  isMeaningfulVisualChange,
} from "../src/live/pixelMetrics";

function solid(w: number, h: number, rgba: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgba[0];
    out[i * 4 + 1] = rgba[1];
    out[i * 4 + 2] = rgba[2];
    out[i * 4 + 3] = rgba[3];
  }
  return out;
}

describe("pixelMetrics", () => {
  it("same image -> near-zero difference", () => {
    const px = solid(8, 8, [10, 10, 10, 255]);
    const a = analyzeRgbaGrid(px, 8, 8);
    const b = analyzeRgbaGrid(px, 8, 8, { pixels: px, stats: a });
    expect(b.changedPixelFraction).toBe(0);
    expect(b.rmsDifference).toBe(0);
    expect(isMeaningfulVisualChange(a, b)).toBe(false);
  });

  it("black vs white -> very high difference", () => {
    const black = solid(16, 16, [0, 0, 0, 255]);
    const white = solid(16, 16, [255, 255, 255, 255]);
    const a = analyzeRgbaGrid(black, 16, 16);
    const b = analyzeRgbaGrid(white, 16, 16, { pixels: black, stats: a });
    expect(b.changedPixelFraction).toBeGreaterThan(0.9);
    expect(isMeaningfulVisualChange(a, b)).toBe(true);
  });

  it("red vs blue -> meaningful difference", () => {
    const red = solid(16, 16, [220, 10, 10, 255]);
    const blue = solid(16, 16, [10, 10, 220, 255]);
    const a = analyzeRgbaGrid(red, 16, 16);
    const b = analyzeRgbaGrid(blue, 16, 16, { pixels: red, stats: a });
    expect(isMeaningfulVisualChange(a, b)).toBe(true);
  });

  it("checkerboard vs flat differs materially", () => {
    const flat = solid(16, 16, [40, 40, 40, 255]);
    const check = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = (x + y) % 2 === 0 ? 220 : 20;
        const i = (y * 16 + x) * 4;
        check[i] = v;
        check[i + 1] = v;
        check[i + 2] = v;
        check[i + 3] = 255;
      }
    }
    const a = analyzeRgbaGrid(flat, 16, 16);
    const b = analyzeRgbaGrid(check, 16, 16, { pixels: flat, stats: a });
    expect(isMeaningfulVisualChange(a, b)).toBe(true);
  });

  it("rejects compressed PNG bytes masquerading as pixels", () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(() => assertNotCompressedImageBytes(pngHeader)).toThrow(/PNG compressed bytes/);
  });
});
