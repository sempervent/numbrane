/** Tone.js audio mapping. */
import * as Tone from "tone";
import { useStore } from "./state";
import type { VisualTelemetry } from "./visual";

const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
const SCALE_AMBIENT = [0, 2, 4, 7, 9];
const SCALE_ATONAL = [0, 1, 3, 6, 7, 9, 10];

function scaleFor(mode: string) {
  switch (mode) {
    case "major":
      return SCALE_MAJOR;
    case "minor":
      return SCALE_MINOR;
    case "ambient":
      return SCALE_AMBIENT;
    case "atonal":
      return SCALE_ATONAL;
    default:
      return SCALE_AMBIENT;
  }
}

let limiter: Tone.Limiter;
let reverb: Tone.Reverb;
let delay: Tone.FeedbackDelay;

const synthA = new Tone.PolySynth(Tone.Synth);
const synthB = new Tone.PolySynth(Tone.Synth);

let currentTelemetry: VisualTelemetry = {
  energy: 0,
  texture: 0,
  motion: 0,
  spectral: 0,
};
const telemetrySmoothing = 0.92;

function hueToWave(hue: number): OscillatorType {
  const k = Math.floor((hue % 360) / 90);
  return (["sine", "triangle", "sawtooth", "square"] as OscillatorType[])[k];
}

export async function initAudio() {
  await Tone.start();
  await Tone.getContext().resume();

  if (!limiter) {
    limiter = new Tone.Limiter(-1).toDestination();
    reverb = new Tone.Reverb({ decay: 3.2, wet: 0.25 });
    delay = new Tone.FeedbackDelay({ delayTime: 0.23, feedback: 0.35, wet: 0.2 });
    synthA.chain(reverb, delay, limiter);
    synthB.chain(reverb, delay, limiter);
  }

  synthA.set({
    volume: -3,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.8 },
  });
  synthB.set({
    volume: -5,
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.005, decay: 0.06, sustain: 0.5, release: 1.4 },
  });

  const s = useStore.getState();
  Tone.Transport.bpm.value = s.bpm;
  if (!Tone.Transport.state || Tone.Transport.state !== "started") {
    Tone.Transport.start("+0.05");
  }
}

export function updateTempo(bpm: number) {
  Tone.Transport.bpm.rampTo(bpm, 0.25);
}

export function setTelemetry(telemetry: VisualTelemetry) {
  currentTelemetry.energy =
    currentTelemetry.energy * telemetrySmoothing + telemetry.energy * (1 - telemetrySmoothing);
  currentTelemetry.texture =
    currentTelemetry.texture * telemetrySmoothing + telemetry.texture * (1 - telemetrySmoothing);
  currentTelemetry.motion =
    currentTelemetry.motion * telemetrySmoothing + telemetry.motion * (1 - telemetrySmoothing);
  currentTelemetry.spectral =
    currentTelemetry.spectral * telemetrySmoothing +
    telemetry.spectral * (1 - telemetrySmoothing);

  updateAudioFromTelemetry();
}

function updateAudioFromTelemetry() {
  if (!reverb || !delay) return;

  reverb.wet.value = 0.1 + currentTelemetry.energy * 0.4;
  Tone.Transport.swing = currentTelemetry.motion * 0.25;

  const detuneAmount = (currentTelemetry.spectral - 0.5) * 12;
  synthA.set({ detune: detuneAmount });
  synthB.set({ detune: -detuneAmount });
}

export function scheduleFromNodes(
  nodes: ReturnType<typeof useStore.getState>["nodes"],
  params: { harmony: string; chaos: number },
) {
  void params.chaos;
  if (!Tone.getContext().state || Tone.getContext().state !== "running") {
    return;
  }

  const scale = scaleFor(params.harmony);
  const now = Tone.now();

  if (nodes.length === 0) return;

  nodes.forEach((n, i) => {
    const px = Math.min(0.999, Math.max(0, n.x));
    const py = Math.min(0.999, Math.max(0, n.y));
    const degree = Math.floor(px * scale.length) % scale.length;

    const base = 48;
    const reg = Math.floor(py * 24);
    const midi = base + scale[degree] + reg;

    const vel = Math.min(1, Math.max(0.25, 1 - py * 0.8));
    const dur = 0.12 + n.size * 1.8;
    const t = now + (i % 4) * 0.05;

    const wave = hueToWave(n.hue);
    if ((i & 1) === 0) synthA.set({ oscillator: { type: wave } });
    else synthB.set({ oscillator: { type: wave } });

    const voice = i % 2 === 0 ? synthA : synthB;
    voice.triggerAttackRelease(Tone.Frequency(midi, "midi").toFrequency(), dur, t, vel);
  });
}
