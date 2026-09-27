/**
 * Deterministic Scene variation — new seeds without uncontrolled RNG.
 */

export function variationSeed(baseSeed: number, variationIndex: number): number {
  let h = (baseSeed ^ Math.imul(variationIndex + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Perturb numeric params slightly for "another version" of same intent. */
export function applyVariationToParams(
  params: Record<string, number | string | boolean>,
  pieceId: string,
  baseSeed: number,
  variationIndex: number,
): Record<string, number | string | boolean> {
  const v = variationSeed(baseSeed, variationIndex);
  const out = { ...params };
  const keys = Object.keys(out).filter((k) => typeof out[k] === "number");
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const n = Number(out[key]);
    const delta = ((v >>> (i % 24)) & 0xff) / 255 - 0.5;
    const scale = key === "density" || key === "chaos" ? 0.12 : 0.06;
    out[key] = Math.max(0, n + delta * scale);
  }
  return out;
}
