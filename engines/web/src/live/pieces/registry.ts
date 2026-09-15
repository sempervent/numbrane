/**
 * Live piece adapters — only registered runtimes; no silent generic shader fallback.
 */

import type { LivePiece } from "../piece";
import {
  getPieceRuntime,
  SHADER_NATIVE_PIECES,
} from "../../studio/runtime/registry";
import { createDifferentialGrowthPiece } from "./differentialGrowthLive";
import { createGeometryIrPiece } from "./geometryIrLive";
import { createLatticefallLivePiece } from "./latticefallLive";
import { createNoodlesLivePiece } from "./noodlesLive";
import { createReactionDiffusionPiece } from "./reactionDiffusion";
import { createShaderPiece } from "./shaderPiece";
import { createSlimeMoldPiece } from "./slimeMold";

export { createShaderPiece } from "./shaderPiece";

export class UnsupportedLivePieceError extends Error {
  constructor(pieceId: string, mode: string) {
    super(`${pieceId} does not support ${mode} (no authentic live runtime registered)`);
    this.name = "UnsupportedLivePieceError";
  }
}

export async function createLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
  mode: "animate" | "react" = "animate",
): Promise<LivePiece> {
  const desc = getPieceRuntime(pieceId);
  const kind = mode === "react" ? desc.react : desc.animate;
  if (!kind || kind === "unsupported" || kind === "python-api") {
    // python-api animate is handled by Studio frame stepping, not LivePiece
    if (kind === "python-api") {
      throw new UnsupportedLivePieceError(pieceId, `${mode} (uses deterministic frames)`);
    }
    throw new UnsupportedLivePieceError(pieceId, mode);
  }

  if (kind === "webgl-stateful") {
    if (pieceId === "reaction-diffusion/reaction-diffusion") {
      return createReactionDiffusionPiece(gl, pieceId);
    }
    if (pieceId === "growth/slime-mold") {
      return createSlimeMoldPiece(gl, pieceId);
    }
    if (pieceId === "particles/noodles") {
      return createNoodlesLivePiece(gl, pieceId);
    }
    if (pieceId === "growth/differential-growth") {
      return createDifferentialGrowthPiece(gl, pieceId);
    }
    if (pieceId === "mashups/slime-on-sdf") {
      // Compositor uses multi-layer; primary layer is slime
      return createSlimeMoldPiece(gl, "growth/slime-mold");
    }
  }

  if (kind === "geometry-ir") {
    return createGeometryIrPiece(gl, pieceId);
  }

  if (kind === "wasm") {
    if (pieceId === "flagship/latticefall") {
      return await createLatticefallLivePiece(gl, pieceId);
    }
  }

  if (kind === "shader-native") {
    if (!SHADER_NATIVE_PIECES.has(pieceId)) {
      throw new UnsupportedLivePieceError(pieceId, `${mode} (not shader-native)`);
    }
    return createShaderPiece(gl, pieceId);
  }

  throw new UnsupportedLivePieceError(pieceId, mode);
}
