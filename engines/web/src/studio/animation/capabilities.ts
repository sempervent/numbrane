/**
 * Piece-specific ANIMATE capabilities — filter meaningless UI choices.
 */

import type { AnimationSource, AnimationSpec } from "./spec";
import { defaultAnimationSpec } from "./spec";

export type PieceAnimationCapabilities = {
  sources: AnimationSource[];
  motions: string[];
  defaultSource: AnimationSource;
  defaultMotion: string;
  defaultEndBehavior: AnimationSpec["endBehavior"];
};

function caps(
  sources: AnimationSource[],
  motions: string[],
  defaults: Partial<PieceAnimationCapabilities> = {},
): PieceAnimationCapabilities {
  return {
    sources,
    motions,
    defaultSource: defaults.defaultSource ?? sources[0] ?? "generative",
    defaultMotion: defaults.defaultMotion ?? motions[0] ?? "continuous",
    defaultEndBehavior: defaults.defaultEndBehavior ?? "continuous",
  };
}

const GENERATIVE_SIM = caps(
  ["generative", "camera", "composite"],
  ["continuous", "drift", "emergence"],
  { defaultEndBehavior: "continuous" },
);

const CONSTRUCTION = caps(
  ["construction", "camera", "composite"],
  ["construction", "emergence", "reveal"],
  { defaultSource: "construction", defaultMotion: "construction", defaultEndBehavior: "hold" },
);

const STATIC_CAMERA = caps(
  ["camera", "parameters"],
  ["pan", "zoom", "pan-zoom"],
  { defaultSource: "camera", defaultMotion: "pan", defaultEndBehavior: "hold" },
);

const SHADER_CAMERA = caps(
  ["generative", "camera", "parameters", "composite"],
  ["continuous", "drift", "pan", "zoom", "pan-zoom"],
  { defaultEndBehavior: "continuous" },
);

export function animationCapabilitiesFor(pieceId: string): PieceAnimationCapabilities {
  if (pieceId.includes("audiovisual") || pieceId.includes("nodes")) {
    return GENERATIVE_SIM;
  }
  if (pieceId.includes("reaction-diffusion") || pieceId.includes("slime") || pieceId.includes("noodle")) {
    return GENERATIVE_SIM;
  }
  if (pieceId.includes("differential-growth")) return GENERATIVE_SIM;
  if (pieceId === "flagship/latticefall") return GENERATIVE_SIM;
  if (pieceId.startsWith("geometry/") || pieceId === "growth/lsystem") return CONSTRUCTION;
  if (pieceId.includes("strange-attractor")) return SHADER_CAMERA;
  if (pieceId.includes("escape-time") || pieceId.includes("sdf-raymarch")) return SHADER_CAMERA;
  if (pieceId.includes("flow") || pieceId.includes("tiling") || pieceId.includes("voronoi")) {
    return SHADER_CAMERA;
  }
  return SHADER_CAMERA;
}

export function defaultSpecForPiece(pieceId: string): AnimationSpec {
  const c = animationCapabilitiesFor(pieceId);
  const spec = defaultAnimationSpec();
  spec.source = c.defaultSource;
  spec.motion = c.defaultMotion;
  spec.endBehavior = c.defaultEndBehavior;
  if (c.defaultSource === "construction") {
    spec.components = ["construction"];
  } else if (c.defaultSource === "camera") {
    spec.components = ["camera"];
    spec.camera.motion = "pan";
  } else {
    spec.components = ["generative"];
  }
  spec.durationSec = c.defaultEndBehavior === "hold" ? 8 : 12;
  return spec;
}

export function normalizeSpecForPiece(pieceId: string, spec: AnimationSpec): AnimationSpec {
  const c = animationCapabilitiesFor(pieceId);
  const out = { ...spec, camera: { ...spec.camera } };
  if (!c.sources.includes(out.source)) {
    out.source = c.defaultSource;
  }
  if (!c.motions.includes(out.motion)) {
    out.motion = c.defaultMotion;
  }
  if (out.source === "composite") {
    out.components = out.components.filter((x) => {
      if (x === "generative") return c.sources.includes("generative") || c.sources.includes("composite");
      if (x === "camera") return c.sources.includes("camera") || c.sources.includes("composite");
      if (x === "construction") return c.sources.includes("construction") || c.sources.includes("composite");
      return c.sources.includes("parameters");
    });
    if (out.components.length === 0) out.components = [c.defaultSource === "composite" ? "generative" : (c.defaultSource as "generative")];
  } else {
    out.components =
      out.source === "generative"
        ? ["generative"]
        : out.source === "camera"
          ? ["camera"]
          : out.source === "construction"
            ? ["construction"]
            : out.source === "parameters"
              ? ["parameters"]
              : ["generative"];
  }
  return out;
}
