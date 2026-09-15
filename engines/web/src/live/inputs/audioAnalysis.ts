/**
 * Audio feature analysis — DSP only (no ML).
 * Prefer calling from AudioWorklet or AnalyserNode time/freq data.
 */

export type AudioFeatures = {
  energy: number;
  peak: number;
  low: number;
  mid: number;
  high: number;
  centroid: number;
  flux: number;
  onset: boolean;
  rolloff: number;
  zcr: number;
};

export type NormState = {
  floor: number;
  ceil: number;
  env: number;
};

export type NormConfig = {
  attack: number;
  release: number;
  sensitivity: number;
  floorAdapt: number;
  ceilAdapt: number;
  log: boolean;
};

const DEFAULT_NORM: NormConfig = {
  attack: 0.28,
  release: 0.1,
  sensitivity: 0.92,
  floorAdapt: 0.004,
  ceilAdapt: 0.012,
  log: true,
};

export function emptyFeatures(): AudioFeatures {
  return {
    energy: 0,
    peak: 0,
    low: 0,
    mid: 0,
    high: 0,
    centroid: 0,
    flux: 0,
    onset: false,
    rolloff: 0,
    zcr: 0,
  };
}

/** RMS of time-domain samples in [-1,1]. */
export function rms(samples: ArrayLike<number>): number {
  let s = 0;
  const n = samples.length || 1;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    s += v * v;
  }
  return Math.sqrt(s / n);
}

export function peakAbs(samples: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > p) p = a;
  }
  return p;
}

/** Zero-crossing rate in [0,1]. */
export function zeroCrossingRate(samples: ArrayLike<number>): number {
  if (samples.length < 2) return 0;
  let z = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]! >= 0 !== samples[i - 1]! >= 0) z++;
  }
  return z / (samples.length - 1);
}

/**
 * Band energies from magnitude spectrum (linear bins).
 * Returns {low, mid, high, centroid, rolloff} with relative scales.
 */
export function spectrumFeatures(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
): {
  low: number;
  mid: number;
  high: number;
  centroid: number;
  rolloff: number;
} {
  const n = magnitudes.length;
  if (n === 0) return { low: 0, mid: 0, high: 0, centroid: 0, rolloff: 0 };
  const nyquist = sampleRate / 2;
  const binHz = nyquist / Math.max(1, n - 1);

  let low = 0,
    mid = 0,
    high = 0;
  let weighted = 0,
    total = 0;
  const energies: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const m = magnitudes[i]!;
    const e = m * m;
    energies[i] = e;
    const hz = i * binHz;
    if (hz < 250) low += e;
    else if (hz < 2000) mid += e;
    else high += e;
    weighted += hz * e;
    total += e;
  }

  const centroid = total > 1e-12 ? weighted / total / nyquist : 0;
  // Spectral rolloff: frequency below which 85% of energy lies, normalized
  const target = total * 0.85;
  let acc = 0;
  let rolloffBin = n - 1;
  for (let i = 0; i < n; i++) {
    acc += energies[i]!;
    if (acc >= target) {
      rolloffBin = i;
      break;
    }
  }
  const rolloff = rolloffBin / Math.max(1, n - 1);
  const scale = Math.max(total, 1e-12);
  return {
    low: low / scale,
    mid: mid / scale,
    high: high / scale,
    centroid: Math.min(1, Math.max(0, centroid)),
    rolloff: Math.min(1, Math.max(0, rolloff)),
  };
}

export function spectralFlux(
  prev: ArrayLike<number> | null,
  curr: ArrayLike<number>,
): number {
  if (!prev || prev.length !== curr.length) return 0;
  let s = 0;
  for (let i = 0; i < curr.length; i++) {
    const d = curr[i]! - prev[i]!;
    if (d > 0) s += d;
  }
  return s / Math.max(1, curr.length);
}

export type OnsetState = { lastFlux: number; hold: number };

export function detectOnset(
  flux: number,
  state: OnsetState,
  threshold = 0.08,
  holdFrames = 4,
): { onset: boolean; state: OnsetState } {
  let hold = Math.max(0, state.hold - 1);
  let onset = false;
  if (hold === 0 && flux > threshold && flux > state.lastFlux * 1.35) {
    onset = true;
    hold = holdFrames;
  }
  return { onset, state: { lastFlux: flux, hold } };
}

