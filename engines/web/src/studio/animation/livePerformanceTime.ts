/**
 * Live performance clock vs finite export timeline.
 * Performance time is unbounded; cycle/construction phases repeat or plateau — never terminal freeze.
 */

import {
  animationPhase,
  constructionProgress,
  hasComponent,
  type AnimationSpec,
} from "./spec";

export function positiveModulo(n: number, m: number): number {
  if (m <= 0) return 0;
  return ((n % m) + m) % m;
}

/** Cycle length for repeating live motion (durationSec=0 uses a sensible default period). */
export function performanceCycleDurationSec(spec: AnimationSpec): number {
  if (spec.durationSec > 0) return Math.max(0.25, spec.durationSec);
  if (spec.motion === "drift") return 16;
  if (hasComponent(spec, "construction")) return 8;
  return 8;
}

export type LivePerformanceTime = {
  performanceTimeSec: number;
  cycleSec: number;
  /** Repeating 0..1 phase for live arcs, parameters, and anim.phase in performance mode. */
  cyclePhase: number;
  /** Finite export envelope phase — only meaningful when not in performance mode. */
  exportPhase: number;
  /** Construction progress: one-shot 0→1 then holds at 1 in performance mode. */
  constructionPhase: number;
};

export function livePerformanceTimeAt(
  performanceTimeSec: number,
  spec: AnimationSpec,
  performanceMode: boolean,
): LivePerformanceTime {
  const cycleSec = performanceCycleDurationSec(spec);
  if (!performanceMode) {
    const exportPhase = animationPhase(
      performanceTimeSec,
      spec.durationSec,
      spec.endBehavior,
    );
    return {
      performanceTimeSec,
      cycleSec,
      cyclePhase: exportPhase,
      exportPhase,
      constructionPhase: constructionProgress(exportPhase, spec.endBehavior),
    };
  }

  const t = Math.max(0, performanceTimeSec);
  let cyclePhase: number;
  switch (spec.endBehavior) {
    case "ping-pong": {
      const u = t / cycleSec;
      const c = u % 2;
      cyclePhase = c <= 1 ? c : 2 - c;
      break;
    }
    case "loop":
      cyclePhase = positiveModulo(t, cycleSec) / cycleSec;
      break;
    default:
      cyclePhase = positiveModulo(t, cycleSec) / cycleSec;
      break;
  }

  let constructionPhase: number;
  if (hasComponent(spec, "construction")) {
    constructionPhase = Math.min(1, t / cycleSec);
  } else {
    constructionPhase = constructionProgress(cyclePhase, "loop");
  }

  return {
    performanceTimeSec: t,
    cycleSec,
    cyclePhase,
    exportPhase: cyclePhase,
    constructionPhase,
  };
}
