/**
 * Live audio input device + AnalyserNode pipeline.
 * Primary performance input for NUMBRANE LIVE (mic / interface / loopback).
 */

import {
  analyzeFrame,
  createAnalyzerState,
  emptyFeatures,
  type AnalyzerState,
  type AudioFeatures,
} from "./audioAnalysis";

export type AudioDeviceInfo = { deviceId: string; label: string };

export type AudioInputStatus =
  | "inactive"
  | "active"
  | "denied"
  | "unavailable"
  | "lost";

export class LiveAudioInput {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private state: AnalyzerState = createAnalyzerState();
  private features: AudioFeatures = emptyFeatures();
  private timeBuf: Float32Array | null = null;
  private freqBuf: Float32Array | null = null;
  private selectedDeviceId: string | null = null;
  private deviceListener: (() => void) | null = null;
  status: AudioInputStatus = "inactive";
  statusMessage = "No audio input";
  latencyMs = 0;
  onStatusChange: ((status: AudioInputStatus, message: string) => void) | null = null;

  private emitStatus(status: AudioInputStatus, message: string): void {
    this.status = status;
    this.statusMessage = message;
    this.onStatusChange?.(status, message);
  }

  async listDevices(): Promise<AudioDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio input ${d.deviceId.slice(0, 6) || "…"}`,
      }));
  }

  getSelectedDeviceId(): string | null {
    return this.selectedDeviceId;
  }

  /** Watch device list changes (reconnect / reselection UI). */
  watchDevices(onChange: (devices: AudioDeviceInfo[]) => void): void {
    if (!navigator.mediaDevices) return;
    this.unwatchDevices();
    const handler = () => {
      void this.listDevices().then(onChange);
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    this.deviceListener = () => {
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    };
  }

  unwatchDevices(): void {
    this.deviceListener?.();
    this.deviceListener = null;
  }

  /**
   * Request permission and start analysis.
   * Pass no deviceId to use the browser default input (often the built-in mic).
   */
  async start(deviceId?: string): Promise<{ ok: boolean; error?: string }> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.emitStatus("unavailable", "No audio input");
      return { ok: false, error: "getUserMedia unavailable" };
    }
    try {
      await this.stop({ preserveStatus: true });
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = this.stream.getAudioTracks()[0];
      this.selectedDeviceId =
        deviceId || track?.getSettings().deviceId || track?.label || "default";
      track?.addEventListener("ended", () => {
        this.analyser = null;
        this.emitStatus("lost", "No audio input");
      });
      this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5;
      this.source.connect(this.analyser);
      this.timeBuf = new Float32Array(this.analyser.fftSize);
      this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      this.state = createAnalyzerState();
      this.features = emptyFeatures();
      this.latencyMs = (this.analyser.fftSize / this.ctx.sampleRate) * 1000;
      const label = track?.label || "default input";
      this.emitStatus("active", label);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.selectedDeviceId = null;
      this.emitStatus("denied", "No audio input");
      return { ok: false, error: msg };
    }
  }

  /** Try to resume the previously selected device after loss. */
  async reconnect(): Promise<{ ok: boolean; error?: string }> {
    return this.start(this.selectedDeviceId ?? undefined);
  }

  async stop(opts?: { preserveStatus?: boolean }): Promise<void> {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.timeBuf = null;
    this.freqBuf = null;
    this.features = emptyFeatures();
    if (!opts?.preserveStatus) {
      this.emitStatus("inactive", "No audio input");
    }
  }

  /** Pull latest features; safe if not started — returns neutral zeros. */
  poll(): AudioFeatures {
    if (!this.analyser || !this.ctx || !this.timeBuf || !this.freqBuf) {
      return { ...this.features };
    }
    this.analyser.getFloatTimeDomainData(this.timeBuf as Float32Array<ArrayBuffer>);
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

  /** Inject features (tests / replay). Does not require a live device. */
  inject(features: AudioFeatures): void {
    this.features = { ...features };
  }

  isActive(): boolean {
    return this.analyser != null && this.status === "active";
  }
}
