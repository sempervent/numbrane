/**
 * Live piece adapters — authentic sim runtimes where available, else GLSL modes.
 */

import type { LivePiece } from "../piece";
import { createDifferentialGrowthPiece } from "./differentialGrowthLive";
import { createGeometryIrPiece } from "./geometryIrLive";
import { createLatticefallLivePiece } from "./latticefallLive";
import { createNoodlesLivePiece } from "./noodlesLive";
import { createReactionDiffusionPiece } from "./reactionDiffusion";
import { createShaderPiece } from "./shaderPiece";
import { createSlimeMoldPiece } from "./slimeMold";

export { createShaderPiece } from "./shaderPiece";

const GEOMETRY_IR_PIECES = new Set([
  "geometry/metatron",
  "geometry/seed-of-life",
  "geometry/flower-of-life",
  "geometry/sri-yantra",
  "geometry/isometric",
  "geometry/circle-packing",
  "reference/circle-lattice",
]);

export async function createLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
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
  if (GEOMETRY_IR_PIECES.has(pieceId)) {
    return createGeometryIrPiece(gl, pieceId);
  }
  if (pieceId === "flagship/latticefall") {
    try {
      return await createLatticefallLivePiece(gl, pieceId);
    } catch {
      return createShaderPiece(gl, pieceId);
    }
  }
  return createShaderPiece(gl, pieceId);
}
