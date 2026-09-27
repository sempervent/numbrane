/**
 * Detect unexpected visual stalls while transport is playing in Animate/React.
 */

export type VisualLivenessStatus =
  | "evolving"
  | "intentionally-paused"
  | "stalled"
  | "recovering";

export type VisualLivenessSnapshot = {
  status: VisualLivenessStatus;
  secondsSinceMeaningfulChange: number;
  digestChanges: number;
  lastDigest: string;
  stallReason: string;
};

const STALL_WINDOW_SEC = 4.5;
const MIN_WARMUP_SEC = 2.5;

export class VisualLivenessWatchdog {
  private lastDigest = "";
  private lastChangePerfMs = 0;
  private lastAnimationTimeSec = 0;
  private digestChanges = 0;
  private warmedUp = false;
  private stallReason = "";
  private recoveringUntilMs = 0;

  reset(digest: string, nowPerfMs: number): void {
    this.lastDigest = digest;
    this.lastChangePerfMs = nowPerfMs;
    this.lastAnimationTimeSec = 0;
    this.digestChanges = 0;
    this.warmedUp = false;
    this.stallReason = "";
    this.recoveringUntilMs = 0;
  }

  /** Slow-evolving visuals may keep the same digest while animation time still advances. */
  noteAnimationAdvance(animationTimeSec: number, nowPerfMs: number, playing: boolean): void {
    if (!playing) return;
    if (animationTimeSec > this.lastAnimationTimeSec + 0.04) {
      this.lastAnimationTimeSec = animationTimeSec;
      this.lastChangePerfMs = nowPerfMs;
      this.stallReason = "";
    }
  }

  noteDigest(digest: string, nowPerfMs: number, playing: boolean, paused: boolean): void {
    if (!playing || paused) {
      this.stallReason = "";
      return;
    }
    if (!this.warmedUp) {
      this.warmedUp = true;
      this.lastChangePerfMs = nowPerfMs;
      this.lastDigest = digest;
      return;
    }
    if (digest && digest !== this.lastDigest) {
      this.lastDigest = digest;
      this.lastChangePerfMs = nowPerfMs;
      this.digestChanges += 1;
      this.stallReason = "";
      if (nowPerfMs >= this.recoveringUntilMs) {
        this.recoveringUntilMs = 0;
      }
    }
  }

  markRecovering(nowPerfMs: number): void {
    this.recoveringUntilMs = nowPerfMs + 1500;
    this.stallReason = "";
    this.lastChangePerfMs = nowPerfMs;
  }

  snapshot(
    nowPerfMs: number,
    playing: boolean,
    paused: boolean,
    animationTimeSec: number,
    startedAtPerfMs: number,
  ): VisualLivenessSnapshot {
    const warmupSec = (nowPerfMs - startedAtPerfMs) / 1000;
    if (!playing || paused) {
      return {
        status: "intentionally-paused",
        secondsSinceMeaningfulChange: 0,
        digestChanges: this.digestChanges,
        lastDigest: this.lastDigest,
        stallReason: "",
      };
    }
    if (nowPerfMs < this.recoveringUntilMs) {
      return {
        status: "recovering",
        secondsSinceMeaningfulChange: (nowPerfMs - this.lastChangePerfMs) / 1000,
        digestChanges: this.digestChanges,
        lastDigest: this.lastDigest,
        stallReason: this.stallReason,
      };
    }
    const sinceChange = (nowPerfMs - this.lastChangePerfMs) / 1000;
    if (warmupSec < MIN_WARMUP_SEC || animationTimeSec < 0.5) {
      return {
        status: "evolving",
        secondsSinceMeaningfulChange: sinceChange,
        digestChanges: this.digestChanges,
        lastDigest: this.lastDigest,
        stallReason: "",
      };
    }
    if (sinceChange >= STALL_WINDOW_SEC) {
      if (!this.stallReason) {
        this.stallReason = `pixel digest unchanged for ${sinceChange.toFixed(1)}s while playing`;
      }
      return {
        status: "stalled",
        secondsSinceMeaningfulChange: sinceChange,
        digestChanges: this.digestChanges,
        lastDigest: this.lastDigest,
        stallReason: this.stallReason,
      };
    }
    return {
      status: "evolving",
      secondsSinceMeaningfulChange: sinceChange,
      digestChanges: this.digestChanges,
      lastDigest: this.lastDigest,
      stallReason: "",
    };
  }
}
