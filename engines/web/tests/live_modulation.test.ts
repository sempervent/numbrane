import { describe, expect, it } from "vitest";
import {
  EnvelopeBank,
  LfoBank,
  ModulationMatrix,
  mapModulation,
  applyModToBase,
} from "../src/live/modulation";

describe("modulation / LFO / envelopes", () => {
  it("maps source with amount/offset/curve", () => {
    const v = mapModulation(1, {
      id: "m",
      source: "audio.energy",
      destination: "x",
      amount: 0.5,
      offset: 0.25,
      min: 0,
      max: 1,
      curve: 1,
      invert: false,
      smoothing: 0,
    });
    expect(v).toBeCloseTo(0.75);
  });

  it("applyModToBase mixes", () => {
    expect(applyModToBase(0.2, 0.8, 1)).toBeCloseTo(0.8);
    expect(applyModToBase(0.2, 0.8, 0)).toBeCloseTo(0.2);
  });

  it("matrix evaluates destinations", () => {
    const mx = new ModulationMatrix();
    mx.setMappings([
      {
        id: "a",
        source: "audio.low",
        destination: "layer.g.density",
        amount: 1,
        offset: 0,
        min: 0,
        max: 1,
        curve: 1,
        invert: false,
        smoothing: 0,
      },
    ]);
    const out = mx.evaluate({ "audio.low": 0.5 });
    expect(out["layer.g.density"]).toBeCloseTo(0.5);
  });

  it("LFO beat sync is deterministic", () => {
    const bank = new LfoBank();
    bank.setDefs([{ id: "lfo.beat", wave: "sine", rateBeats: 4, sync: "beats", seed: 9 }]);
    const a = bank.sample(0, 120);
    const b = bank.sample(0, 120);
    expect(a["lfo.beat"]).toBe(b["lfo.beat"]);
    const c = bank.sample(2, 120);
    expect(c["lfo.beat"]).not.toBe(a["lfo.beat"]);
  });

  it("sample-and-hold uses deterministic RNG", () => {
    const bank = new LfoBank();
    bank.setDefs([{ id: "sh", wave: "sample_hold", rateBeats: 1, sync: "beats", seed: 42 }]);
    const a = bank.sample(0.1, 120);
    const b = bank.sample(0.1, 120);
    expect(a.sh).toBe(b.sh);
  });

  it("AD envelope rises then falls", () => {
    const env = new EnvelopeBank();
    env.setDefs([{ id: "flash", kind: "ad", attack: 0.1, decay: 0.2 }]);
    env.trigger("flash", 0);
    expect(env.sample(0.05).flash).toBeGreaterThan(0.4);
    expect(env.sample(0.5).flash).toBeLessThan(0.1);
  });
});
