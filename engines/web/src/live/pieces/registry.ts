/**
 * Live piece adapters — authentic sim runtimes where available, else GLSL modes.
 */

import type { LivePiece } from "../piece";
import { createLatticefallLivePiece } from "./latticefallLive";
import { createReactionDiffusionPiece } from "./reactionDiffusion";
import { createShaderPiece } from "./shaderPiece";
import { createSlimeMoldPiece } from "./slimeMold";

export { createShaderPiece } from "./shaderPiece";

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
  if (pieceId === "flagship/latticefall") {
    try {
      return await createLatticefallLivePiece(gl, pieceId);
    } catch {
      return createShaderPiece(gl, pieceId);
    }
  }
  return createShaderPiece(gl, pieceId);
}
