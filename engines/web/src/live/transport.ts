/**
 * NUMBRANE LIVE — logical transport.
 * Wall clock may advance the driver; art consumes only logical state.
 */

export type TransportSource = "internal" | "midi-clock" | "replay";

export type TransportState = {
  source: TransportSource;
  playing: boolean;
  bpm: number;
  /** Continuously increasing beat position (fractional). */
  beat: number;
  /** Bar index (0-based), assuming 4/4. */
  bar: number;
  /** Beat within bar [0, beatsPerBar). */
  beatInBar: number;
  /** Phase within current beat [0, 1). */
  beatPhase: number;
  /** MIDI-style tick accumulation (24 PPQN). */
  tick: number;
  beatsPerBar: number;
  ppqn: number;
};

const DEFAULT: TransportState = {
  source: "internal",
  playing: false,
  bpm: 120,
  beat: 0,
  bar: 0,
  beatInBar: 0,
  beatPhase: 0,
  tick: 0,
  beatsPerBar: 4,
  ppqn: 24,
};

export class Transport {
  private state: TransportState = { ...DEFAULT };
  private lastWallMs: number | null = null;
  private midiTickAccum = 0;
  private tapTimes: number[] = [];

  getSnapshot(): TransportState {
    return { ...this.state };
  }

  setSource(source: TransportSource): void {
    this.state.source = source;
    if (source !== "midi-clock") {
      this.midiTickAccum = 0;
    }
  }

  setBpm(bpm: number): void {
    this.state.bpm = Math.min(300, Math.max(20, bpm));
  }

  setBeatsPerBar(n: number): void {
    this.state.beatsPerBar = Math.max(1, Math.floor(n));
    this.recomputeDerived();
  }

  start(): void {
    this.state.playing = true;
    this.lastWallMs = null;
  }

  stop(): void {
    this.state.playing = false;
    this.lastWallMs = null;
  }

  continue(): void {
    this.state.playing = true;
    this.lastWallMs = null;
  }

  reset(): void {
    this.state.beat = 0;
    this.state.tick = 0;
    this.midiTickAccum = 0;
    this.recomputeDerived();
  }

  /** Advance from wall-clock delta when source is internal. */
  advanceWall(nowMs: number): void {
    if (!this.state.playing || this.state.source !== "internal") {
      this.lastWallMs = nowMs;
      return;
    }
    if (this.lastWallMs === null) {
      this.lastWallMs = nowMs;
      return;
    }
    const dtSec = Math.max(0, (nowMs - this.lastWallMs) / 1000);
    this.lastWallMs = nowMs;
    const beats = (this.state.bpm / 60) * dtSec;
    this.state.beat += beats;
    this.state.tick += beats * this.state.ppqn;
    this.recomputeDerived();
  }

  /** One MIDI clock pulse (24 PPQN). */
  onMidiClock(): void {
    if (this.state.source !== "midi-clock") return;
    this.midiTickAccum += 1;
    this.state.tick += 1;
    // Estimate BPM from inter-tick timing is done by caller; beat from ticks:
    this.state.beat = this.state.tick / this.state.ppqn;
    this.recomputeDerived();
  }

  /**
   * Update BPM estimate from MIDI clock intervals (seconds between clocks).
   * 24 clocks = 1 beat → bpm = 60 / (24 * interval).
   */
  estimateBpmFromClockInterval(intervalSec: number): void {
    if (intervalSec <= 0 || !Number.isFinite(intervalSec)) return;
    const bpm = 60 / (this.state.ppqn * intervalSec);
    if (bpm >= 20 && bpm <= 300) this.state.bpm = bpm;
  }

  onMidiStart(): void {
    this.setSource("midi-clock");
    this.reset();
    this.start();
  }

  onMidiContinue(): void {
    this.setSource("midi-clock");
    this.continue();
  }

  onMidiStop(): void {
    this.stop();
  }

  /** Tap tempo: call on each tap (wall ms). Returns estimated BPM or null. */
  tap(nowMs: number): number | null {
    this.tapTimes.push(nowMs);
    this.tapTimes = this.tapTimes.filter((t) => nowMs - t < 3000).slice(-6);
    if (this.tapTimes.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < this.tapTimes.length; i++) {
      intervals.push((this.tapTimes[i]! - this.tapTimes[i - 1]!) / 1000);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avg <= 0) return null;
    const bpm = 60 / avg;
    this.setBpm(bpm);
    return this.state.bpm;
  }

  /** Seek to an absolute beat (replay). */
  seekBeat(beat: number): void {
    this.state.beat = Math.max(0, beat);
    this.state.tick = this.state.beat * this.state.ppqn;
    this.recomputeDerived();
  }

  private recomputeDerived(): void {
    const bpb = this.state.beatsPerBar;
    this.state.bar = Math.floor(this.state.beat / bpb);
    this.state.beatInBar = this.state.beat - this.state.bar * bpb;
    this.state.beatPhase = this.state.beatInBar - Math.floor(this.state.beatInBar);
  }
}

export function beatsFromTransition(args: {
  bpm: number;
  duration_beats?: number;
  duration_bars?: number;
  duration_seconds?: number;
  beatsPerBar?: number;
}): number {
  const bpb = args.beatsPerBar ?? 4;
  if (args.duration_beats != null) return Math.max(0, args.duration_beats);
  if (args.duration_bars != null) return Math.max(0, args.duration_bars * bpb);
  if (args.duration_seconds != null) {
    return Math.max(0, (args.duration_seconds * args.bpm) / 60);
  }
  return 1;
}
