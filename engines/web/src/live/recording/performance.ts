/**
 * Performance recording: control + feature stream (not raw audio).
 */

import type { AudioFeatures } from "../inputs/audioAnalysis";
import type { SetDef } from "../types";

export type PerfEvent =
  | { type: "transport"; t: number; beat: number; playing: boolean; bpm: number }
  | { type: "scene"; t: number; beat: number; scene_id: string }
  | { type: "cue"; t: number; beat: number; cue_id: string }
  | { type: "midi"; t: number; beat: number; target: string; value: number }
  | { type: "param"; t: number; beat: number; path: string; value: number }
  | { type: "blackout"; t: number; beat: number; on: boolean };

export type FeatureFrame = {
  t: number;
  beat: number;
  features: AudioFeatures;
};

export type PerformanceRecording = {
  protocol_version: "0.1.0";
  seed: number;
  fps: number;
  set: SetDef;
  events: PerfEvent[];
  features: FeatureFrame[];
  started_at_beat: number;
};

export class PerformanceRecorder {
  private recording = false;
  private events: PerfEvent[] = [];
  private features: FeatureFrame[] = [];
  private set: SetDef | null = null;
  private seed = 42;
  private fps = 60;
  private startedBeat = 0;

  isRecording(): boolean {
    return this.recording;
  }

  start(set: SetDef, seed: number, fps: number, beat: number): void {
    this.recording = true;
    this.set = set;
    this.seed = seed;
    this.fps = fps;
    this.startedBeat = beat;
    this.events = [];
    this.features = [];
  }

  stop(): PerformanceRecording | null {
    if (!this.recording || !this.set) return null;
    this.recording = false;
    return {
      protocol_version: "0.1.0",
      seed: this.seed,
      fps: this.fps,
      set: this.set,
      events: [...this.events],
      features: [...this.features],
      started_at_beat: this.startedBeat,
    };
  }

  pushEvent(ev: PerfEvent): void {
    if (this.recording) this.events.push(ev);
  }

  pushFeatures(t: number, beat: number, features: AudioFeatures): void {
    if (!this.recording) return;
    // downsample: keep ~30 Hz equivalent by beat spacing ~ bpm-dependent; store every call for short clips
    this.features.push({ t, beat, features: { ...features } });
  }
}

export class PerformanceReplayer {
  private rec: PerformanceRecording;
  private eventIndex = 0;
  private featureIndex = 0;

  constructor(rec: PerformanceRecording) {
    this.rec = rec;
  }

  reset(): void {
    this.eventIndex = 0;
    this.featureIndex = 0;
  }

  eventsThrough(beat: number): PerfEvent[] {
    const out: PerfEvent[] = [];
    while (
      this.eventIndex < this.rec.events.length &&
      this.rec.events[this.eventIndex]!.beat <= beat
    ) {
      out.push(this.rec.events[this.eventIndex]!);
      this.eventIndex++;
    }
    return out;
  }

  featuresAt(beat: number): AudioFeatures | null {
    // nearest previous feature frame
    while (
      this.featureIndex + 1 < this.rec.features.length &&
      this.rec.features[this.featureIndex + 1]!.beat <= beat
    ) {
      this.featureIndex++;
    }
    const f = this.rec.features[this.featureIndex];
    return f ? { ...f.features } : null;
  }

  get recording(): PerformanceRecording {
    return this.rec;
  }
}

export function serializeRecording(rec: PerformanceRecording): string {
  return JSON.stringify(rec);
}

export function parseRecording(json: string): PerformanceRecording {
  return JSON.parse(json) as PerformanceRecording;
}
