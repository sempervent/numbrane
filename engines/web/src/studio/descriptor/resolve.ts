/**
 * Resolved Studio piece descriptor — manifest + runtime registry (browser-safe).
 */

import type { AnimationSource } from "../animation/spec";
import { animationCapabilitiesFor } from "../animation/capabilities";
import type { PieceInfo } from "../catalog";

export type PieceManifest = PieceInfo & {
  piece_id: string;
  name?: string;
  studio_visible?: boolean;
};
import {
  getPieceRuntime,
  isBrowserNativeAnimate,
  PIECE_RUNTIMES,
  type ParamField,
  type PieceRuntimeDescriptor,
  type RendererKind,
} from "../runtime/registry";

export type ModeCapability = {
  supported: boolean;
  backend: RendererKind | null;
};

export type StudioPieceDescriptor = {
  pieceId: string;
  title: string;
  family: string;
  description: string;
  manifest: PieceManifest;
  runtime: PieceRuntimeDescriptor;
  generate: ModeCapability;
  animate: ModeCapability;
  react: ModeCapability;
  animationSourceModes: AnimationSource[];
  parameters: ParamField[];
};

function modeCap(kind: RendererKind | null): ModeCapability {
  if (!kind || kind === "unsupported") return { supported: false, backend: null };
  return { supported: true, backend: kind };
}

function hasExplicitRuntime(pieceId: string): boolean {
  return Object.prototype.hasOwnProperty.call(PIECE_RUNTIMES, pieceId);
}

export function resolveStudioDescriptor(manifest: PieceManifest): StudioPieceDescriptor {
  const pieceId = manifest.piece_id;
  if (!hasExplicitRuntime(pieceId)) {
    throw new Error(`catalog piece ${pieceId} has no runtime descriptor`);
  }
  const runtime = getPieceRuntime(pieceId);
  const animateBackend = runtime.animate;
  const animateSupported = isBrowserNativeAnimate(animateBackend);
  const caps = animationCapabilitiesFor(pieceId);
  return {
    pieceId,
    title: manifest.title || manifest.name || pieceId,
    family: manifest.family || pieceId.split("/")[0] || "other",
    description: manifest.description ?? "",
    manifest,
    runtime,
    generate: modeCap(runtime.generate),
    animate: {
      supported: animateSupported,
      backend: animateSupported ? animateBackend : null,
    },
    react: modeCap(runtime.react),
    animationSourceModes: caps.sources.filter(
      (s): s is AnimationSource => s !== "composite",
    ),
    parameters: runtime.paramSchema,
  };
}
