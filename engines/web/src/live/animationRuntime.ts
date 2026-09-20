/**
 * Live session animation semantics — timeline, camera, construction, freeze rules.
 */

import { cameraViewAtPerformanceTime, interpolateCamera } from "../studio/animation/camera";
import {
  animationPhase,
  constructionProgress,
  hasComponent,
  type AnimationSpec,
  type CameraView,
} from "../studio/animation/spec";
import { ANIM_ARCS } from "../studio/presets";
import type { LivePiece } from "./piece";

export type AnimationRuntimeState = {
  animationTimeSec: number;
  phase: number;
  constructionT: number;
  camera: CameraView;
  freezeGenerative: boolean;
  useSourceSnapshot: boolean;
  sourceDigest: string;
  stopped: boolean;
};

export class AnimationRuntime {
  spec: AnimationSpec;
  /** Unbounded live performance — ignore export duration/stop semantics. */
  performanceMode = false;
  private timeSec = 0;
  private sourceDigest = "";
  private snapshotReady = false;
  private stopped = false;

  constructor(spec: AnimationSpec) {
    this.spec = spec;
  }

  setSpec(spec: AnimationSpec): void {
    this.spec = spec;
    this.snapshotReady = false;
    this.stopped = false;
  }

  reset(): void {
    this.timeSec = 0;
    this.snapshotReady = false;
    this.stopped = false;
    this.sourceDigest = "";
  }

  seekTime(sec: number): void {
    this.timeSec = Math.max(0, sec);
    this.stopped = false;
  }

  get animationTimeSec(): number {
    return this.timeSec;
  }

  tick(dt: number, playing: boolean): void {
    if (!playing || this.stopped) return;
    this.timeSec += dt;
    if (this.performanceMode) return;
    const { durationSec, endBehavior } = this.spec;
    if (endBehavior === "stop" && durationSec > 0 && this.timeSec >= durationSec) {
      this.stopped = true;
      this.timeSec = durationSec;
    }
    if (endBehavior === "restart" && durationSec > 0 && this.timeSec >= durationSec) {
      this.timeSec = 0;
      this.snapshotReady = false;
      this.sourceDigest = "";
    }
  }

  evaluate(): AnimationRuntimeState {
    const phase = this.performanceMode
      ? Math.min(1, Math.max(0, this.timeSec / Math.max(0.25, this.spec.durationSec || 8)))
      : animationPhase(this.timeSec, this.spec.durationSec, this.spec.endBehavior);
    const constructionT = constructionProgress(phase, this.spec.endBehavior);
    const cameraActive = hasComponent(this.spec, "camera");
    const generativeActive = hasComponent(this.spec, "generative");
    const cycleSec = this.spec.durationSec > 0 ? this.spec.durationSec : 8;
    const camera =
      cameraActive && this.spec.camera.motion !== "none"
        ? this.performanceMode
          ? cameraViewAtPerformanceTime(
              this.spec.camera,
              this.timeSec,
              cycleSec,
              this.spec.easing,
            )
          : interpolateCamera(this.spec.camera, phase, this.spec.easing)
        : { centerX: 0, centerY: 0, scale: 1, rotation: 0 };
    const freezeGenerative = cameraActive && !generativeActive && !this.performanceMode;
    const useSourceSnapshot = freezeGenerative && this.snapshotReady;
    return {
      animationTimeSec: this.timeSec,
      phase,
      constructionT,
      camera,
      freezeGenerative,
      useSourceSnapshot,
      sourceDigest: this.sourceDigest,
      stopped: this.stopped,
    };
  }

  markSnapshotReady(digest: string): void {
    this.snapshotReady = true;
    if (!this.sourceDigest) this.sourceDigest = digest;
  }

  noteSourceDigest(digest: string): void {
    if (!this.sourceDigest) this.sourceDigest = digest;
  }

  applyToPiece(piece: LivePiece, _baseParams: Map<string, Record<string, number>>): void {
    this.applyToPieces([piece], _baseParams);
  }

  applyToPieces(pieces: Iterable<LivePiece>, _baseParams: Map<string, Record<string, number>>): void {
    const st = this.evaluate();
    for (const piece of pieces) {
      piece.setParameter("anim.phase", st.phase);
      piece.setParameter("anim.constructionT", st.constructionT);
      piece.setParameter("anim.endBehavior", endBehaviorCode(this.spec.endBehavior));
      piece.setParameter("anim.timeSec", st.animationTimeSec);

      if (hasComponent(this.spec, "parameters")) {
        const arc = ANIM_ARCS.find((a) => a.id === this.spec.motion);
        const base = piece.getBaseParameters();
        if (arc) {
          const next = arc.apply({ ...base }, st.phase);
          for (const [k, v] of Object.entries(next)) {
            if (typeof v === "number") piece.setParameter(k, v);
          }
        }
      }
    }
  }
}

function endBehaviorCode(b: AnimationSpec["endBehavior"]): number {
  switch (b) {
    case "hold":
      return 0;
    case "loop":
      return 1;
    case "ping-pong":
      return 2;
    case "restart":
      return 3;
    case "stop":
      return 4;
    default:
      return 5; // continuous
  }
}
