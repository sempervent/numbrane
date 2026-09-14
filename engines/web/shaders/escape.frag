#version 300 es
precision highp float;
out vec4 o;

uniform vec2 u_res;
uniform float u_time, u_chaos, u_mutation, u_exposure;
uniform float u_paletteHue; // 0..360
uniform vec2 u_center; // complex center
uniform float u_zoom; // zoom level
uniform float u_power; // fractal power (1.8-3.5)

// hash/noise helpers
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

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + (c.y * (1.0 - abs(2.0 * c.z - 1.0))) * (rgb - 0.5);
}

// Complex number operations
vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cpow(vec2 z, float n) {
  float r = length(z);
  float theta = atan(z.y, z.x);
  r = pow(r, n);
  theta *= n;
  return vec2(r * cos(theta), r * sin(theta));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_res.x / u_res.y;

  // Map to complex plane
  vec2 c = u_center + uv / u_zoom;

  // Add noise perturbation
  float noiseScale = u_chaos * 0.1;
  c += vec2(noise(c * 10.0 + u_time * 0.1), noise(c * 10.0 + u_time * 0.1 + 17.2)) * noiseScale;

  // Escape-time iteration
  vec2 z = vec2(0.0);
  float smoothIter = 0.0;
  const int MAX_ITER = 100;

  for (int i = 0; i < MAX_ITER; i++) {
    if (dot(z, z) > 4.0) break;

    z = cpow(z, u_power) + c;
    smoothIter += 1.0;
  }

  // Smooth coloring
  if (dot(z, z) > 4.0) {
    smoothIter = smoothIter + 1.0 - log(log(length(z))) / log(u_power);
  }

  float normalizedIter = smoothIter / float(MAX_ITER);

  // Color mapping
  float hue = fract(u_paletteHue / 360.0 + normalizedIter * 0.3 + u_mutation * 0.2);
  float saturation = 0.8 + normalizedIter * 0.2;
  float lightness = 0.3 + normalizedIter * 0.4;

  // Interior coloring (dark)
  if (smoothIter >= float(MAX_ITER)) {
    lightness = 0.1;
    saturation = 0.2;
  }

  vec3 col = hsl2rgb(vec3(hue, saturation, lightness));

  // Soft vignette
  float vignette = 1.0 - length(uv) * 0.3;
  col *= vignette;

  // Exposure tonemap
  col = 1.0 - exp(-col * (0.8 + 1.6 * u_exposure));

  o = vec4(col, 1.0);
}
