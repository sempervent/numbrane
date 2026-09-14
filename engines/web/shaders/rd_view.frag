#version 300 es
precision highp float;
out vec4 o;

uniform vec2 u_res;
uniform float u_time, u_chaos, u_mutation, u_exposure;
uniform float u_paletteHue; // 0..360
uniform sampler2D u_textureA; // ping-pong texture A
uniform sampler2D u_textureB; // ping-pong texture B

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

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // Simple reaction-diffusion visualization using noise
  // This is a simplified version - full RD would use ping-pong textures

  float t = u_time * 0.1;
  vec2 p = uv * 8.0 + t;

  // Create chemical-like patterns
  float a = noise(p) * 0.5 + 0.5;
  float b = noise(p + vec2(17.2, 23.1)) * 0.5 + 0.5;

  // Reaction-diffusion inspired coloring
  float reaction = a * b * b; // A * B^2 term
  float diffusion = (a + b) * 0.5;

  // Color mapping
  float hue = fract(u_paletteHue / 360.0 + reaction * 0.3 + u_mutation * 0.2);
  float saturation = 0.8 + reaction * 0.2;
  float lightness = 0.3 + diffusion * 0.4 + reaction * 0.3;

  vec3 col = hsl2rgb(vec3(hue, saturation, lightness));

  // Add some chaos-based variation
  col += vec3(noise(uv * 20.0 + t) * u_chaos * 0.1);

  // Exposure tonemap
  col = 1.0 - exp(-col * (0.8 + 1.6 * u_exposure));

  o = vec4(col, 1.0);
}
