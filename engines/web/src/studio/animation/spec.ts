/**
 * Studio ANIMATE semantics — source, motion, duration, end behavior, and easing
 * are independent. End behavior must not be encoded in motion/arc names.
 */

export type AnimationSource =
  | "generative"
  | "camera"
  | "construction"
  | "parameters"
  | "composite";

export type AnimationEndBehavior =
  | "continuous"
  | "hold"
  | "loop"
  | "ping-pong"
  | "restart"
  | "stop";

export type AnimationEasing = "linear" | "ease-in-out" | "ease-in" | "ease-out";

export type CameraMotion = "pan" | "zoom" | "pan-zoom" | "orbit" | "none";

export type PanPreset =
  | "left-right"
  | "right-left"
  | "top-bottom"
  | "bottom-top"
  | "diag-down-right"
  | "diag-up-left"
  | "custom";

export type ZoomMode = "in" | "out" | "none";

export type CameraView = {
  centerX: number;
  centerY: number;
  scale: number;
  rotation: number;
};

export type CameraAnimSpec = {
  motion: CameraMotion;
  panPreset: PanPreset;
  zoomMode: ZoomMode;
  start: CameraView;
  end: CameraView;
  anchorX: number;
  anchorY: number;
};

export type AnimationSpec = {
  /** Primary source; composite uses `components`. */
  source: AnimationSource;
  /** Active when source is composite. */
  components: Array<"generative" | "camera" | "construction" | "parameters">;
  /** Motion id — piece-specific or camera/parameter track id. */
  motion: string;
  durationSec: number;
  endBehavior: AnimationEndBehavior;
  easing: AnimationEasing;
  camera: CameraAnimSpec;
};

export const DEFAULT_CAMERA_VIEW: CameraView = {
  centerX: 0,
  centerY: 0,
  scale: 1,
  rotation: 0,
};

export const DEFAULT_CAMERA_SPEC: CameraAnimSpec = {
  motion: "pan",
  panPreset: "left-right",
  zoomMode: "none",
  start: { centerX: -0.22, centerY: 0, scale: 1, rotation: 0 },
  end: { centerX: 0.22, centerY: 0, scale: 1, rotation: 0 },
  anchorX: 0.5,
  anchorY: 0.5,
};

export function defaultAnimationSpec(): AnimationSpec {
  return {
    source: "generative",
    components: ["generative"],
    motion: "continuous",
    durationSec: 12,
    endBehavior: "continuous",
    easing: "linear",
    camera: { ...DEFAULT_CAMERA_SPEC },
  };
}

export function easingFn(easing: AnimationEasing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "ease-in":
      return x * x;
    case "ease-out":
      return x * (2 - x);
    case "ease-in-out":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    default:
      return x;
  }
}

/** Envelope phase in [0,1] from monotonic animation time — never modulo unconditionally. */
export function animationPhase(
  animationTimeSec: number,
  durationSec: number,
  endBehavior: AnimationEndBehavior,
): number {
  if (durationSec <= 0) return 0;
  const u = animationTimeSec / durationSec;
  switch (endBehavior) {
    case "continuous":
    case "hold":
    case "stop":
    case "restart":
      return Math.min(1, Math.max(0, u));
    case "loop":
      return u - Math.floor(u);
    case "ping-pong": {
      const c = u % 2;
      return c <= 1 ? c : 2 - c;
    }
    default:
      return Math.min(1, Math.max(0, u));
  }
}

/** Construction / finite arc progress derived from envelope phase. */
export function constructionProgress(
  phase: number,
  endBehavior: AnimationEndBehavior,
): number {
  if (endBehavior === "ping-pong") return phase;
  if (endBehavior === "loop") return phase;
  return Math.min(1, Math.max(0, phase));
}

export function hasComponent(
  spec: AnimationSpec,
  c: "generative" | "camera" | "construction" | "parameters",
): boolean {
  if (spec.source === "composite") return spec.components.includes(c);
  if (spec.source === c) return true;
  return false;
}

export function exportLoopFlag(endBehavior: AnimationEndBehavior): boolean {
  return endBehavior === "loop" || endBehavior === "ping-pong";
}
