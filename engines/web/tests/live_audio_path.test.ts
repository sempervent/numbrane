/**
 * Audio-first path: synthetic mic-like signal → DSP → normalization → modulation → param.
 * No MIDI required.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeFrame,
  createAnalyzerState,
  dftMagnitudes,
  emptyFeatures,
  synthSine,
  synthSilence,
} from "../src/live/inputs/audioAnalysis";
import { ModulationMatrix } from "../src/live/modulation";
import type { SetDef } from "../src/live/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("audio-first modulation path", () => {
  const set = JSON.parse(
    readFileSync(resolve(root, "pieces/live/pfl-default/set.json"), "utf8"),
  ) as SetDef;

  it("every pfl-default scene has at least one audio.* mapping", () => {
    for (const scene of set.scenes) {
      const audioMods = (scene.modulation ?? []).filter((m) =>
        m.source.startsWith("audio."),
      );
      expect(audioMods.length, scene.id).toBeGreaterThan(0);
    }
  });

  it("scenes use diverse audio sources (not only energy)", () => {
    const sources = new Set<string>();
    for (const scene of set.scenes) {
      for (const m of scene.modulation ?? []) {
        if (m.source.startsWith("audio.")) sources.add(m.source);
      }
    }
    expect(sources.has("audio.energy")).toBe(true);
    expect(sources.has("audio.low") || sources.has("audio.mid") || sources.has("audio.high")).toBe(
      true,
    );
    expect(sources.has("audio.flux") || sources.has("audio.centroid")).toBe(true);
    expect(sources.size).toBeGreaterThanOrEqual(4);
  });

  it("mic-like sine → features → mapped density increases with energy", () => {
    const sr = 44100;
    const n = 2048;
    const quiet = synthSilence(n);
    const loud = synthSine(n, 220, sr, 0.7);
    let state = createAnalyzerState();
    let quietF = emptyFeatures();
    let loudF = emptyFeatures();
    for (let i = 0; i < 8; i++) {
      quietF = analyzeFrame(quiet, dftMagnitudes(quiet), sr, state).features;
      state = analyzeFrame(quiet, dftMagnitudes(quiet), sr, state).state;
    }
    state = createAnalyzerState();
    for (let i = 0; i < 8; i++) {
      const r = analyzeFrame(loud, dftMagnitudes(loud), sr, state);
      loudF = r.features;
      state = r.state;
    }
    expect(loudF.energy).toBeGreaterThan(quietF.energy);

    const scene = set.scenes.find((s) => s.id === "void")!;
    const mx = new ModulationMatrix();
    mx.setMappings(
      (scene.modulation ?? [])
        .filter((m) => m.source === "audio.energy")
        .map((m, i) => ({
          id: m.id ?? `m${i}`,
          source: m.source,
          destination: m.destination,
          amount: m.amount ?? 1,
          offset: m.offset ?? 0,
          min: m.min ?? 0,
          max: m.max ?? 1,
          curve: m.curve ?? 1,
          invert: m.invert ?? false,
          smoothing: 0,
        })),
    );
    const low = mx.evaluate({ "audio.energy": quietF.energy });
    const high = mx.evaluate({ "audio.energy": loudF.energy });
    expect(high["layer.geom.density"]!).toBeGreaterThan(low["layer.geom.density"]!);
  });

  it("no-input features are finite neutrals", () => {
    const f = emptyFeatures();
    for (const v of Object.values(f)) {
      if (typeof v === "number") {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBe(0);
      }
    }
    expect(f.onset).toBe(false);
  });
});
