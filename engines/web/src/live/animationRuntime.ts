/**
 * Live session animation semantics — timeline, camera, construction, freeze rules.
 */

import { cameraViewAtPerformanceTime, interpolateCamera } from "../studio/animation/camera";
import { livePerformanceTimeAt, performanceCycleDurationSec } from "../studio/animation/livePerformanceTime";
import { hasComponent, type AnimationSpec, type CameraView } from "../studio/animation/spec";
import { ANIM_ARCS } from "../studio/presets";
import type { LivePiece } from "./piece";

export type AnimationRuntimeState = {
  animationTimeSec: number;
  /** Repeating live phase (performance) or export envelope phase. */
  phase: number;
  cyclePhase: number;
  constructionT: number;
  performanceTimeSec: number;
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
    const live = livePerformanceTimeAt(this.timeSec, this.spec, this.performanceMode);
    const phase = this.performanceMode ? live.cyclePhase : live.exportPhase;
    const constructionT = live.constructionPhase;
    const cameraActive = hasComponent(this.spec, "camera");
    const generativeActive = hasComponent(this.spec, "generative");
    const cycleSec = performanceCycleDurationSec(this.spec);
    const camera =
      cameraActive && this.spec.camera.motion !== "none"
        ? this.performanceMode
          ? cameraViewAtPerformanceTime(
              this.spec.camera,
              this.timeSec,
              cycleSec,
              this.spec.easing,
            )
          : interpolateCamera(this.spec.camera, live.exportPhase, this.spec.easing)
        : { centerX: 0, centerY: 0, scale: 1, rotation: 0 };
    const freezeGenerative = cameraActive && !generativeActive && !this.performanceMode;
    const useSourceSnapshot = freezeGenerative && this.snapshotReady;
    return {
      animationTimeSec: this.timeSec,
      phase,
      cyclePhase: live.cyclePhase,
      constructionT,
      performanceTimeSec: live.performanceTimeSec,
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
      piece.setParameter("anim.cyclePhase", st.cyclePhase);
      piece.setParameter("anim.constructionT", st.constructionT);
      piece.setParameter("anim.endBehavior", endBehaviorCode(this.spec.endBehavior));
      piece.setParameter("anim.timeSec", st.animationTimeSec);
      piece.setParameter("anim.performanceTimeSec", st.performanceTimeSec);
      piece.setParameter("anim.livePerformance", this.performanceMode ? 1 : 0);

      if (hasComponent(this.spec, "parameters")) {
        const arc = ANIM_ARCS.find((a) => a.id === this.spec.motion);
        const base = piece.getBaseParameters();
        if (arc) {
          const arcPhase = this.performanceMode ? st.cyclePhase : st.phase;
          const next = arc.apply({ ...base }, arcPhase);
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
