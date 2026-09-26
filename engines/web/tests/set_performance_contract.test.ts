import { describe, expect, it } from "vitest";
import { AnimationRuntime } from "../src/live/animationRuntime";
import { LiveRuntime } from "../src/live/runtime";
import { morphScenes } from "../src/live/sceneMorph";
import { SetOrchestrator } from "../src/live/setOrchestrator";
import { livePerformanceTimeAt } from "../src/studio/animation/livePerformanceTime";
import { normalizeSpecForLivePerformance } from "../src/studio/animation/performance";
import { applyAnimationMethod } from "../src/studio/animation/methods";
import type { SetDef } from "../src/live/types";

const SAMPLE_SEC = [0, 8.1, 16, 60, 300];

describe("set performance contract", () => {
  it("performance mode avoids terminal phase stall", () => {
    const spec = normalizeSpecForLivePerformance(
      "fractals/strange-attractors",
      applyAnimationMethod("fractals/strange-attractors", "parameter-drift"),
      "animate",
    );
    for (const t of SAMPLE_SEC) {
      const live = livePerformanceTimeAt(t, spec, true);
      if (t >= 8.1) expect(live.cyclePhase).not.toBeCloseTo(1, 2);
    }
  });

  it("morph keeps both sides conceptually active (progress monotonic)", () => {
    const a = {
      id: "a",
      name: "a",
      layers: [{ id: "L0", piece: "geometry/seed-of-life", opacity: 1 }],
    };
    const b = {
      id: "b",
      name: "b",
      layers: [{ id: "L0", piece: "fields/flow-hatching", opacity: 1 }],
    };
    const p0 = morphScenes(a, b, 0).progress;
    const p1 = morphScenes(a, b, 1).progress;
    expect(p1).toBeGreaterThan(p0);
  });

  it("rehearse and perform share orchestrator semantics", () => {
    const set: SetDef = {
      protocol_version: "0.1.0",
      set_id: "x",
      name: "x",
      scenes: [
        { id: "a", name: "a", layers: [{ id: "l", piece: "p" }] },
        { id: "b", name: "b", layers: [{ id: "l", piece: "q" }] },
      ],
    };
    const perf = new SetOrchestrator();
    perf.loadSet(set);
    perf.setExecutionMode("perform");
    const rehearse = new SetOrchestrator();
    rehearse.loadSet(set);
    rehearse.setExecutionMode("rehearse");
    rehearse.seekRehearsal({ kind: "before_transition", to_scene_id: "b" });
    expect(rehearse.snapshot()?.queuedSceneId).toBe("b");
    expect(perf.snapshot()?.queuedSceneId).toBeNull();
  });

  it("long-running runtime update count increases in performance path", () => {
    const rt = new LiveRuntime({ fps: 60 });
    const set: SetDef = {
      protocol_version: "0.1.0",
      set_id: "y",
      name: "y",
      scenes: [{ id: "a", name: "a", layers: [{ id: "l", piece: "geometry/seed-of-life" }] }],
    };
    rt.loadSet(set);
    rt.transport.start();
    let now = 0;
    for (let i = 0; i < 600; i++) {
      now += 1000 / 60;
      rt.tick(now);
    }
    expect(rt.getUpdateCount()).toBeGreaterThan(500);
  });

  it("animation runtime accumulates time across simulated set advance", () => {
    const anim = new AnimationRuntime(
      normalizeSpecForLivePerformance(
        "geometry/seed-of-life",
        applyAnimationMethod("geometry/seed-of-life", "slow-drift"),
        "animate",
      ),
    );
    anim.performanceMode = true;
    for (let i = 0; i < 400; i++) anim.tick(1 / 60, true);
    const t0 = anim.animationTimeSec;
    for (let i = 0; i < 400; i++) anim.tick(1 / 60, true);
    expect(anim.animationTimeSec).toBeGreaterThan(t0);
  });
});
