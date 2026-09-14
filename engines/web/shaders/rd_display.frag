#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_state;
uniform vec2 u_res;
uniform float u_hue;
uniform float u_energy;
uniform float u_exposure;

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + (c.y * (1.0 - abs(2.0 * c.z - 1.0))) * (rgb - 0.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 s = texture(u_state, uv);
  float U = s.r;
  float V = s.g;
  float v = clamp(V * 1.2 - U * 0.15, 0.0, 1.0);
  float hue = fract(u_hue + v * 0.35 + u_energy * 0.05);
  float sat = 0.45 + V * 0.4;
  float lit = 0.06 + v * 0.62 + u_energy * 0.08;
  vec3 col = hsl2rgb(vec3(hue, sat, lit));
  col = 1.0 - exp(-col * (0.7 + 1.4 * u_exposure));
  o = vec4(col, clamp(v * 1.3, 0.0, 1.0));
}
