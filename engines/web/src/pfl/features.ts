/**
 * Audio features → visual modulation (demo + live paths share this).
 */

import type { AudioFeatures } from "../live/inputs/audioAnalysis";
import { emptyFeatures } from "../live/inputs/audioAnalysis";

export type PflFeatures = Pick<
  AudioFeatures,
  "energy" | "low" | "mid" | "high" | "onset"
>;

export type VisualParams = {
  motion: number;
  curl: number;
  lineWeight: number;
  shimmer: number;
  impulse: number;
  trailFade: number;
  hue: number;
};

/** Baseline visibility — art must read with zero audio. */
const AMBIENT: VisualParams = {
  motion: 0.48,
  curl: 0.42,
  lineWeight: 0.58,
  shimmer: 0.38,
  impulse: 0,
  trailFade: 0.42,
  hue: 0,
};

const AUDIO_GAIN = {
  motion: 0.22,
  curl: 0.28,
  lineWeight: 0.12,
  shimmer: 0.18,
  trailFade: -0.06,
};

/** Deterministic demo pattern from logical time (seconds). */
export function demoFeaturesAt(tSec: number, sensitivity: number): PflFeatures {
  const sens = Math.max(0.15, Math.min(2.5, sensitivity));
  const beat = tSec * 2.1;
  const kick = Math.max(0, Math.sin(beat * Math.PI) ** 8);
  const bass = 0.25 + 0.55 * kick;
  const mid = 0.35 + 0.25 * Math.sin(tSec * 0.73 + 1.2);
  const high = 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(tSec * 3.7));
  const energy = (bass * 0.45 + mid * 0.35 + high * 0.2) * sens;
  const onset = kick > 0.82 && Math.sin(beat * Math.PI) > 0.95;
  return {
    energy: Math.min(1, energy),
    low: Math.min(1, bass * sens),
    mid: Math.min(1, mid * sens),
    high: Math.min(1, high * sens),
    onset,
  };
}

export function ambientFeatures(): PflFeatures {
  return emptyFeatures();
}

export type ModulationState = { impulse: number };

export function createModulationState(): ModulationState {
  return { impulse: 0 };
}

export function mapAudioToVisual(
  f: PflFeatures,
  state: ModulationState,
  dtSec: number,
): { params: VisualParams; state: ModulationState } {
  let impulse = state.impulse;
  if (f.onset) impulse = Math.max(impulse, 1);
  impulse = Math.max(0, impulse - dtSec * 2.8);

  const motion = AMBIENT.motion + f.energy * AUDIO_GAIN.motion;
  const curl = AMBIENT.curl + f.low * AUDIO_GAIN.curl + impulse * 0.35;
  const lineWeight = AMBIENT.lineWeight + f.mid * AUDIO_GAIN.lineWeight;
  const shimmer = AMBIENT.shimmer + f.high * AUDIO_GAIN.shimmer;
  const trailFade = AMBIENT.trailFade + f.energy * AUDIO_GAIN.trailFade;
  const hue = f.high * 0.12 - f.low * 0.04;

  return {
    params: {
      motion: clamp(0.4, 1, motion),
      curl: clamp(0.35, 1, curl),
      lineWeight: clamp(0.45, 1, lineWeight),
      shimmer: clamp(0.3, 1, shimmer),
      impulse: clamp01(impulse),
      trailFade: clamp(0.35, 0.65, trailFade),
      hue: hue % 1,
    },
    state: { impulse },
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp(lo: number, hi: number, v: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Digest for deterministic regression (fixed precision). */
export function visualParamsDigest(p: VisualParams): string {
  return [
    p.motion,
    p.curl,
    p.lineWeight,
    p.shimmer,
    p.impulse,
    p.trailFade,
    p.hue,
  ]
    .map((x) => x.toFixed(4))
    .join(",");
}
