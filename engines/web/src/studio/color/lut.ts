/**
 * Build 1D color LUT textures from ramps (linear RGB interpolation).
 */

import type { ColorRamp, RampStop } from "./model";
import { linearToSrgb, parseHexColor, srgbToLinear } from "./model";

export const LUT_SIZE = 256;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleStopsLinear(stops: RampStop[], t: number): { r: number; g: number; b: number; a: number } {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return { r: 0, g: 0, b: 0, a: 1 };
  if (t <= sorted[0]!.t) return parseHexColor(sorted[0]!.color.value);
  if (t >= sorted[sorted.length - 1]!.t) {
    return parseHexColor(sorted[sorted.length - 1]!.color.value);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const ca = parseHexColor(a.color.value);
      const cb = parseHexColor(b.color.value);
      const lr = lerp(srgbToLinear(ca.r), srgbToLinear(cb.r), u);
      const lg = lerp(srgbToLinear(ca.g), srgbToLinear(cb.g), u);
      const lb = lerp(srgbToLinear(ca.b), srgbToLinear(cb.b), u);
      const la = lerp(ca.a, cb.a, u);
      return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb), a: la };
    }
  }
  return parseHexColor(sorted[0]!.color.value);
}

/** RGBA8 LUT for WebGL (256×1). Interpolation in linear RGB. */
export function buildLutRGBA8(ramp: ColorRamp): Uint8Array {
  const out = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const c = sampleStopsLinear(ramp.stops, t);
    out[i * 4] = Math.round(c.r * 255);
    out[i * 4 + 1] = Math.round(c.g * 255);
    out[i * 4 + 2] = Math.round(c.b * 255);
    out[i * 4 + 3] = Math.round(c.a * 255);
  }
  return out;
}

/** Python-friendly list of RGB tuples 0..255. */
export function rampToPythonStops(ramp: ColorRamp): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const c = sampleStopsLinear(ramp.stops, t);
    out.push([
      Math.round(c.r * 255),
      Math.round(c.g * 255),
      Math.round(c.b * 255),
    ]);
  }
  return out;
}
