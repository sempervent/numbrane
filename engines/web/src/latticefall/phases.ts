/**
 * LATTICEFALL composition phases with smooth envelope blending.
 *
 * Phases: ORDER → DRIFT → FRACTURE → FALL → AFTERIMAGE
 * Timing fractions must sum ≈ 1; adjacent phases crossfade.
 */

export const PHASE_NAMES = [
  "ORDER",
  "DRIFT",
  "FRACTURE",
  "FALL",
  "AFTERIMAGE",
] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

export type PhaseWeights = Record<PhaseName, number>;

export type PhaseSnapshot = {
  name: PhaseName;
  index: number;
  progress: number;
  weights: PhaseWeights;
  geometryClarity: number;
  fieldVisibility: number;
  fractalPressure: number;
  particleActivity: number;
  decay: number;
};

const DEFAULT_TIMING = [0.14, 0.24, 0.26, 0.22, 0.14];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Piecewise windows with 15% crossfade into neighbors.
 * Endpoints (progress 0 and 1) keep full weight on first/last phase.
 */
export function phaseAt(
  progress: number,
  timing: number[] = DEFAULT_TIMING,
): PhaseSnapshot {
  const p = clamp01(progress);
  const t =
    timing.length === PHASE_NAMES.length
      ? timing.map((x) => Math.max(1e-6, x))
      : DEFAULT_TIMING;
  const sum = t.reduce((a, b) => a + b, 0);
  const norm = t.map((x) => x / sum);

  const bounds: number[] = [0];
  let acc = 0;
  for (const w of norm) {
    acc += w;
    bounds.push(acc);
  }
  bounds[bounds.length - 1] = 1;

  const raw = PHASE_NAMES.map((_, i) => {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    const fade = (b - a) * 0.2;
    const enter = i === 0 ? 1 : smoothstep(a - fade, a + fade, p);
    const leave = i === PHASE_NAMES.length - 1 ? 1 : 1 - smoothstep(b - fade, b + fade, p);
    return clamp01(enter * leave);
  });

  const rsum = raw.reduce((a, b) => a + b, 0) || 1;
  const weights = {} as PhaseWeights;
  let best = 0;
  let bestI = 0;
  PHASE_NAMES.forEach((name, i) => {
    const w = raw[i]! / rsum;
    weights[name] = w;
    if (w > best) {
      best = w;
      bestI = i;
    }
  });

  const w = weights;
  return {
    name: PHASE_NAMES[bestI]!,
    index: bestI,
    progress: p,
    weights: w,
    geometryClarity: clamp01(
      w.ORDER * 1.0 +
        w.DRIFT * 0.85 +
        w.FRACTURE * 0.45 +
        w.FALL * 0.2 +
        w.AFTERIMAGE * 0.55,
    ),
    fieldVisibility: clamp01(
      w.ORDER * 0.15 +
        w.DRIFT * 0.9 +
        w.FRACTURE * 0.75 +
        w.FALL * 0.55 +
        w.AFTERIMAGE * 0.25,
    ),
    fractalPressure: clamp01(
      w.ORDER * 0.05 +
        w.DRIFT * 0.2 +
        w.FRACTURE * 0.85 +
        w.FALL * 1.0 +
        w.AFTERIMAGE * 0.35,
    ),
    particleActivity: clamp01(
      w.ORDER * 0.25 +
        w.DRIFT * 0.7 +
        w.FRACTURE * 0.95 +
        w.FALL * 1.0 +
        w.AFTERIMAGE * 0.4,
    ),
    decay: clamp01(w.AFTERIMAGE * 1.0 + w.FALL * 0.35),
  };
}

export function progressFromFrame(frame: number, durationFrames: number): number {
  if (durationFrames <= 1) return 0;
  return clamp01(frame / (durationFrames - 1));
}
