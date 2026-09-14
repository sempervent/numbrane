#version 300 es
precision highp float;
out vec4 o;
in vec2 v_uv;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform float u_opacity;
uniform int u_blend; // 0 normal 1 add 2 multiply 3 screen 4 difference 5 lighten 6 darken
uniform float u_progress; // transition progress when compositing A->B

vec3 blend(vec3 a, vec3 b, int mode){
  if(mode==1) return min(a+b,1.0);
  if(mode==2) return a*b;
  if(mode==3) return 1.0-(1.0-a)*(1.0-b);
  if(mode==4) return abs(a-b);
  if(mode==5) return max(a,b);
  if(mode==6) return min(a,b);
  return b; // normal: use b
}

void main(){
  vec4 A=texture(u_texA,v_uv);
  vec4 B=texture(u_texB,v_uv);
  float op=u_opacity;
  vec3 bcol=blend(A.rgb,B.rgb,u_blend);
  float ba=clamp(B.a*op,0.,1.);
  vec3 outc=mix(A.rgb,bcol,ba);
  float outa=clamp(A.a+ba*(1.-A.a),0.,1.);
  // transition mix toward B
  outc=mix(outc,B.rgb,u_progress*0.0); // progress applied externally via opacity
  o=vec4(outc,outa);
}
