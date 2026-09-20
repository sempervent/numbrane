/**
 * Resolved animation methods per piece — universal camera + native methods.
 */

import type { AnimationEndBehavior, AnimationSource, AnimationSpec, PanPreset } from "./spec";
import { defaultAnimationSpec } from "./spec";
import { panPresetViews } from "./camera";
import { animationCapabilitiesFor } from "./capabilities";

export type AnimationMethodCategory = "camera" | "native" | "random";

export type AnimationMethod = {
  id: string;
  label: string;
  category: AnimationMethodCategory;
  source: AnimationSource;
  compatibleWith(pieceId: string): boolean;
  defaultDuration: number;
  defaultEndBehavior: AnimationEndBehavior;
  apply(pieceId: string): AnimationSpec;
};

const CAMERA_BASELINE: Omit<AnimationMethod, "id" | "label" | "apply"> & {
  apply: (pieceId: string, panPreset: PanPreset, motion: string, zoomMode?: "in" | "out" | "none") => AnimationSpec;
} = {
  category: "camera",
  source: "camera",
  compatibleWith: () => true,
  defaultDuration: 8,
  defaultEndBehavior: "hold",
  apply: (pieceId, panPreset, motion, zoomMode = "none") => {
    const spec = defaultAnimationSpec();
    spec.source = "camera";
    spec.components = ["camera"];
    spec.motion = motion;
    spec.durationSec = 8;
    spec.endBehavior = motion === "drift" ? "continuous" : "hold";
    spec.camera.motion =
      motion === "pan-zoom" ? "pan-zoom" : motion === "zoom" ? "zoom" : motion === "drift" ? "pan" : "pan";
    spec.camera.panPreset = panPreset;
    spec.camera.zoomMode = zoomMode;
    const views = panPresetViews(panPreset);
    spec.camera.start = views.start;
    spec.camera.end = views.end;
    if (motion === "drift") {
      spec.endBehavior = "continuous";
      spec.durationSec = 16;
    }
    if (motion === "zoom") {
      spec.camera.zoomMode = zoomMode === "out" ? "out" : "in";
    }
    return spec;
  },
};

function cameraMethod(
  id: string,
  label: string,
  panPreset: PanPreset,
  motion: string,
  zoomMode: "in" | "out" | "none" = "none",
): AnimationMethod {
  return {
    id,
    label,
    category: "camera",
    source: "camera",
    compatibleWith: () => true,
    defaultDuration: motion === "drift" ? 16 : 8,
    defaultEndBehavior: motion === "drift" ? "continuous" : "hold",
    apply: (pieceId) => CAMERA_BASELINE.apply(pieceId, panPreset, motion, zoomMode),
  };
}

const UNIVERSAL_CAMERA: AnimationMethod[] = [
  cameraMethod("pan-left-right", "Pan Left → Right", "left-right", "pan"),
  cameraMethod("pan-right-left", "Pan Right → Left", "right-left", "pan"),
  cameraMethod("pan-top-bottom", "Pan Top → Bottom", "top-bottom", "pan"),
  cameraMethod("pan-bottom-top", "Pan Bottom → Top", "bottom-top", "pan"),
  cameraMethod("pan-diagonal", "Pan Diagonal", "diag-down-right", "pan"),
  cameraMethod("zoom-in", "Zoom In", "left-right", "zoom", "in"),
  cameraMethod("zoom-out", "Zoom Out", "left-right", "zoom", "out"),
  cameraMethod("pan-zoom", "Pan + Zoom", "left-right", "pan-zoom"),
  cameraMethod("slow-drift", "Slow Drift", "diag-down-right", "drift"),
];

