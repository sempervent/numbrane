#version 300 es
precision highp float;
out vec4 o;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_feedback;
uniform vec2 u_res;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_vignette;
uniform float u_bloom;
uniform float u_feedbackAmt;
uniform float u_feedbackZoom;
uniform float u_feedbackRot;
uniform float u_chromatic;
uniform float u_grain;
uniform float u_time;
uniform float u_blackout;

float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
vec3 rgb2hsl(vec3 c){
  float mx=max(max(c.r,c.g),c.b),mn=min(min(c.r,c.g),c.b);
  float l=(mx+mn)*.5;
  float d=mx-mn;
  float s=d<1e-5?0.:d/(1.-abs(2.*l-1.));
  float h=0.;
  if(d>1e-5){
    if(mx==c.r)h=mod((c.g-c.b)/d,6.);
    else if(mx==c.g)h=(c.b-c.r)/d+2.;
    else h=(c.r-c.g)/d+4.;
    h/=6.;
  }
  return vec3(h,s,l);
}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

void main(){
  vec2 uv=v_uv;
  vec2 centered=uv-0.5;
  // chromatic
  vec2 offs=centered*u_chromatic*0.01;
  float r=texture(u_scene,uv+offs).r;
  float g=texture(u_scene,uv).g;
  float b=texture(u_scene,uv-offs).b;
  vec4 sc=vec4(r,g,b,texture(u_scene,uv).a);

  // feedback
  vec2 fuv=(centered*u_feedbackZoom);
  fuv=rot(u_feedbackRot)*fuv+0.5;
  vec4 fb=texture(u_feedback,clamp(fuv,0.,1.));
  vec3 col=mix(sc.rgb,max(sc.rgb,fb.rgb*0.98),u_feedbackAmt);
  // prevent runaway: soft clamp
  col=col/(1.0+col*0.35);

  // bloom approx
  vec3 bloom=texture(u_scene,uv).rgb;
  bloom+=texture(u_scene,uv+vec2(1.5,0)/u_res).rgb;
  bloom+=texture(u_scene,uv+vec2(-1.5,0)/u_res).rgb;
  bloom+=texture(u_scene,uv+vec2(0,1.5)/u_res).rgb;
  bloom+=texture(u_scene,uv+vec2(0,-1.5)/u_res).rgb;
  bloom*=0.2;
  col+=bloom*u_bloom;

  col*=u_exposure;
  col=(col-0.5)*u_contrast+0.5;
  vec3 hsl=rgb2hsl(clamp(col,0.,1.));
  hsl.x=fract(hsl.x+u_hue);
  hsl.y*=u_saturation;
  col=hsl2rgb(hsl);

  float vig=smoothstep(0.95,0.35,length(centered)*u_vignette*1.4+(1.-u_vignette));
  col*=vig;
  col+= (hash(uv*u_res+u_time)-0.5)*u_grain*0.08;
  col*=1.0-u_blackout;

  o=vec4(clamp(col,0.,1.),mix(sc.a,1.0,0.0)*(1.0-u_blackout));
}