export function createNormState(): NormState {
  return { floor: 0, ceil: 0.001, env: 0 };
}

/** Adaptive normalize raw → [0,1] with attack/release envelope. */
export function normalizeFeature(
  raw: number,
  state: NormState,
  cfg: NormConfig = DEFAULT_NORM,
): { value: number; state: NormState } {
  let v = Math.max(0, raw) * cfg.sensitivity;
  if (cfg.log) v = Math.log1p(v * 8) / Math.log1p(8);

  const floor = state.floor + (v - state.floor) * cfg.floorAdapt;
  let ceil = state.ceil;
  if (v > ceil) ceil = v;
  else ceil = ceil + (v - ceil) * cfg.ceilAdapt;
  ceil = Math.max(ceil, floor + 1e-4);

  const norm = Math.min(1, Math.max(0, (v - floor) / (ceil - floor)));
  const coeff = norm > state.env ? cfg.attack : cfg.release;
  const env = state.env + (norm - state.env) * coeff;
  return { value: env, state: { floor, ceil, env } };
}

export type AnalyzerState = {
  prevMags: Float32Array | null;
  onset: OnsetState;
  norms: Record<string, NormState>;
};

export function createAnalyzerState(): AnalyzerState {
  return {
    prevMags: null,
    onset: { lastFlux: 0, hold: 0 },
    norms: {},
  };
}

function normKey(
  state: AnalyzerState,
  key: string,
  raw: number,
  cfg?: NormConfig,
): number {
  const prev = state.norms[key] ?? createNormState();
  const { value, state: next } = normalizeFeature(raw, prev, cfg);
  state.norms[key] = next;
  return value;
}

/**
 * Analyze one frame of time-domain + frequency-domain data.
 * `time` in [-1,1], `freq` magnitude bins (linear).
 */
export function analyzeFrame(
  time: ArrayLike<number>,
  freq: ArrayLike<number>,
  sampleRate: number,
  state: AnalyzerState,
): { features: AudioFeatures; state: AnalyzerState } {
  const energyRaw = rms(time);
  const peakRaw = peakAbs(time);
  const zcr = zeroCrossingRate(time);
  const spec = spectrumFeatures(freq, sampleRate);
  const fluxRaw = spectralFlux(state.prevMags, freq);
  const { onset, state: onsetState } = detectOnset(fluxRaw, state.onset);

  const next: AnalyzerState = {
    prevMags: Float32Array.from(freq as ArrayLike<number>),
    onset: onsetState,
    norms: state.norms,
  };

  const features: AudioFeatures = {
    energy: normKey(next, "energy", energyRaw),
    peak: normKey(next, "peak", peakRaw),
    low: normKey(next, "low", spec.low * energyRaw * 4),
    mid: normKey(next, "mid", spec.mid * energyRaw * 4),
    high: normKey(next, "high", spec.high * energyRaw * 4),
    centroid: normKey(next, "centroid", spec.centroid),
    flux: normKey(next, "flux", fluxRaw * 10),
    onset,
    rolloff: normKey(next, "rolloff", spec.rolloff),
    zcr: normKey(next, "zcr", zcr),
  };

  return { features, state: next };
}

/** Generate synthetic test signals. */
export function synthSine(
  n: number,
  freq: number,
  sampleRate: number,
  amp = 0.5,
): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

export function synthImpulse(n: number, at = 0, amp = 1): Float32Array {
  const out = new Float32Array(n);
  if (at >= 0 && at < n) out[at] = amp;
  return out;
}

export function synthSilence(n: number): Float32Array {
  return new Float32Array(n);
}

/** Naive DFT magnitudes for tests (first half). */
export function dftMagnitudes(samples: ArrayLike<number>): Float32Array {
  const n = samples.length;
  const half = Math.floor(n / 2);
  const out = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    let re = 0,
      im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += samples[i]! * Math.cos(a);
      im += samples[i]! * Math.sin(a);
    }
    out[k] = Math.hypot(re, im) / n;
  }
  return out;
}
