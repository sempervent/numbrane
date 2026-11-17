import { describe, expect, it } from "vitest";
import {
  createModulationState,
  demoFeaturesAt,
  mapAudioToVisual,
  visualParamsDigest,
} from "../src/pfl/features";

describe("PFL audio → visual mapping", () => {
  it("demo mode produces distinct bass-heavy vs quiet profiles", () => {
    const loud = demoFeaturesAt(0.12, 1);
    const quiet = demoFeaturesAt(2.5, 1);
    expect(loud.low).toBeGreaterThan(quiet.low);
    const s0 = createModulationState();
    const s1 = createModulationState();
    const a = mapAudioToVisual(loud, s0, 1 / 60).params;
    const b = mapAudioToVisual(quiet, s1, 1 / 60).params;
    expect(a.curl).toBeGreaterThan(b.curl);
    expect(visualParamsDigest(a)).not.toBe(visualParamsDigest(b));
  });

  it("onset applies decaying impulse without unbounded growth", () => {
    let state = createModulationState();
    const f = { energy: 0.8, low: 0.9, mid: 0.5, high: 0.3, onset: true };
    const hit = mapAudioToVisual(f, state, 1 / 60);
    state = hit.state;
    expect(hit.params.impulse).toBeGreaterThan(0.5);
    const decay = mapAudioToVisual({ ...f, onset: false }, state, 0.5).params;
    expect(decay.impulse).toBeLessThan(hit.params.impulse);
  });

  it("deterministic demo features at same time", () => {
    expect(demoFeaturesAt(3.5, 1)).toEqual(demoFeaturesAt(3.5, 1));
    expect(demoFeaturesAt(3.5, 1.2).energy).toBeGreaterThan(demoFeaturesAt(3.5, 0.5).energy);
  });
});
