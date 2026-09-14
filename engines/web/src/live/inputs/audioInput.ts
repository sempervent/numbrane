/**
 * Live audio input device + AnalyserNode pipeline.
 */

import {
  analyzeFrame,
  createAnalyzerState,
  emptyFeatures,
  type AnalyzerState,
  type AudioFeatures,
} from "./audioAnalysis";

export type AudioDeviceInfo = { deviceId: string; label: string };

export class LiveAudioInput {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private state: AnalyzerState = createAnalyzerState();
  private features: AudioFeatures = emptyFeatures();
  private timeBuf: Float32Array | null = null;
  private freqBuf: Float32Array | null = null;
  private startedAt = 0;
  latencyMs = 0;

  async listDevices(): Promise<AudioDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio input ${d.deviceId.slice(0, 6)}`,
      }));
  }

  async start(deviceId?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.stop();
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false }
          : { echoCancellation: false, noiseSuppression: false },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5;
      this.source.connect(this.analyser);
      this.timeBuf = new Float32Array(this.analyser.fftSize);
      this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      this.state = createAnalyzerState();
      this.startedAt = performance.now();
      // Analysis window latency approximation
      this.latencyMs = (this.analyser.fftSize / this.ctx.sampleRate) * 1000;
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async stop(): Promise<void> {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }

  /** Pull latest features; safe if not started. */
  poll(): AudioFeatures {
    if (!this.analyser || !this.ctx || !this.timeBuf || !this.freqBuf) {
      return this.features;
    }
    this.analyser.getFloatTimeDomainData(this.timeBuf as Float32Array<ArrayBuffer>);
    // getFloatFrequencyData is dB; convert to linear-ish magnitudes
    const db = new Float32Array(this.freqBuf.length);
    this.analyser.getFloatFrequencyData(db as Float32Array<ArrayBuffer>);
    for (let i = 0; i < db.length; i++) {
      this.freqBuf[i] = Math.pow(10, db[i]! / 20);
    }
    const { features, state } = analyzeFrame(
      this.timeBuf,
      this.freqBuf,
      this.ctx.sampleRate,
      this.state,
    );
    this.state = state;
    this.features = features;
    return features;
  }

  getFeatures(): AudioFeatures {
    return { ...this.features };
  }

  /** Inject features (tests / replay). */
  inject(features: AudioFeatures): void {
    this.features = { ...features };
  }

  isActive(): boolean {
    return this.analyser != null;
  }
}