function nativeMethod(
  id: string,
  label: string,
  source: AnimationSource,
  motion: string,
  endBehavior: AnimationEndBehavior = "continuous",
  duration = 12,
  match: (pieceId: string) => boolean,
): AnimationMethod {
  return {
    id,
    label,
    category: "native",
    source,
    compatibleWith: match,
    defaultDuration: duration,
    defaultEndBehavior: endBehavior,
    apply: () => {
      const spec = defaultAnimationSpec();
      spec.source = source;
      spec.motion = motion;
      spec.durationSec = duration;
      spec.endBehavior = endBehavior;
      spec.components =
        source === "construction"
          ? ["construction"]
          : source === "generative"
            ? ["generative"]
            : source === "parameters"
              ? ["parameters"]
              : ["generative"];
      return spec;
    },
  };
}

const PARAMETER_DRIFT: AnimationMethod = {
  id: "parameter-drift",
  label: "Parameter Drift",
  category: "native",
  source: "composite",
  compatibleWith: (p) => p.includes("fractal") || p.includes("escape") || p.includes("sdf"),
  defaultDuration: 12,
  defaultEndBehavior: "continuous",
  apply: () => {
    const spec = defaultAnimationSpec();
    spec.source = "composite";
    spec.components = ["generative", "parameters"];
    spec.motion = "drift";
    spec.durationSec = 12;
    spec.endBehavior = "continuous";
    return spec;
  },
};

const NATIVE_METHODS: AnimationMethod[] = [
  nativeMethod("continuous-evolution", "Continuous Evolution", "generative", "continuous", "continuous", 12, (p) =>
    p.includes("reaction-diffusion"),
  ),
  nativeMethod("trail-growth", "Trail Growth", "generative", "emergence", "continuous", 12, (p) =>
    p.includes("slime"),
  ),
  nativeMethod("flow", "Flow", "generative", "continuous", "continuous", 12, (p) => p.includes("noodle")),
  nativeMethod("native-evolution", "Native Evolution", "generative", "continuous", "continuous", 12, (p) =>
    p === "flagship/latticefall",
  ),
  nativeMethod("construction", "Construction", "construction", "construction", "hold", 8, (p) =>
    p.startsWith("geometry/") || p.includes("lsystem") || p.includes("ritual"),
  ),
  nativeMethod("deconstruction", "Deconstruction", "construction", "reveal", "hold", 8, (p) =>
    p.startsWith("geometry/"),
  ),
  nativeMethod("composite-evolution", "Composite Evolution", "generative", "continuous", "continuous", 12, (p) =>
    p.startsWith("mashups/"),
  ),
  nativeMethod("plasma-evolution", "Plasma Evolution", "generative", "continuous", "continuous", 0, (p) =>
    p === "audiovisual/nodes" || p === "reference/audiovisual-nodes",
  ),
  PARAMETER_DRIFT,
];

export const RANDOM_METHOD_ID = "random";

export function allAnimationMethods(): AnimationMethod[] {
  return [...UNIVERSAL_CAMERA, ...NATIVE_METHODS];
}

export function animationMethodsForPiece(pieceId: string): AnimationMethod[] {
  const caps = animationCapabilitiesFor(pieceId);
  const native = NATIVE_METHODS.filter((m) => m.compatibleWith(pieceId));
  const camera = UNIVERSAL_CAMERA.filter((m) => caps.sources.includes("camera") || true);
  return [...camera, ...native];
}

export function getAnimationMethod(pieceId: string, methodId: string): AnimationMethod | undefined {
  if (methodId === RANDOM_METHOD_ID) return undefined;
  return animationMethodsForPiece(pieceId).find((m) => m.id === methodId);
}

export function defaultAnimationMethodId(pieceId: string): string {
  const methods = animationMethodsForPiece(pieceId);
  const native = methods.find((m) => m.category === "native");
  return native?.id ?? "pan-left-right";
}

export function applyAnimationMethod(pieceId: string, methodId: string): AnimationSpec {
  const method = getAnimationMethod(pieceId, methodId);
  if (!method) return defaultAnimationSpec();
  return method.apply(pieceId);
}

export function methodCountForPiece(pieceId: string): number {
  return animationMethodsForPiece(pieceId).length;
}
