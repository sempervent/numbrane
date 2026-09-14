import { describe, expect, it } from "vitest";
import {
  analyzeFrame,
  createAnalyzerState,
  detectOnset,
  dftMagnitudes,
  normalizeFeature,
  createNormState,
  spectrumFeatures,
  spectralFlux,
  synthImpulse,
  synthSilence,
  synthSine,
  rms,
} from "../src/live/inputs/audioAnalysis";

describe("audio analysis DSP", () => {
  const sr = 44100;
  const n = 2048;

  it("silence → near-zero energy", () => {
    const time = synthSilence(n);
    const freq = dftMagnitudes(time);
    const { features } = analyzeFrame(time, freq, sr, createAnalyzerState());
    expect(features.energy).toBeLessThan(0.15);
    expect(rms(time)).toBe(0);
  });

  it("low tone → low-band > high-band", () => {
    const time = synthSine(n, 110, sr, 0.6);
    const freq = dftMagnitudes(time);
    const spec = spectrumFeatures(freq, sr);
    expect(spec.low).toBeGreaterThan(spec.high);
  });

  it("high tone → high-band > low-band", () => {
    const time = synthSine(n, 6000, sr, 0.6);
    const freq = dftMagnitudes(time);
    const spec = spectrumFeatures(freq, sr);
    expect(spec.high).toBeGreaterThan(spec.low);
  });

  it("impulse → onset", () => {
    const silence = synthSilence(n);
    const impulse = synthImpulse(n, 10, 1);
    const freq0 = dftMagnitudes(silence);
    const freq1 = dftMagnitudes(impulse);
    const flux1 = spectralFlux(freq0, freq1);
    expect(flux1).toBeGreaterThan(0);
    const { onset } = detectOnset(0.5, { lastFlux: 0.01, hold: 0 }, 0.08, 4);
    expect(onset).toBe(true);
  });

  it("normalize adapts floor/ceil", () => {
    let st = createNormState();
    let v = 0;
    for (let i = 0; i < 50; i++) {
      const r = normalizeFeature(0.5, st);
      st = r.state;
      v = r.value;
    }
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
