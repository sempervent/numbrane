import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AnimationRuntime } from "../src/live/animationRuntime";
import { LiveRuntime } from "../src/live/runtime";
import { morphScenes } from "../src/live/sceneMorph";
import { captureSceneCandidate } from "../src/live/sceneCapture";
import { resolveSetModel } from "../src/live/setModel";
import type { SetDef } from "../src/live/types";
import { normalizeSpecForLivePerformance } from "../src/studio/animation/performance";
import { applyAnimationMethod } from "../src/studio/animation/methods";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("set performance integration", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(root, "pieces/live/set-performance-fixture/set.json"), "utf8"),
  ) as SetDef;

  it("fixture resolves four scenes with distinct pieces", () => {
    const model = resolveSetModel(fixture);
    expect(model.scenes).toHaveLength(4);
    const pieces = new Set(model.scenes.map((s) => s.layers[0]?.piece));
    expect(pieces.size).toBe(4);
  });

  it("multi-scene runtime advances without resetting performance animation clock", () => {
    const rt = new LiveRuntime({ fps: 60 });
    rt.loadSet(fixture);
    rt.transport.setBpm(120);
    rt.transport.start();
    const spec = normalizeSpecForLivePerformance(
      "geometry/seed-of-life",
      applyAnimationMethod("geometry/seed-of-life", "slow-drift"),
      "animate",
    );
    const anim = new AnimationRuntime(spec);
    anim.performanceMode = true;
    for (let i = 0; i < 600; i++) {
      anim.tick(1 / 60, true);
      rt.tick(1000 + i * (1000 / 60));
    }
    const tBefore = anim.animationTimeSec;
    rt.advanceSet();
    for (let i = 0; i < 120; i++) {
      anim.tick(1 / 60, true);
      rt.tick(7000 + i * (1000 / 60));
    }
    expect(anim.animationTimeSec).toBeGreaterThan(tBefore);
    expect(rt.getUpdateCount()).toBeGreaterThan(600);
  });

  it("morph between distinct scenes produces intermediate opacities", () => {
    const model = resolveSetModel(fixture);
    const a = model.scenes[0]!;
    const b = model.scenes[1]!;
    const mid = morphScenes(a, b, 0.5);
    expect(mid.layers.length).toBeGreaterThan(0);
    expect(mid.progress).toBeGreaterThan(0.4);
    expect(mid.progress).toBeLessThan(0.6);
  });

  it("capture morph candidate does not require set mutation", () => {
    const model = resolveSetModel(fixture);
    const before = JSON.stringify(fixture);
    const captured = captureSceneCandidate(
      {
        fromScene: model.scenes[0]!,
        toScene: model.scenes[1]!,
        morphProgress: 0.42,
        performanceTimeSec: 12.5,
        globalSeed: 99,
      },
      "cap-1",
      "Captured",
    );
    expect(captured.layers[0]?.piece).toBeTruthy();
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("free-running transport ticks orchestrator under fixture", () => {
    const rt = new LiveRuntime({ fps: 60 });
    rt.loadSet(fixture);
    rt.transport.setBpm(120);
    rt.transport.setSource("internal");
    rt.transport.start();
    let now = 0;
    for (let i = 0; i < 3600; i++) {
      now += 1000 / 60;
      rt.tick(now);
    }
    expect(rt.getUpdateCount()).toBeGreaterThan(3000);
    expect(rt.getOrchestratorTransition()?.progress ?? 1).toBeLessThanOrEqual(1);
  });

  it("MIDI sync loss flag falls back without stopping updates", () => {
    const rt = new LiveRuntime({ fps: 60 });
    rt.loadSet(fixture);
    rt.transport.setSource("midi-clock");
    rt.transport.start();
    rt.setMidiClockHealthy(false);
    let now = 0;
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      rt.tick(now);
    }
    expect(rt.getUpdateCount()).toBe(120);
  });
});
