/**
 * Framebuffer pixel metrics — actual RGBA samples, not compressed PNG bytes.
 */

export type PixelFrame = {
  gridW: number;
  gridH: number;
  meanLuminance: number;
  luminanceVariance: number;
  occupiedFraction: number;
  alphaOccupancy: number;
  changedPixelFraction: number;
  rmsDifference: number;
  digest: string;
};

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

export function luminanceAt(pixels: Uint8Array, idx: number): number {
  const o = idx * 4;
  return pixels[o]! * LUMA_R + pixels[o + 1]! * LUMA_G + pixels[o + 2]! * LUMA_B;
}

/** Downsample full RGBA buffer (bottom-left WebGL origin) to grid. */
export function downsampleRgba(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  gridW: number,
  gridH: number,
): Uint8Array {
  const out = new Uint8Array(gridW * gridH * 4);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const sx = Math.min(srcW - 1, Math.floor((gx + 0.5) * (srcW / gridW)));
      const sy = Math.min(srcH - 1, Math.floor((gy + 0.5) * (srcH / gridH)));
      const si = (sy * srcW + sx) * 4;
      const di = (gy * gridW + gx) * 4;
      out[di] = src[si]!;
      out[di + 1] = src[si + 1]!;
      out[di + 2] = src[si + 2]!;
      out[di + 3] = src[si + 3]!;
    }
  }
  return out;
}

export function analyzeRgbaGrid(
  pixels: Uint8Array,
  gridW: number,
  gridH: number,
  prior?: { pixels: Uint8Array; stats: PixelFrame },
): PixelFrame {
  const n = gridW * gridH;
  let sum = 0;
  let sum2 = 0;
  let occupied = 0;
  let alphaOcc = 0;
  let digest = 2166136261;
  let changed = 0;
  let rmsAcc = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = pixels[o]!;
    const g = pixels[o + 1]!;
    const b = pixels[o + 2]!;
    const a = pixels[o + 3]!;
    const lum = r * LUMA_R + g * LUMA_G + b * LUMA_B;
    sum += lum;
    sum2 += lum * lum;
    if (lum > 12) occupied += 1;
    if (a > 8) alphaOcc += 1;
    digest ^= (r << 24) | (g << 16) | (b << 8) | a;
    digest = Math.imul(digest, 16777619);
    if (prior) {
      const dr = r - prior.pixels[o]!;
      const dg = g - prior.pixels[o + 1]!;
      const db = b - prior.pixels[o + 2]!;
      const da = a - prior.pixels[o + 3]!;
      const delta = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
      if (delta > 3) changed += 1;
      rmsAcc += delta * delta;
    }
  }

  const mean = sum / Math.max(1, n);
  const variance = sum2 / Math.max(1, n) - mean * mean;
  return {
    gridW,
    gridH,
    meanLuminance: mean,
    luminanceVariance: variance,
    occupiedFraction: occupied / Math.max(1, n),
    alphaOccupancy: alphaOcc / Math.max(1, n),
    changedPixelFraction: prior ? changed / Math.max(1, n) : 0,
    rmsDifference: prior ? Math.sqrt(rmsAcc / Math.max(1, n)) : 0,
    digest: (digest >>> 0).toString(16),
  };
}

/** Meaningful visual change between two decoded RGBA grids. */
export function isMeaningfulVisualChange(
  a: PixelFrame,
  b: PixelFrame,
  minChangedFraction = 0.003,
  minRms = 2.5,
): boolean {
  return (
    b.changedPixelFraction >= minChangedFraction ||
    b.rmsDifference >= minRms ||
    Math.abs(b.meanLuminance - a.meanLuminance) >= 1.5 ||
    (a.digest !== b.digest && b.rmsDifference >= 1)
  );
}

/** Guard: compressed PNG bytes must never pass as pixel buffers. */
export function assertNotCompressedImageBytes(buf: Uint8Array): void {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    throw new Error("refusing PNG compressed bytes as pixel buffer");
  }
}
