/**
 * Deterministic live smoke — exercises transport, modulation, recording, set logic.
 * No WebGL / browser permissions required.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LiveRuntime } from "../src/live/runtime";
import type { SetDef } from "../src/live/types";
import { LfoBank, EnvelopeBank, ModulationMatrix } from "../src/live/modulation";
import {
  PerformanceRecorder,
  PerformanceReplayer,
  serializeRecording,
} from "../src/live/recording/performance";
import { emptyFeatures, type AudioFeatures } from "../src/live/inputs/audioAnalysis";
import { parseMidiBytes, MidiMapper } from "../src/live/inputs/midi";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const set = JSON.parse(
  readFileSync(resolve(root, "pieces/live/pfl-default/set.json"), "utf8"),
) as SetDef;

function synthFeatures(beat: number): AudioFeatures {
  const f = emptyFeatures();
  const phase = beat % 1;
  f.energy = 0.2 + 0.5 * Math.max(0, Math.sin(beat * 0.5));
  f.low = 0.3 + 0.4 * Math.max(0, Math.sin(beat * Math.PI * 2));
  f.mid = 0.25 + 0.3 * Math.abs(Math.sin(beat * 0.7));
  f.high = 0.15 + 0.25 * Math.abs(Math.sin(beat * 1.3));
  f.centroid = 0.3 + 0.2 * f.high;
  f.flux = phase < 0.05 ? 0.8 : 0.1;
  f.onset = phase < 0.05 && Math.floor(beat) % 2 === 0;
  f.peak = Math.max(f.energy, f.low);
  return f;
}

export function runSmoke(seconds = 45): {
  digest: string;
  recordingPath: string;
  scenesVisited: string[];
} {
  const rt = new LiveRuntime({ fps: 60, seed: 42 });
  rt.loadSet(set);
  rt.transport.setBpm(120);
  rt.transport.setSource("internal");
  rt.transport.start();

  const lfos = new LfoBank();
  lfos.setDefs([{ id: "lfo.slow", wave: "sine", rateBars: 2, sync: "bars", seed: 1 }]);
  const envs = new EnvelopeBank();
  envs.setDefs([{ id: "env.flash", kind: "pulse", attack: 0.01, decay: 0.15 }]);
  const mod = new ModulationMatrix();
  const mapper = new MidiMapper();
  mapper.bindings.push({
    id: "n",
    type: "note",
    note: 60,
    channel: 1,
    target: "action.next_scene",
    mode: "trigger",
  });

  const recorder = new PerformanceRecorder();
  recorder.start(set, 42, 60, 0);

  const scenesVisited: string[] = [rt.getScene()!.id];
  const frames = Math.floor(seconds * 60);
  let now = 0;
  let lastScene = rt.getScene()!.id;

  for (let i = 0; i < frames; i++) {
    now += 1000 / 60;
    const frame = rt.tick(now);
    const feats = synthFeatures(frame.beat);
    if (feats.onset) envs.trigger("env.flash", frame.t);

    // scene changes every 8 beats via fake MIDI
    if (i > 0 && i % (8 * 30) === 0) {
      const msg = parseMidiBytes(new Uint8Array([0x90, 60, 100]));
      if (msg) {
        const ev = mapper.handle(msg);
        if (ev.length) rt.nextScene();
      }
    }

    const scene = rt.getScene()!;
    if (scene.id !== lastScene) {
      scenesVisited.push(scene.id);
      lastScene = scene.id;
      recorder.pushEvent({
        type: "scene",
        t: frame.t,
        beat: frame.beat,
        scene_id: scene.id,
      });
      mod.setMappings(
        (scene.modulation ?? []).map((m, idx) => ({
          id: m.id ?? `m${idx}`,
          source: m.source,
          destination: m.destination,
          amount: m.amount ?? 1,
          offset: m.offset ?? 0,
          min: m.min ?? 0,
          max: m.max ?? 1,
          curve: m.curve ?? 1,
          invert: m.invert ?? false,
          smoothing: m.smoothing ?? 0,
        })),
      );
    }

    const sources = {
      "audio.energy": feats.energy,
      "audio.low": feats.low,
      "audio.mid": feats.mid,
      "audio.high": feats.high,
      "audio.onset": feats.onset ? 1 : 0,
      "transport.beatPhase": frame.beatPhase,
      ...lfos.sample(frame.beat, frame.bpm),
      ...envs.sample(frame.t),
    };
    void mod.evaluate(sources);
    recorder.pushFeatures(frame.t, frame.beat, feats);
  }

  // blackout + panic
  rt.setBlackout(true);
  rt.panic();

  const recording = recorder.stop()!;
  const outDir = resolve(root, "artifacts/live-smoke");
  mkdirSync(outDir, { recursive: true });
  const recordingPath = resolve(outDir, "smoke-performance.json");
  writeFileSync(recordingPath, serializeRecording(recording));

  const rp = new PerformanceReplayer(recording);
  const replayFeats = rp.featuresAt(recording.features[10]?.beat ?? 0);
  if (!replayFeats) throw new Error("replay features missing");

  // digest
  let h = 2166136261;
  const s = `${scenesVisited.join(",")}|${recording.features.length}|${rt.getFrame()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const digest = (h >>> 0).toString(16).padStart(8, "0");
  writeFileSync(resolve(outDir, "digest.txt"), digest);

  return { digest, recordingPath, scenesVisited };
}

import { pathToFileURL } from "node:url";
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const r = runSmoke(45);
  console.log("live-smoke ok", r);
}
