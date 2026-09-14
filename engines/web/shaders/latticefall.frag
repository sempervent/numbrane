#version 300 es
// LATTICEFALL composite fragment shader
// Couples lattice mask, particle density, field energy, escape-time / plasma.
// Logical time only: u_time = frame / fps (never wall clock).
precision highp float;
out vec4 o;

uniform vec2 u_res;
uniform float u_time;
uniform float u_geometryClarity;
uniform float u_fieldVisibility;
uniform float u_fractalPressure;
uniform float u_particleActivity;
uniform float u_decay;
uniform float u_chaos;
uniform float u_zoom;
uniform float u_power;
uniform float u_exposure;
uniform float u_saturation;
uniform float u_energy;
uniform float u_texture;
uniform float u_motion;
uniform float u_spectral;
uniform vec2 u_attractor; // -10 = inactive
uniform float u_attractorStrength;
uniform int u_nodeCount;
uniform vec2 u_nodes[32];
uniform int u_particleSampleCount;
uniform vec2 u_particles[64]; // subsampled particle positions (world)

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cpow(vec2 z, float n) {
  float r = length(z);
  float theta = atan(z.y, z.x);
  r = pow(max(r, 1e-8), n);
  theta *= n;
  return vec2(r * cos(theta), r * sin(theta));
}

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + (c.y * (1.0 - abs(2.0 * c.z - 1.0))) * (rgb - 0.5);
}

float latticeMask(vec2 p) {
  float dMin = 1e9;
  float edge = 1e9;
  for (int i = 0; i < 32; i++) {
    if (i >= u_nodeCount) break;
    vec2 n = u_nodes[i];
    dMin = min(dMin, length(p - n));
    for (int j = i + 1; j < 32; j++) {
      if (j >= u_nodeCount) break;
      vec2 m = u_nodes[j];
      vec2 ab = m - n;
      float t = clamp(dot(p - n, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      edge = min(edge, length(p - (n + ab * t)));
    }
  }
  float nodes = smoothstep(0.08, 0.01, dMin);
  float lines = smoothstep(0.035, 0.008, edge);
  return clamp(nodes * 1.2 + lines * 0.85, 0.0, 1.0);
}

float particleDensity(vec2 p) {
  float dens = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= u_particleSampleCount) break;
    vec2 q = u_particles[i];
    float d = length(p - q);
    dens += exp(-d * d * 80.0);
  }
  return dens;
}

// Plasma-like field mathematics
float plasmaField(vec2 uv, float t) {
  float v = 0.0;
  v += sin((uv.x + t) * 3.0);
  v += sin((uv.y + t * 0.7) * 2.5);
  v += sin((uv.x + uv.y + t * 0.4) * 2.0);
  v += sin(length(uv + vec2(sin(t * 0.3), cos(t * 0.2))) * 4.0);
  return v * 0.25;
}

float escapeFractal(vec2 uv) {
  vec2 c = uv / max(u_zoom, 0.2);
  // Lattice nodes tug the complex plane
  for (int i = 0; i < 8; i++) {
    if (i >= u_nodeCount) break;
    vec2 n = u_nodes[i] * 0.15;
    c += n * (0.02 * u_fractalPressure);
  }
  c += vec2(noise(c * 8.0 + u_time), noise(c * 8.0 + 17.2 + u_time)) * u_chaos * 0.12;

  vec2 z = vec2(0.0);
  float iter = 0.0;
  const int MAX_ITER = 64;
  for (int i = 0; i < MAX_ITER; i++) {
    if (dot(z, z) > 4.0) break;
    z = cpow(z, u_power) + c;
    iter += 1.0;
  }
  if (dot(z, z) > 4.0) {
    iter = iter + 1.0 - log(log(length(z))) / log(max(u_power, 1.1));
  }
  return iter / float(MAX_ITER);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_res.x / u_res.y;

  // Soft warp from field / motion
  vec2 warped = uv;
  float warpAmp = u_fieldVisibility * 0.12 * (0.5 + u_energy);
  warped += vec2(
    noise(uv * 3.0 + u_time * 0.15),
    noise(uv * 3.0 + 9.1 - u_time * 0.12)
  ) * warpAmp;

  if (u_attractorStrength > 0.0 && u_attractor.x > -9.0) {
    vec2 d = warped - u_attractor;
    float r = length(d) + 1e-4;
    warped -= normalize(d) * (u_attractorStrength * 0.08 / r);
  }

  float lattice = latticeMask(warped);
  float dens = particleDensity(warped) * u_particleActivity;
  float plasma = plasmaField(warped * (1.5 + u_texture), u_time * (0.4 + u_motion));
  float fractv = escapeFractal(warped);

  // Reaction-diffusion-ish blotches from particle density (visual only)
  float rd = smoothstep(0.2, 1.4, dens + noise(warped * 6.0 + u_time * 0.2) * u_texture);

  float geo = lattice * u_geometryClarity;
  float nonlinear = mix(plasma * 0.5 + 0.5, fractv, u_fractalPressure);
  nonlinear = mix(nonlinear, rd, 0.25 * u_particleActivity);

  float glow = geo * 0.85 + dens * 0.55 + nonlinear * (0.35 + u_fractalPressure * 0.65);
  glow *= (1.0 - u_decay * 0.55);
  glow *= u_exposure;

  float hue = fract(0.08 + nonlinear * 0.35 + u_spectral * 0.2 + geo * 0.05 + u_time * 0.01);
  float sat = clamp(u_saturation * (0.55 + u_energy * 0.35), 0.0, 1.0);
  float lit = clamp(0.12 + glow * 0.55, 0.0, 1.0);
  vec3 col = hsl2rgb(vec3(hue, sat, lit));

  // Lattice lines remain readable early
  col = mix(col, vec3(0.85, 0.92, 1.0), geo * 0.35 * (1.0 - u_fractalPressure * 0.7));
  // Particle sparks
  col += vec3(1.0, 0.75, 0.45) * dens * 0.25;

  // Afterimage fade toward sparse residue
  vec3 residue = vec3(0.04, 0.05, 0.07) + vec3(geo * 0.2);
  col = mix(col, residue, u_decay * 0.65);

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
