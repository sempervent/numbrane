/** GLSL snippets appended to live fragment shaders for canonical color. */

export const COLOR_UNIFORM_DECL = `
uniform vec3 u_colorPrimary;
uniform vec3 u_colorSecondary;
uniform vec4 u_colorBg;
uniform float u_colorRampOn;
uniform sampler2D u_colorRamp;
`;

export const COLOR_APPLY_FUNC = `
vec3 applyPieceColor(vec3 base, float rampT) {
  if (u_colorRampOn > 0.5) {
    return texture(u_colorRamp, vec2(clamp(rampT, 0.0, 1.0), 0.5)).rgb;
  }
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float peak = max(max(u_colorPrimary.r, u_colorPrimary.g), u_colorPrimary.b);
  if (peak < 1e-4) return base * lum;
  return u_colorPrimary * (lum / peak);
}
`;
