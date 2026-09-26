import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SetOrchestrator } from "../src/live/setOrchestrator";
import { LiveRuntime } from "../src/live/runtime";
import { resolveSetModel } from "../src/live/setModel";
import type { SetDef } from "../src/live/types";
import { captureSceneCandidate } from "../src/live/sceneCapture";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Set score software walkthrough", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(root, "pieces/live/set-performance-fixture/set.json"), "utf8"),
  ) as SetDef;

  it("rehearse seek, advance, morph tick, capture without mutating set JSON", () => {
    const before = JSON.stringify(fixture);
    const or = new SetOrchestrator();
    or.loadSet(fixture);

    const model = resolveSetModel(fixture);
    const fromScene = model.scenes[0]!;
    const toScene = model.scenes[1]!;
    or.requestAdvance(toScene.id);
    for (let beat = 0; beat <= 16; beat += 0.25) {
      or.tick({
        beat,
        bpm: 120,
        beatsPerBar: 4,
        musicalTimingHealthy: true,
        dtSec: 1 / 60,
      });
    }
    const tr = or.getTransition();
    expect(tr != null && tr.progress > 0 && tr.progress < 1).toBe(true);
    const candidate = captureSceneCandidate(
      {
        fromScene,
        toScene,
        morphProgress: tr!.progress,
        performanceTimeSec: 5,
        globalSeed: 42,
      },
      "cap-walk",
      "Walkthrough capture",
    );
    expect(candidate.id).toBe("cap-walk");
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("automatic edge advances under simulated beats", () => {
    const or = new SetOrchestrator();
    or.loadSet(fixture);
    expect(or.getActiveSceneId()).toBe("scene-a");
    for (let beat = 0; beat <= 72; beat += 0.5) {
      or.tick({
        beat,
        bpm: 120,
        beatsPerBar: 4,
        musicalTimingHealthy: true,
        dtSec: 1 / 60,
      });
    }
    expect(or.getActiveSceneId()).toBe("scene-b");
  });

  it("MIDI loss fallback flag surfaces in orchestrator snapshot", () => {
    const rt = new LiveRuntime({ fps: 60 });
    rt.loadSet(fixture);
    rt.setMidiClockHealthy(false);
    rt.transport.start();
    rt.orchestrator.tick({
      beat: 0,
      bpm: 120,
      beatsPerBar: 4,
      musicalTimingHealthy: false,
      dtSec: 1 / 60,
    });
    expect(rt.orchestrator.snapshot()?.musicalTiming).toBe(false);
  });
});
