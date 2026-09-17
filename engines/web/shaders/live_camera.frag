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

void main() {
  vec2 uv = cameraUv(v_uv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    o = vec4(0.02, 0.02, 0.03, 1.0);
    return;
  }
  o = texture(u_tex, uv);
}
