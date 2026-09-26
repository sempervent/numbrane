import { describe, expect, it } from "vitest";
import { SetOrchestrator } from "../src/live/setOrchestrator";
import { resolveSetModel } from "../src/live/setModel";
import type { SetDef, SetDefV2 } from "../src/live/types";

function fixtureSet(): SetDefV2 {
  return {
    protocol_version: "0.2.0",
    set_id: "test-abcd",
    name: "Test",
    bpm: 120,
    scene_catalog: {
      A: {
        id: "A",
        name: "A",
        layers: [{ id: "L0", piece: "geometry/seed-of-life", seed: 1 }],
      },
      B: {
        id: "B",
        name: "B",
        layers: [{ id: "L0", piece: "fields/flow-hatching", seed: 2 }],
      },
      C: {
        id: "C",
        name: "C",
        layers: [{ id: "L0", piece: "particles/noodles", seed: 3 }],
      },
      D: {
        id: "D",
        name: "D",
        layers: [{ id: "L0", piece: "fractals/strange-attractors", seed: 4 }],
      },
    },
    sequence: ["A", "B", "C", "D"],
    edges: [
      {
        to_scene_id: "B",
        advancement: { mode: "automatic", dwell_bars: 4 },
        morph: { type: "crossfade", duration_bars: 8 },
        minimum_dwell_bars: 2,
        launch_quantization_bars: 1,
      },
      {
        to_scene_id: "C",
        advancement: { mode: "manual" },
        morph: { type: "crossfade", duration_beats: 2 },
        minimum_dwell_bars: 1,
        launch_quantization_bars: 0,
      },
      {
        to_scene_id: "D",
        advancement: { mode: "automatic", dwell_bars: 8 },
        morph: { type: "crossfade", duration_bars: 16 },
        minimum_dwell_bars: 1,
      },
    ],
  };
}

function tick(or: SetOrchestrator, beat: number, bpm = 120) {
  return or.tick({
    beat,
    bpm,
    beatsPerBar: 4,
    musicalTimingHealthy: true,
    dtSec: 1 / 60,
  });
}

describe("SetOrchestrator", () => {
  it("queue B then replace with C before launch => A→C only", () => {
    const or = new SetOrchestrator();
    or.loadSet(fixtureSet());
    expect(or.getActiveSceneId()).toBe("A");
    or.requestAdvance("B");
    expect(or.snapshot()?.queuedSceneId).toBe("B");
    or.requestAdvance("C");
    expect(or.snapshot()?.queuedSceneId).toBe("C");
    tick(or, 4);
    const tr = or.getTransition();
    expect(tr?.toSceneId).toBe("C");
    expect(tr?.fromSceneId).toBe("A");
  });

  it("during A→B, request C => finish B first", () => {
    const or = new SetOrchestrator();
    const set: SetDefV2 = fixtureSet();
    set.edges![0]!.launch_quantization_bars = 0;
    or.loadSet(set);
    or.requestAdvance("B");
    expect(or.getTransition()?.toSceneId).toBe("B");
    or.requestAdvance("C");
    tick(or, 32);
    expect(or.getActiveSceneId()).toBe("B");
    expect(or.snapshot()?.pendingAfterDwellSceneId).toBe("C");
  });

  it("minimum dwell enforced before next transition", () => {
    const or = new SetOrchestrator();
    const set: SetDefV2 = fixtureSet();
    set.edges![0]!.launch_quantization_bars = 0;
    set.edges![0]!.morph = { type: "cut", duration_beats: 0 };
    or.loadSet(set);
    or.requestAdvance("B");
    tick(or, 0);
    expect(or.getActiveSceneId()).toBe("B");
    const snap = or.snapshot()!;
    expect(snap.dwellUntilBeat).toBeGreaterThan(0);
    or.requestAdvance("C");
    tick(or, snap.dwellUntilBeat - 0.1);
    expect(or.getTransition()).toBeNull();
    tick(or, snap.dwellUntilBeat + 0.1);
  });

  it("manual advance queues when quantization enabled", () => {
    const or = new SetOrchestrator();
    or.loadSet(fixtureSet());
    or.requestAdvance();
    expect(or.snapshot()?.queuedSceneId).toBe("B");
    expect(or.getTransition()).toBeNull();
  });

  it("automatic advancement respects dwell_bars", () => {
    const or = new SetOrchestrator();
    const set: SetDefV2 = fixtureSet();
    set.edges![0]!.launch_quantization_bars = 0;
    set.edges![0]!.morph = { type: "cut", duration_beats: 0 };
    or.loadSet(set);
    tick(or, 16);
    expect(or.snapshot()?.queuedSceneId === "B" || or.getTransition()?.toSceneId === "B").toBe(
      true,
    );
  });

  it("rehearsal seek before transition leaves queue armed", () => {
    const or = new SetOrchestrator();
    or.loadSet(fixtureSet());
    or.seekRehearsal({ kind: "before_transition", to_scene_id: "B" });
    expect(or.getActiveSceneId()).toBe("A");
    expect(or.snapshot()?.queuedSceneId).toBe("B");
  });

  it("rehearsal draft does not mutate base model until apply", () => {
    const or = new SetOrchestrator();
    or.loadSet(fixtureSet());
    const draft = fixtureSet();
    draft.name = "Draft";
    or.setRehearsalDraft(draft);
    expect(or.getModel()?.name).toBe("Draft");
    const applied = or.applyRehearsalDraft();
    expect(applied?.name).toBe("Draft");
    expect(or.getModel()?.name).toBe("Draft");
  });

  it("resolves legacy 0.1.0 sets", () => {
    const legacy: SetDef = {
      protocol_version: "0.1.0",
      set_id: "legacy",
      name: "Legacy",
      scenes: [
        { id: "s1", name: "S1", layers: [{ id: "a", piece: "x" }] },
        {
          id: "s2",
          name: "S2",
          layers: [{ id: "b", piece: "y" }],
          transition: { type: "crossfade", duration_beats: 4 },
        },
      ],
    };
    const model = resolveSetModel(legacy);
    expect(model.scenes).toHaveLength(2);
    expect(model.edges[0]?.morph?.duration_beats).toBe(4);
  });
});
