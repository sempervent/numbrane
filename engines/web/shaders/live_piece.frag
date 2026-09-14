#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_beat;
uniform float u_beatPhase;
uniform float u_chaos;
uniform float u_density;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_hue;
uniform float u_energy;
uniform float u_low;
uniform float u_mid;
uniform float u_high;
uniform float u_onset;
uniform int u_mode; // 0 geom 1 field 2 fractal 3 growth 4 rd 5 tiling 6 particles 7 mashup

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

float circleLattice(vec2 p){
  float d=1e9;
  for(int i=0;i<7;i++){
    float a=float(i)*6.28318/6.;
    vec2 c=i==0?vec2(0):(vec2(cos(a),sin(a)));
    d=min(d,abs(length(p-c)-1.0));
    d=min(d,length(p-c)-0.04);
  }
  return smoothstep(0.04,0.0,d);
}

float metatron(vec2 p){
  float m=circleLattice(p);
  for(int i=0;i<6;i++){
    float a=float(i)*6.28318/6.;
    vec2 c=vec2(cos(a),sin(a));
    for(int j=i+1;j<6;j++){
      float b=float(j)*6.28318/6.;
      vec2 d=vec2(cos(b),sin(b));
      vec2 ab=d-c;
      float t=clamp(dot(p-c,ab)/max(dot(ab,ab),1e-5),0.,1.);
      m=max(m,smoothstep(0.025,0.0,length(p-(c+ab*t))));
    }
  }
  return m;
}

float escape(vec2 uv){
  vec2 z=vec2(0);
  vec2 c=uv/max(u_zoom,0.2)+vec2(-0.4,0.0)+0.1*vec2(u_chaos)*vec2(sin(u_time*0.2),cos(u_time*0.17));
  float it=0.;
  for(int i=0;i<48;i++){
    if(dot(z,z)>4.)break;
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;
    it+=1.;
  }
  return it/48.;
}

float attractor(vec2 uv){
  // Clifford-like trail density estimate
  float x=0.1,y=0.1;
  float dens=0.;
  float a=1.7+u_chaos*0.4,b=1.6+u_mid*0.3,c=0.9,d=1.2+u_energy*0.2;
  for(int i=0;i<80;i++){
    float nx=sin(a*y)+c*cos(a*x);
    float ny=sin(b*x)+d*cos(b*y);
    x=nx;y=ny;
    dens+=exp(-40.*dot(uv-vec2(x,y)*0.45,uv-vec2(x,y)*0.45));
  }
  return dens*0.15;
}

float fieldFlow(vec2 uv){
  float n=0.;
  vec2 p=uv;
  for(int i=0;i<4;i++){
    n+=noise(p*2.5+u_time*0.15+float(i))*0.5;
    p=rot(0.4)*p*1.3;
  }
  float lines=abs(fract(n*6.+u_beatPhase)-0.5);
  return smoothstep(0.15,0.0,lines)*(0.4+u_energy);
}

float growth(vec2 uv){
  float r=length(uv);
  float a=atan(uv.y,uv.x);
  float branch=abs(sin(a*6.+u_time*0.5+r*8.));
  float spine=smoothstep(0.08,0.0,abs(fract(r*3.-u_time*0.2)-0.5));
  return spine*(1.-smoothstep(0.2,1.4,r))*branch*(0.5+u_density);
}

float rdView(vec2 uv){
  float v=noise(uv*4.+u_time*0.1);
  float u=noise(uv*3.-u_time*0.08+17.);
  float react=smoothstep(0.35,0.55,v)-smoothstep(0.55,0.75,u);
  return clamp(react*(0.6+u_low)+u_onset*0.4,0.,1.);
}

float truchet(vec2 uv){
  vec2 g=floor(uv*6.);
  vec2 f=fract(uv*6.)-0.5;
  float h=hash(g);
  if(h>0.5)f.x=-f.x;
  float d=abs(length(f)-0.5);
  return smoothstep(0.08,0.0,d);
}

float voronoi(vec2 uv){
  vec2 g=floor(uv*5.);
  float md=1e9;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j));
    vec2 r=o+hash(g+o)-fract(uv*5.)+0.1*sin(u_time+hash(g+o)*6.);
    md=min(md,dot(r,r));
  }
  return 1.-smoothstep(0.0,0.2,md);
}

float particles(vec2 uv){
  float d=0.;
  for(int i=0;i<24;i++){
    float fi=float(i);
    vec2 p=vec2(hash(vec2(fi,1.)),hash(vec2(fi,2.)))*2.-1.;
    p+=0.3*vec2(sin(u_time*(0.4+fi*0.03)+fi),cos(u_time*(0.35+fi*0.02)));
    p+=u_low*0.2*normalize(p+1e-3);
    d+=exp(-80.*dot(uv-p,uv-p));
  }
  return d;
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  uv*=rot(u_rotation);
  uv/=max(u_zoom,0.2);

  float v=0.;
  if(u_mode==0)v=metatron(uv*(1.1+0.1*sin(u_beatPhase*6.283)));
  else if(u_mode==1)v=fieldFlow(uv);
  else if(u_mode==2)v=mix(escape(uv),attractor(uv),clamp(u_chaos,0.,1.));
  else if(u_mode==3)v=growth(uv);
  else if(u_mode==4)v=rdView(uv);
  else if(u_mode==5)v=mix(truchet(uv),voronoi(uv),0.45+0.2*u_mid);
  else if(u_mode==6)v=particles(uv);
  else v=max(metatron(uv*0.9),escape(uv)*0.7);

  v*=0.55+0.45*u_density;
  v+=u_onset*0.25;
  float hue=fract(u_hue+v*0.35+u_high*0.1+u_time*0.01);
  float sat=0.45+u_mid*0.35;
  float lit=0.08+v*0.55+u_energy*0.08;
  vec3 col=hsl2rgb(vec3(hue,sat,lit));
  o=vec4(col,clamp(v*1.2,0.,1.));
}
