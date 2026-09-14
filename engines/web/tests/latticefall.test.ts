import { describe, expect, it } from "vitest";
import { deriveStreams, streamSeed } from "../src/latticefall/seedStreams";
import { phaseAt, progressFromFrame } from "../src/latticefall/phases";
import {
  computeTelemetry,
  emptyPrev,
} from "../src/latticefall/telemetry";
import {
  createMusicState,
  generateMusicalEvents,
} from "../src/latticefall/music";
import { semanticDigest } from "../src/latticefall/digest";
import { EventRecorder, EventReplayer } from "../src/events";

/** Python/Rust seed 42 geometry stream */
const SEED42_GEOMETRY = 1225911174;

describe("latticefall seed streams", () => {
  it("matches Python/Rust for seed 42 geometry", () => {
    expect(streamSeed(42, "geometry")).toBe(SEED42_GEOMETRY);
  });

  it("is order-independent", () => {
    const a = deriveStreams(42);
    const b = {
      interaction: streamSeed(42, "interaction"),
      geometry: streamSeed(42, "geometry"),
    };
    expect(a.geometry).toBe(b.geometry);
    expect(a.interaction).toBe(b.interaction);
  });

  it("keeps streams independent (audio draw does not affect particles)", () => {
    const particles = streamSeed(42, "particles");
    void streamSeed(42, "audio");
    expect(streamSeed(42, "particles")).toBe(particles);
  });
});

describe("latticefall phases", () => {
  it("starts in ORDER", () => {
    const p = phaseAt(0);
    expect(p.name).toBe("ORDER");
    expect(p.geometryClarity).toBeGreaterThan(0.5);
  });

  it("reaches FALL / AFTERIMAGE late", () => {
    const mid = phaseAt(0.55);
    expect(["FRACTURE", "FALL", "DRIFT"]).toContain(mid.name);
    const end = phaseAt(0.95);
    expect(end.decay).toBeGreaterThan(0.3);
  });

  it("progressFromFrame is deterministic", () => {
    expect(progressFromFrame(0, 100)).toBe(0);
    expect(progressFromFrame(99, 100)).toBe(1);
  });
});

describe("latticefall telemetry ranges", () => {
  it("clamps to [0,1]", () => {
    const count = 32;
    const buf = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const o = i * 9;
      buf[o] = i;
      buf[o + 1] = Math.sin(i) * 0.5;
      buf[o + 2] = Math.cos(i) * 0.5;
      buf[o + 3] = 0.2;
      buf[o + 4] = -0.1;
      buf[o + 7] = 0.8;
    }
    const phase = phaseAt(0.4);
    const { telemetry } = computeTelemetry(buf, count, emptyPrev(count), phase, 1.2);
    for (const v of Object.values(telemetry)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("latticefall music events", () => {
  it("is deterministic for same inputs", () => {
    const phase = phaseAt(0.5);
    const tel = { energy: 0.6, texture: 0.4, motion: 0.5, spectral: 0.3 };
    const a = generateMusicalEvents({
      frame: 120,
      fps: 60,
      masterSeed: 42,
      telemetry: tel,
      phase,
      params: { bpm: 96, scale: "dorian", density: 0.8 },
      nodeCount: 19,
      crossingHint: 0.5,
      state: createMusicState(),
    });
    const b = generateMusicalEvents({
      frame: 120,
      fps: 60,
      masterSeed: 42,
      telemetry: tel,
      phase,
      params: { bpm: 96, scale: "dorian", density: 0.8 },
      nodeCount: 19,
      crossingHint: 0.5,
      state: createMusicState(),
    });
    expect(a.events).toEqual(b.events);
  });
});

describe("latticefall digest + events", () => {
  it("stable digest for identical semantic state", () => {
    const phase = phaseAt(0.2);
    const tel = { energy: 0.1, texture: 0.2, motion: 0.3, spectral: 0.4 };
    const d1 = semanticDigest({
      frame: 0,
      seed: 42,
      particleDigest: "abcd",
      phase,
      telemetry: tel,
      musicEvents: [],
      chaos: 0.3,
      fieldStrength: 1,
      latticeGravity: 0.9,
    });
    const d2 = semanticDigest({
      frame: 0,
      seed: 42,
      particleDigest: "abcd",
      phase,
      telemetry: tel,
      musicEvents: [],
      chaos: 0.3,
      fieldStrength: 1,
      latticeGravity: 0.9,
    });
    expect(d1).toBe(d2);
    expect(d1).toHaveLength(16);
  });

  it("records and replays parameter events in order", () => {
    const rec = new EventRecorder();
    rec.record({
      type: "parameter.change",
      frame: 10,
      parameter: { path: "chaos", value: 0.5 },
    });
    rec.record({
      type: "pointer.down",
      frame: 5,
      pointer: { x: 0.2, y: 0.3, space: "cartesian-2d" },
    });
    const json = rec.exportJSON(42, 60);
    const { stream, replayer } = EventReplayer.fromJSON(json);
    expect(stream.seed).toBe(42);
    expect(replayer.eventsAt(5)).toHaveLength(1);
    expect(replayer.eventsAt(10)).toHaveLength(1);
  });
});
