/**
 * Upload CPU scalar fields as RGBA8 textures — reliable sampling in all WebGL2 contexts.
 * RGBA32F display textures often upload without error but sample as black.
 */

export function uploadScalarFieldTexture(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  field: Float32Array,
  simW: number,
  simH: number,
): void {
  const rgba = new Uint8Array(simW * simH * 4);
  let max = 1e-6;
  for (let i = 0; i < field.length; i++) max = Math.max(max, field[i]!);
  for (let i = 0; i < field.length; i++) {
    const v = field[i]! / max;
    const b = Math.max(0, Math.min(255, Math.floor(v * 255)));
    rgba[i * 4] = b;
    rgba[i * 4 + 1] = b;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, simW, simH, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
}
