#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_trail;
uniform vec2 u_res;
uniform float u_hue;
uniform float u_energy;
uniform float u_density;

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + (c.y * (1.0 - abs(2.0 * c.z - 1.0))) * (rgb - 0.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = texture(u_trail, uv).r;
  float v = clamp(t * (0.6 + 0.8 * u_density), 0.0, 1.0);
  float hue = fract(u_hue + v * 0.25 + u_energy * 0.08);
  vec3 col = hsl2rgb(vec3(hue, 0.5 + u_energy * 0.2, 0.05 + v * 0.7));
  o = vec4(col, clamp(v * 1.4, 0.0, 1.0));
}
