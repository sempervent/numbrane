import { describe, expect, it } from "vitest";
import { Transport, beatsFromTransition } from "../src/live/transport";
import { LiveRuntime } from "../src/live/runtime";
import type { SetDef } from "../src/live/types";

describe("transport", () => {
  it("advances beats from wall clock when playing", () => {
    const t = new Transport();
    t.setBpm(120);
    t.start();
    t.advanceWall(1000);
    t.advanceWall(1000 + 500); // 0.5s at 120bpm = 1 beat
    const s = t.getSnapshot();
    expect(s.beat).toBeCloseTo(1, 5);
    expect(s.playing).toBe(true);
  });

  it("does not advance when stopped", () => {
    const t = new Transport();
    t.start();
    t.advanceWall(0);
    t.stop();
    t.advanceWall(1000);
    expect(t.getSnapshot().beat).toBe(0);
  });

  it("maps MIDI clock ticks to beats at 24 PPQN", () => {
    const t = new Transport();
    t.setSource("midi-clock");
    t.start();
    for (let i = 0; i < 24; i++) t.onMidiClock();
    expect(t.getSnapshot().beat).toBeCloseTo(1, 8);
  });

  it("computes bar and beatPhase in 4/4", () => {
    const t = new Transport();
    t.seekBeat(5.25);
    const s = t.getSnapshot();
    expect(s.bar).toBe(1);
    expect(s.beatInBar).toBeCloseTo(1.25, 5);
    expect(s.beatPhase).toBeCloseTo(0.25, 5);
  });

  it("tap tempo estimates BPM", () => {
    const t = new Transport();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBeCloseTo(120, 0);
  });
});

describe("beatsFromTransition", () => {
  it("prefers beats, then bars, then seconds", () => {
    expect(beatsFromTransition({ bpm: 120, duration_beats: 2 })).toBe(2);
    expect(beatsFromTransition({ bpm: 120, duration_bars: 1 })).toBe(4);
    expect(beatsFromTransition({ bpm: 120, duration_seconds: 1 })).toBe(2);
  });
});

describe("LiveRuntime scenes", () => {
  const set: SetDef = {
    protocol_version: "0.1.0",
    set_id: "test",
    name: "Test",
    bpm: 120,
    default_transition: { type: "cut" },
    scenes: [
      {
        id: "a",
        name: "A",
        layers: [{ id: "l0", piece: "geometry/seed-of-life" }],
      },
      {
        id: "b",
        name: "B",
        layers: [{ id: "l0", piece: "fractals/escape-time" }],
        transition: { type: "crossfade", duration_beats: 2 },
      },
    ],
  };

  it("loads set and navigates scenes", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    expect(rt.getScene()?.id).toBe("a");
    rt.nextScene();
    expect(rt.getScene()?.id).toBe("b");
    rt.prevScene();
    expect(rt.getScene()?.id).toBe("a");
    rt.gotoScene("b");
    expect(rt.getScene()?.id).toBe("b");
  });

  it("runs crossfade transition progress from beats", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    rt.transport.start();
    rt.transport.seekBeat(0);
    rt.gotoScene("b");
    expect(rt.getTransition().active).toBe(true);
    rt.transport.seekBeat(1);
    rt.tick(0);
    expect(rt.getTransition().progress).toBeCloseTo(0.5, 5);
    rt.transport.seekBeat(2);
    rt.tick(0);
    expect(rt.getTransition().active).toBe(false);
  });

  it("blackout and panic", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    rt.setBlackout(true);
    expect(rt.isBlackout()).toBe(true);
    rt.panic();
    expect(rt.isBlackout()).toBe(false);
  });

  it("applies cues", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    rt.applyCue({ id: "n", action: "next_scene" });
    expect(rt.getScene()?.id).toBe("b");
    rt.applyCue({ id: "g", action: "goto_scene", scene_id: "a" });
    expect(rt.getScene()?.id).toBe("a");
  });
});
