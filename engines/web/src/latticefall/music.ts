/**
 * Deterministic musical event generation from LATTICEFALL telemetry + geometry.
 *
 * Separates:
 * - event generation (deterministic, testable)
 * - Tone.js scheduling (live-only; not bit-identical across browsers)
 *
 * Debounce / aggregation keeps the piece listenable (not a Geiger counter).
 */

import type { PhaseSnapshot } from "./phases";
import type { LatticefallTelemetry } from "./telemetry";
import { streamSeed } from "./seedStreams";

export type MusicalEvent = {
  frame: number;
  midi: number;
  velocity: number;
  durationBeats: number;
  voice: "lattice" | "field" | "fracture";
};

const SCALES: Record<string, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Tiny deterministic hash → [0,1) from frame + salt. */
function unitFrom(seed: number, frame: number, salt: number): number {
  let z = (seed ^ Math.imul(frame + 1, 0x9e37_79b9) ^ Math.imul(salt, 0x85eb_ca6b)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85eb_ca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2_ae35) >>> 0;
  return ((z ^ (z >>> 16)) >>> 0) / 0x1_0000_0000;
}

export type MusicParams = {
  bpm: number;
  scale: string;
  density: number;
  rootMidi?: number;
};

export type MusicState = {
  lastEmitFrame: number;
  crossingAccum: number;
};

export function createMusicState(): MusicState {
  return { lastEmitFrame: -999, crossingAccum: 0 };
}

/**
 * Generate 0..few musical events for this logical frame.
 * Uses audio stream seed so particle RNG is unaffected.
 */
export function generateMusicalEvents(args: {
  frame: number;
  fps: number;
  masterSeed: number;
  telemetry: LatticefallTelemetry;
  phase: PhaseSnapshot;
  params: MusicParams;
  nodeCount: number;
  crossingHint: number;
  state: MusicState;
}): { events: MusicalEvent[]; state: MusicState } {
  const { frame, fps, masterSeed, telemetry, phase, params, nodeCount, crossingHint } =
    args;
  const audioSeed = streamSeed(masterSeed, "audio");
  const scale = SCALES[params.scale] ?? SCALES.dorian!;
  const root = params.rootMidi ?? 48;
  const density = clamp01(params.density) * (0.35 + telemetry.motion * 0.65);
  const minGap = Math.max(2, Math.floor(fps / (2 + density * 6)));

  const state: MusicState = {
    lastEmitFrame: args.state.lastEmitFrame,
    crossingAccum: args.state.crossingAccum + crossingHint * phase.particleActivity,
  };

  const events: MusicalEvent[] = [];
  if (frame - state.lastEmitFrame < minGap) {
    return { events, state };
  }

  // Threshold: need enough accumulated crossings / energy pressure
  const pressure =
    state.crossingAccum * 0.4 +
    telemetry.energy * 0.35 +
    telemetry.texture * 0.15 +
    phase.fractalPressure * 0.1;

  const roll = unitFrom(audioSeed, frame, 1);
  if (roll > pressure * density + 0.08) {
    return { events, state };
  }

  const degree = Math.floor(unitFrom(audioSeed, frame, 2) * scale.length) % scale.length;
  const octave = Math.floor(unitFrom(audioSeed, frame, 3) * (1 + telemetry.spectral * 2));
  const nodeBias = Math.floor(unitFrom(audioSeed, frame, 4) * Math.max(1, nodeCount)) % Math.max(1, scale.length);
  const midi =
    root +
    scale[(degree + nodeBias) % scale.length]! +
    12 * octave +
    Math.floor(phase.fractalPressure * 5);

  let voice: MusicalEvent["voice"] = "lattice";
  if (phase.fractalPressure > 0.55) voice = "fracture";
  else if (phase.fieldVisibility > 0.55) voice = "field";

  const velocity = clamp01(0.25 + telemetry.energy * 0.55 + density * 0.2);
  const durationBeats = 0.25 + (1 - telemetry.motion) * 0.75;

  events.push({ frame, midi, velocity, durationBeats, voice });
  state.lastEmitFrame = frame;
  state.crossingAccum *= 0.35;

  // Sparse second voice in FALL
  if (phase.weights.FALL > 0.4 && unitFrom(audioSeed, frame, 5) < telemetry.texture * 0.4) {
    events.push({
      frame,
      midi: midi + 7,
      velocity: velocity * 0.6,
      durationBeats: durationBeats * 1.4,
      voice: "fracture",
    });
  }

  return { events, state };
}
