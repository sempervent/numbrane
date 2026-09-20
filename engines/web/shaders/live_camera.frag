#version 300 es
precision highp float;
out vec4 o;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec4 u_cam; // centerX, centerY, scale, rotation

vec2 cameraUv(vec2 uv) {
  vec2 p = uv - 0.5;
  float cs = cos(u_cam.w);
  float sn = sin(u_cam.w);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  p /= max(0.05, u_cam.z);
  return p + u_cam.xy + 0.5;
}

float mirrorAxis(float c) {
  float m = mod(c, 2.0);
  return m < 1.0 ? m : 2.0 - m;
}

vec2 mirrorTile(vec2 uv) {
  return vec2(mirrorAxis(uv.x), mirrorAxis(uv.y));
}

void main() {
  vec2 uv = mirrorTile(cameraUv(v_uv));
  o = texture(u_tex, uv);
}
