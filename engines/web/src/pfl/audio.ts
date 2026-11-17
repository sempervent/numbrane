/**
 * PFL audio engine — file, microphone, or demo (no legacy Studio).
 */

import {
  analyzeFrame,
  createAnalyzerState,
  type AnalyzerState,
  type AudioFeatures,
} from "../live/inputs/audioAnalysis";
import { demoFeaturesAt, type PflFeatures } from "./features";

export type AudioMode = "demo" | "file" | "input";

const SAMPLE_RATE = 48000;

export class PflAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private analyzerState: AnalyzerState = createAnalyzerState();
  private mode: AudioMode = "demo";
  private sensitivity = 1;
  private demoT = 0;
  private timeData = new Float32Array(2048);
  private freqData = new Float32Array(1024);
  private lastLive: PflFeatures = { energy: 0, low: 0, mid: 0, high: 0, onset: false };

  get modeId(): AudioMode {
    return this.mode;
  }

  setSensitivity(v: number): void {
    this.sensitivity = Math.max(0.2, Math.min(2.5, v));
  }

  async setMode(mode: AudioMode): Promise<void> {
    if (mode === this.mode) return;
    await this.teardownSource();
    this.mode = mode;
    if (mode === "demo") {
      this.demoT = 0;
    }
  }

  async loadFile(file: File): Promise<void> {
    await this.setMode("file");
    await this.ensureContext();
    if (!this.ctx) return;
    this.element = new Audio();
    this.element.src = URL.createObjectURL(file);
    this.element.loop = true;
    this.element.crossOrigin = "anonymous";
    await this.element.play().catch(() => {
      /* gesture may be required — user hits play */
    });
    this.source = this.ctx.createMediaElementSource(this.element);
    this.wireAnalyser();
    this.source.connect(this.analyser!);
    this.analyser!.connect(this.ctx.destination);
  }

  playFile(): void {
    void this.element?.play();
  }

  pauseFile(): void {
    this.element?.pause();
  }

  isFilePlaying(): boolean {
    return Boolean(this.element && !this.element.paused);
  }

  async startInput(deviceId?: string): Promise<void> {
    await this.setMode("input");
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    await this.ensureContext();
    if (!this.ctx || !this.stream) return;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.wireAnalyser();
    this.source.connect(this.analyser!);
    // Do not connect mic to speakers.
  }

  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    } catch {
      return [];
    }
  }

  /** Call once per animation frame with bounded dt. */
  tick(dtSec: number): PflFeatures {
    if (this.mode === "demo") {
      this.demoT += dtSec;
      return demoFeaturesAt(this.demoT, this.sensitivity);
    }
    if (!this.analyser || !this.ctx) {
      return { ...this.lastLive, energy: 0.02, low: 0, mid: 0.02, high: 0.02, onset: false };
    }
    const n = this.analyser.fftSize;
    if (this.timeData.length < n) this.timeData = new Float32Array(n);
    this.analyser.getFloatTimeDomainData(this.timeData);
    this.analyser.getFloatFrequencyData(this.freqData);
    const mags = new Float32Array(this.freqData.length);
    for (let i = 0; i < this.freqData.length; i++) {
      const db = this.freqData[i]!;
      mags[i] = db > -100 ? Math.pow(10, db / 20) : 0;
    }
    const { features } = analyzeFrame(
      this.timeData,
      mags,
      this.ctx.sampleRate,
      this.analyzerState,
    );
    const scaled = this.pickFeatures(features);
    const s = this.sensitivity;
    this.lastLive = {
      energy: Math.min(1, scaled.energy * s),
      low: Math.min(1, scaled.low * s),
      mid: Math.min(1, scaled.mid * s),
      high: Math.min(1, scaled.high * s),
      onset: scaled.onset,
    };
    return this.lastLive;
  }

  meterLevel(): number {
    return this.lastLive.energy;
  }

  dispose(): void {
    void this.teardownSource();
    void this.ctx?.close();
    this.ctx = null;
  }

  private pickFeatures(f: AudioFeatures): PflFeatures {
    return {
      energy: f.energy,
      low: f.low,
      mid: f.mid,
      high: f.high,
      onset: f.onset,
    };
  }

  private async ensureContext(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.ctx.resume().catch(() => undefined);
  }

  private wireAnalyser(): void {
    if (!this.ctx) return;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.72;
    this.analyzerState = createAnalyzerState();
    this.freqData = new Float32Array(this.analyser.frequencyBinCount);
  }

  private async teardownSource(): Promise<void> {
    try {
      this.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.source = null;
    if (this.element) {
      this.element.pause();
      URL.revokeObjectURL(this.element.src);
      this.element = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.analyser = null;
  }
}
