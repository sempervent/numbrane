/**
 * Shared WebGL color uniforms + 1D ramp LUT.
 */

import type { ColorConfig } from "./model";
import { hexToHueTurn, parseHexColor } from "./model";
import { buildLutRGBA8 } from "./lut";
import type { LivePiece } from "../../live/piece";

const RAMP_UNIT = 7;

export type ColorGlBinding = {
  rampTex: WebGLTexture;
  lastDigest: string;
};

export function colorDigest(config: ColorConfig): string {
  return JSON.stringify(config);
}

export function createColorGlBinding(gl: WebGL2RenderingContext): ColorGlBinding {
  const rampTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, rampTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { rampTex, lastDigest: "" };
}

export function uploadRampLut(
  gl: WebGL2RenderingContext,
  binding: ColorGlBinding,
  config: ColorConfig,
): void {
  const digest = colorDigest(config);
  if (digest === binding.lastDigest) return;
  binding.lastDigest = digest;
  const ramp = config.mode === "ramp" ? config.ramp : config.ramp;
  const data = buildLutRGBA8(ramp);
  gl.activeTexture(gl.TEXTURE0 + RAMP_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, binding.rampTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

export function bindColorUniforms(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  binding: ColorGlBinding,
  config: ColorConfig,
): void {
  uploadRampLut(gl, binding, config);
  const primary = parseHexColor(config.primary.value);
  const secondary = parseHexColor(config.secondary.value);
  const bg = parseHexColor(config.background.value);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform3f(loc("u_colorPrimary"), primary.r, primary.g, primary.b);
  gl.uniform3f(loc("u_colorSecondary"), secondary.r, secondary.g, secondary.b);
  if (config.transparentBackground) {
    gl.uniform4f(loc("u_colorBg"), bg.r, bg.g, bg.b, 0);
  } else {
    gl.uniform4f(loc("u_colorBg"), bg.r, bg.g, bg.b, 1);
  }
  const rampOn = config.mode === "ramp" ? 1 : 0;
  gl.uniform1f(loc("u_colorRampOn"), rampOn);
  gl.uniform1f(loc("u_colorGradientOn"), config.mode === "gradient" ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0 + RAMP_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, binding.rampTex);
  gl.uniform1i(loc("u_colorRamp"), RAMP_UNIT);
}

/** Push canonical color into a live piece (uniforms + legacy hue). */
export function applyColorToLivePiece(
  piece: LivePiece,
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  binding: ColorGlBinding,
  config: ColorConfig,
): void {
  bindColorUniforms(gl, prog, binding, config);
  piece.setParameter("hue", hexToHueTurn(config.primary.value));
  piece.setParameter("color.mode", config.mode);
  piece.setParameter("color.rampMapping", config.rampMapping);
}

export { RAMP_UNIT };
