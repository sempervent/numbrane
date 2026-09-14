#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_f;
uniform float u_k;
uniform float u_du;
uniform float u_dv;
uniform float u_dt;
uniform float u_feedBoost; // audio onset → local V inject

void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 c = texture(u_state, uv);
  float U = c.r;
  float V = c.g;
  float lapU = 0.0;
  float lapV = 0.0;
  // 3x3 discrete Laplacian matching Python seed sim
  float k[9] = float[9](0.05, 0.2, 0.05, 0.2, -1.0, 0.2, 0.05, 0.2, 0.05);
  int idx = 0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 s = texture(u_state, uv + vec2(float(i), float(j)) * u_texel);
      lapU += k[idx] * s.r;
      lapV += k[idx] * s.g;
      idx++;
    }
  }
  float uvv = U * V * V;
  float Un = U + u_dt * (u_du * lapU - uvv + u_f * (1.0 - U));
  float Vn = V + u_dt * (u_dv * lapV + uvv - (u_f + u_k) * V) + u_feedBoost;
  o = vec4(clamp(Un, 0.0, 1.0), clamp(Vn, 0.0, 1.0), 0.0, 1.0);
}
