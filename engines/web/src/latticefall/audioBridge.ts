/**
 * Thin Tone.js bridge for LATTICEFALL.
 * Musical event *generation* is deterministic; scheduling is live-only.
 */

import * as Tone from "tone";
import type { MusicalEvent } from "./music";
import type { LatticefallTelemetry } from "./telemetry";

let ready = false;
let reverb: Tone.Reverb;
let delay: Tone.FeedbackDelay;
const synthLattice = new Tone.PolySynth(Tone.Synth);
const synthField = new Tone.PolySynth(Tone.Synth);
const synthFracture = new Tone.PolySynth(Tone.Synth);

export async function initAudio(): Promise<void> {
  await Tone.start();
  await Tone.getContext().resume();
  const limiter = new Tone.Limiter(-1).toDestination();
  reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 });
  delay = new Tone.FeedbackDelay({ delayTime: 0.22, feedback: 0.28, wet: 0.18 });
  await reverb.generate();
  const chain = delay.connect(reverb).connect(limiter);
  synthLattice.connect(chain);
  synthField.connect(chain);
  synthFracture.connect(chain);
  synthLattice.set({ oscillator: { type: "triangle" }, envelope: { attack: 0.01, release: 0.4 } });
  synthField.set({ oscillator: { type: "sine" }, envelope: { attack: 0.05, release: 0.8 } });
  synthFracture.set({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.005, release: 0.25 },
  });
  ready = true;
}

export function setBpm(bpm: number): void {
  if (!ready) return;
  Tone.Transport.bpm.value = bpm;
  if (Tone.Transport.state !== "started") Tone.Transport.start("+0.05");
}

export function setTelemetry(t: LatticefallTelemetry): void {
  if (!ready) return;
  reverb.wet.rampTo(0.15 + t.energy * 0.45, 0.2);
  delay.wet.rampTo(0.08 + t.motion * 0.35, 0.2);
  delay.feedback.rampTo(0.15 + t.texture * 0.4, 0.2);
}

export function scheduleNotes(
  events: MusicalEvent[],
  audio: { reverb: number; delay: number },
): void {
  if (!ready || !events.length) return;
  void audio;
  const now = Tone.now();
  for (const e of events) {
    const freq = Tone.Frequency(e.midi, "midi").toFrequency();
    const dur = Math.max(0.08, e.durationBeats * 0.35);
    const voice =
      e.voice === "fracture"
        ? synthFracture
        : e.voice === "field"
          ? synthField
          : synthLattice;
    voice.triggerAttackRelease(freq, dur, now + 0.01, e.velocity);
  }
}
