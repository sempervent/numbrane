#version 300 es
precision highp float;
out vec4 o;

uniform vec2 u_res;
uniform float u_time, u_chaos, u_mutation, u_exposure;
uniform float u_paletteHue; // 0..360

// hash/noise/fbm helpers
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + 1.0);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.53;
  }
  return v;
}

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + (c.y * (1.0 - abs(2.0 * c.z - 1.0))) * (rgb - 0.5);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_res.x / u_res.y;

  // domain warp
  float t = u_time * 0.08;
  float w = fbm(uv * 1.4 + t) * (0.7 * u_chaos + 0.1);
  vec2 q = uv + vec2(fbm(uv + w + 1.2), fbm(uv + w + 5.7)) * (0.8 + 0.8 * u_mutation);
  float v = fbm(q * 2.3 + t * 0.7);

  float hue = fract(u_paletteHue / 360.0 + v * 0.18);
  vec3 col = hsl2rgb(vec3(hue, 0.8, 0.5 + 0.25 * v));

  // exposure tonemap
  col = 1.0 - exp(-col * (0.8 + 1.6 * u_exposure));
  o = vec4(col, 1.0);
}
