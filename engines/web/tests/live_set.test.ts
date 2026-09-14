import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LiveRuntime } from "../src/live/runtime";
import type { SetDef } from "../src/live/types";
import {
  PerformanceRecorder,
  PerformanceReplayer,
  serializeRecording,
  parseRecording,
} from "../src/live/recording/performance";
import { emptyFeatures } from "../src/live/inputs/audioAnalysis";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("live set + recording", () => {
  const set = JSON.parse(
    readFileSync(resolve(root, "pieces/live/pfl-default/set.json"), "utf8"),
  ) as SetDef;

  it("loads pfl-default scenes", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    expect(rt.getScene()?.id).toBe("void");
    expect(set.scenes.length).toBeGreaterThanOrEqual(6);
    rt.nextScene();
    // transition active may delay index — goto sets index immediately
    expect(rt.getScene()?.id).toBe("signal");
  });

  it("cues drive navigation", () => {
    const rt = new LiveRuntime();
    rt.loadSet(set);
    rt.applyCue({ id: "n", action: "next_scene" });
    expect(rt.getSceneIndex()).toBe(1);
    rt.applyCue({ id: "b", action: "blackout" });
    expect(rt.isBlackout()).toBe(true);
    rt.applyCue({ id: "p", action: "panic" });
    expect(rt.isBlackout()).toBe(false);
  });

  it("records and replays feature stream", () => {
    const rec = new PerformanceRecorder();
    rec.start(set, 42, 60, 0);
    const f = emptyFeatures();
    f.energy = 0.4;
    f.onset = true;
    rec.pushFeatures(0, 0, f);
    rec.pushEvent({ type: "scene", t: 1, beat: 4, scene_id: "bloom" });
    const out = rec.stop()!;
    expect(out.features).toHaveLength(1);
    const json = serializeRecording(out);
    const parsed = parseRecording(json);
    const rp = new PerformanceReplayer(parsed);
    expect(rp.featuresAt(0)?.energy).toBeCloseTo(0.4);
    expect(rp.eventsThrough(4)[0]?.type).toBe("scene");
  });

  it("transition progresses with beats", () => {
    const rt = new LiveRuntime({ fps: 60 });
    rt.loadSet(set);
    rt.transport.setBpm(120);
    rt.transport.setSource("internal");
    rt.transport.start();
    rt.gotoScene("bloom");
    const tr = rt.getTransition();
    expect(tr.active).toBe(true);
    // advance ~4 seconds = 8 beats at 120bpm
    let now = 1000;
    for (let i = 0; i < 240; i++) {
      now += 1000 / 60;
      rt.tick(now);
    }
    expect(rt.getTransition().progress).toBeGreaterThan(0.9);
  });
});
