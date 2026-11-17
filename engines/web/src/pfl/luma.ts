/**
 * Artwork luminance metrics (excludes dock — sample canvas only).
 */

export type LumaReport = {
  mean: number;
  p50: number;
  p99: number;
  brightFrac: number;
  digest: string;
};

/** sRGB luma 0..255 from RGBA buffer. */
export function analyzeLuma(
  data: Uint8ClampedArray,
  step = 4,
): LumaReport {
  const lumas: number[] = [];
  let sum = 0;
  let digest = 2166136261;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    lumas.push(lum);
    sum += lum;
    digest ^= (r << 16) | (g << 8) | b;
    digest = Math.imul(digest, 16777619);
  }
  lumas.sort((a, b) => a - b);
  const n = Math.max(1, lumas.length);
  const p50 = lumas[Math.floor(n * 0.5)] ?? 0;
  const p99 = lumas[Math.floor(n * 0.99)] ?? 0;
  let bright = 0;
  for (const l of lumas) {
    if (l > 12.75) bright += 1;
  }
  return {
    mean: sum / n,
    p50,
    p99,
    brightFrac: bright / n,
    digest: (digest >>> 0).toString(16),
  };
}

/** Normalized 0..1 for regression (p99 target > 0.18 → raw > 46). */
export function normalizedP99(report: LumaReport): number {
  return report.p99 / 255;
}
