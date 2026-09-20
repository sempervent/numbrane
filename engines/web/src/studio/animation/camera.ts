/**
 * Reusable camera/view animation — normalized coordinates, deterministic.
 */

import type {
  AnimationEasing,
  CameraAnimSpec,
  CameraMotion,
  CameraView,
  PanPreset,
  ZoomMode,
} from "./spec";
import { DEFAULT_CAMERA_VIEW, easingFn } from "./spec";

export function panPresetViews(preset: PanPreset): { start: CameraView; end: CameraView } {
  switch (preset) {
    case "right-left":
      return {
        start: { centerX: 0.22, centerY: 0, scale: 1, rotation: 0 },
        end: { centerX: -0.22, centerY: 0, scale: 1, rotation: 0 },
      };
    case "top-bottom":
      return {
        start: { centerX: 0, centerY: -0.22, scale: 1, rotation: 0 },
        end: { centerX: 0, centerY: 0.22, scale: 1, rotation: 0 },
      };
    case "bottom-top":
      return {
        start: { centerX: 0, centerY: 0.22, scale: 1, rotation: 0 },
        end: { centerX: 0, centerY: -0.22, scale: 1, rotation: 0 },
      };
    case "diag-down-right":
      return {
        start: { centerX: -0.18, centerY: -0.18, scale: 1, rotation: 0 },
        end: { centerX: 0.18, centerY: 0.18, scale: 1, rotation: 0 },
      };
    case "diag-up-left":
      return {
        start: { centerX: 0.18, centerY: 0.18, scale: 1, rotation: 0 },
        end: { centerX: -0.18, centerY: -0.18, scale: 1, rotation: 0 },
      };
    case "custom":
      return {
        start: { ...DEFAULT_CAMERA_VIEW },
        end: { ...DEFAULT_CAMERA_VIEW },
      };
    case "left-right":
    default:
      return {
        start: { centerX: -0.22, centerY: 0, scale: 1, rotation: 0 },
        end: { centerX: 0.22, centerY: 0, scale: 1, rotation: 0 },
      };
  }
}

export function applyZoomMode(
  start: CameraView,
  end: CameraView,
  mode: ZoomMode,
  anchorX: number,
  anchorY: number,
): { start: CameraView; end: CameraView } {
  if (mode === "none") return { start, end };
  const s0 = { ...start };
  const s1 = { ...end };
  if (mode === "in") {
    s0.scale = 1;
    s1.scale = 2;
  } else {
    s0.scale = 2;
    s1.scale = 1;
  }
  s0.centerX = anchorX - 0.5;
  s0.centerY = anchorY - 0.5;
  s1.centerX = anchorX - 0.5;
  s1.centerY = anchorY - 0.5;
  return { start: s0, end: s1 };
}

function resolveCameraEndpoints(spec: CameraAnimSpec): { start: CameraView; end: CameraView } {
  let { start, end } =
    spec.panPreset === "custom"
      ? { start: spec.start, end: spec.end }
      : panPresetViews(spec.panPreset);
  if (spec.zoomMode !== "none") {
    ({ start, end } = applyZoomMode(start, end, spec.zoomMode, spec.anchorX, spec.anchorY));
  }
  return { start, end };
}

/** Finite export / preview envelope — phase in [0, 1]. */
export function interpolateCamera(
  spec: CameraAnimSpec,
  phase: number,
  easing: AnimationEasing,
): CameraView {
  const { start, end } = resolveCameraEndpoints(spec);
  const t = easingFn(easing, phase);
  return {
    centerX: start.centerX + (end.centerX - start.centerX) * t,
    centerY: start.centerY + (end.centerY - start.centerY) * t,
    scale: start.scale + (end.scale - start.scale) * t,
    rotation: start.rotation + (end.rotation - start.rotation) * t,
  };
}

/**
 * Live performance camera — monotonic motion, no phase wrap.
 * `cycleSec` is one full pan/zoom span (speed control), not a restart period.
 */
export function cameraViewAtPerformanceTime(
  spec: CameraAnimSpec,
  timeSec: number,
  cycleSec: number,
  easing: AnimationEasing,
): CameraView {
  const { start, end } = resolveCameraEndpoints(spec);
  const period = Math.max(0.25, cycleSec);
  const spanX = end.centerX - start.centerX;
  const spanY = end.centerY - start.centerY;
  const spanScale = end.scale - start.scale;
  const spanRot = end.rotation - start.rotation;
  const cycles = timeSec / period;
  const whole = Math.floor(cycles);
  const frac = cycles - whole;
  const t = easingFn(easing, frac);
  const baseX = start.centerX + spanX * whole;
  const baseY = start.centerY + spanY * whole;
  const baseScale = start.scale + spanScale * whole;
  const baseRot = start.rotation + spanRot * whole;
  return {
    centerX: baseX + spanX * t,
    centerY: baseY + spanY * t,
    scale: baseScale + spanScale * t,
    rotation: baseRot + spanRot * t,
  };
}

/** Bounded source resolution for camera moves (avoid blind 16K). */
export function cameraSourceResolution(
  outW: number,
  outH: number,
  spec: CameraAnimSpec,
  motion: CameraMotion,
  quality = 1,
): { width: number; height: number } {
  const maxScale = Math.max(spec.start.scale, spec.end.scale, 1);
  const travelX = Math.abs(spec.end.centerX - spec.start.centerX);
  const travelY = Math.abs(spec.end.centerY - spec.start.centerY);
  const pad = 0.15 + Math.max(travelX, travelY);
  const mul = Math.min(3, maxScale * (1 + pad)) * Math.max(0.75, quality);
  return {
    width: Math.min(4096, Math.max(outW, Math.ceil(outW * mul))),
    height: Math.min(4096, Math.max(outH, Math.ceil(outH * mul))),
  };
}

export function cameraMotionLabel(m: CameraMotion): string {
  switch (m) {
    case "pan":
      return "Pan";
    case "zoom":
      return "Zoom";
    case "pan-zoom":
      return "Pan + Zoom";
    case "orbit":
      return "Orbit";
    default:
      return "None";
  }
}
