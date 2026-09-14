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
float fbm(vec2 p){
  float v=0.,a=0.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,3.1);a*=0.5;}
  return v;
}
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

// Seed of Life / lattice — construction grows with beatPhase
float seedOfLife(vec2 p,float construct){
  float d=1e9;
  int n=int(1.+floor(construct*6.));
  for(int i=0;i<7;i++){
    if(i>n)break;
    float a=float(i)*6.28318/6.;
    vec2 c=i==0?vec2(0):(vec2(cos(a),sin(a)));
    d=min(d,abs(length(p-c)-1.0));
    d=min(d,length(p-c)-0.035);
  }
  return smoothstep(0.035,0.0,d);
}

float metatron(vec2 p,float construct){
  float m=seedOfLife(p,1.);
  int lim=int(1.+floor(construct*5.));
  for(int i=0;i<6;i++){
    if(i>lim)break;
    float a=float(i)*6.28318/6.;
    vec2 c=vec2(cos(a),sin(a));
    for(int j=i+1;j<6;j++){
      float b=float(j)*6.28318/6.;
      vec2 d=vec2(cos(b),sin(b));
      vec2 ab=d-c;
      float t=clamp(dot(p-c,ab)/max(dot(ab,ab),1e-5),0.,1.);
      m=max(m,smoothstep(0.02,0.0,length(p-(c+ab*t))));
    }
  }
  // field coupling — soft deformation from audio low
  float warp=0.08*u_low*noise(p*2.+u_time*0.2);
  return m*(1.-warp)+warp*seedOfLife(p*(1.+0.05*sin(u_beat)),construct);
}

// Circle packing: sites grow/settle over time (hashed radii)
float packing(vec2 uv){
  float d=1e9;
  for(int i=0;i<18;i++){
    float fi=float(i);
    vec2 c=(vec2(hash(vec2(fi,0.3)),hash(vec2(fi,0.7)))*2.-1.)*0.85;
    float grow=fract(u_time*0.05+hash(vec2(fi,2.)));
    float r=0.04+0.12*grow*(0.5+u_density);
    r*=1.+0.25*u_energy;
    d=min(d,length(uv-c)-r);
  }
  return smoothstep(0.02,0.,abs(d))*smoothstep(0.05,0.,d+0.02);
}

float escape(vec2 uv){
  vec2 z=vec2(0);
  float power=2.+u_chaos*1.5;
  vec2 c=uv/max(u_zoom,0.15)+vec2(-0.45+0.1*u_mid,0.05*u_high)
    +0.08*u_chaos*vec2(sin(u_time*0.15),cos(u_time*0.13));
  float it=0.;
  int maxIt=32+int(u_density*32.);
  for(int i=0;i<64;i++){
    if(i>=maxIt)break;
    if(dot(z,z)>4.)break;
    // power via polar for non-2
    float r=pow(length(z),power);
    float a=atan(z.y,z.x)*power;
    z=r*vec2(cos(a),sin(a))+c;
    it+=1.;
  }
  return it/float(maxIt);
}

float attractor(vec2 uv){
  float x=0.1,y=0.1;
  float dens=0.;
  float a=1.7+u_chaos*0.5,b=1.55+u_mid*0.35,c=0.9+u_high*0.2,d=1.25+u_energy*0.25;
  int steps=60+int(u_density*40.);
  for(int i=0;i<120;i++){
    if(i>=steps)break;
    float nx=sin(a*y)+c*cos(a*x);
    float ny=sin(b*x)+d*cos(b*y);
    x=nx;y=ny;
    vec2 q=vec2(x,y)*0.42;
    dens+=exp(-55.*dot(uv-q,uv-q));
  }
  return dens*0.12;
}

float fieldFlow(vec2 uv){
  // streamline-ish: integrate noise curl along short path from each pixel seed
  vec2 p=uv;
  float ink=0.;
  for(int i=0;i<12;i++){
    float n=fbm(p*1.8+u_time*0.12);
    vec2 v=vec2(noise(p+17.)-0.5,noise(p+9.)-0.5);
    v=normalize(v+1e-4)*(0.04+0.03*u_energy)*(1.+u_low);
    p+=v;
    ink+=exp(-30.*abs(fract(n*5.+u_beatPhase*0.5)-0.5));
  }
  return clamp(ink*0.25*(0.5+u_density),0.,1.);
}

float nebula(vec2 uv){
  float d=fbm(uv*1.5+u_time*0.05);
  float e=fbm(uv*3.-u_time*0.07+3.);
  float cloud=smoothstep(0.35,0.75,d)*smoothstep(0.2,0.8,e);
  cloud+=u_onset*0.2*noise(uv*8.);
  return cloud*(0.4+0.5*u_energy);
}

float growth(vec2 uv){
  // differential-growth flavored: repulsion rings + elongation
  float r=length(uv);
  float a=atan(uv.y,uv.x);
  float gen=fract(u_time*0.08+u_beat*0.02);
  float branch=abs(sin(a*(5.+3.*u_chaos)+r*(6.+4.*u_density)-u_time*0.4));
  float spine=smoothstep(0.07,0.,abs(fract(r*(2.5+gen*2.)-u_time*0.15)-0.5));
  float tip=exp(-8.*abs(r-(0.3+0.7*gen)));
  return clamp((spine*branch+tip*0.5)*(1.-smoothstep(0.3,1.5,r))*(0.45+u_mid),0.,1.);
}

float lsystem(vec2 uv){
  float a=atan(uv.y,uv.x);
  float r=length(uv);
  float turn=floor(mod(a/6.28318*8.+u_time*0.1,8.));
  float turtle=smoothstep(0.04,0.,abs(fract(r*4.-turn*0.1)-0.5));
  return turtle*(1.-smoothstep(0.2,1.2,r))*(0.5+u_density);
}

// Lightweight Gray-Scott-inspired field from coupled noise reactants
float rdView(vec2 uv){
  float F=0.045+0.04*u_low;
  float K=0.055+0.03*u_high;
  float U=fbm(uv*3.+u_time*0.04);
  float V=fbm(uv*4.-u_time*0.05+11.);
  // reaction step caricature
  float uvv=U*V*V;
  U=clamp(U+0.15*(-uvv+F*(1.-U)),0.,1.);
  V=clamp(V+0.15*(uvv-(F+K)*V)+0.2*u_onset,0.,1.);
  float spots=smoothstep(0.25,0.55,V)-smoothstep(0.6,0.85,U);
  return clamp(spots*(0.55+u_energy*0.4),0.,1.);
}

float truchet(vec2 uv){
  float scale=5.+3.*u_density;
  vec2 g=floor(uv*scale);
  vec2 f=fract(uv*scale)-0.5;
  float h=hash(g+floor(u_beat*0.25));
  float phase=u_beatPhase+u_time*0.05*u_chaos;
  if(h>0.5+0.1*sin(phase*6.28))f.x=-f.x;
  float d=abs(length(f)-0.5);
  return smoothstep(0.09,0.,d);
}

float voronoi(vec2 uv){
  float scale=4.+2.*u_density;
  vec2 g=floor(uv*scale);
  float md=1e9,md2=1e9;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j));
    vec2 n=hash(g+o)*vec2(1.,1.);
    // sites drift — real Voronoi topology change
    vec2 site=o+n-fract(uv*scale)+0.15*vec2(sin(u_time*(0.3+n.x)+n.y*6.),cos(u_time*(0.25+n.y)));
    float d=dot(site,site);
    if(d<md){md2=md;md=d;} else if(d<md2)md2=d;
  }
  float edge=smoothstep(0.,0.05,md2-md);
  return (1.-smoothstep(0.,0.25,md))*edge;
}

float particles(vec2 uv){
  // noodle-like: short integrated streaks in a field
  float d=0.;
  int N=16+int(u_density*16.);
  for(int i=0;i<32;i++){
    if(i>=N)break;
    float fi=float(i);
    vec2 p=vec2(hash(vec2(fi,1.)),hash(vec2(fi,2.)))*2.-1.;
    for(int s=0;s<6;s++){
      vec2 v=vec2(noise(p*2.+u_time*0.2)-0.5,noise(p*2.+9.+u_time*0.18)-0.5);
      v=normalize(v+1e-4)*(0.04+0.05*u_low);
      p+=v;
      d+=exp(-90.*dot(uv-p,uv-p));
    }
  }
  return clamp(d*0.35,0.,1.);
}

float slime(vec2 uv){
  // agent-trail look: deposit blobs that advect toward trails
  float trail=0.;
  for(int i=0;i<20;i++){
    float fi=float(i);
    float ang=hash(vec2(fi,0.2))*6.28318+u_time*(0.3+0.2*u_energy);
    float rad=0.2+0.6*hash(vec2(fi,0.5));
    vec2 p=rad*vec2(cos(ang),sin(ang));
    p+=0.1*u_mid*vec2(noise(p+u_time),noise(p+3.));
    trail+=exp(-70.*dot(uv-p,uv-p));
  }
  float field=fbm(uv*3.+u_time*0.1);
  return clamp(trail*0.5+field*0.25*(0.4+u_density),0.,1.);
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  uv*=rot(u_rotation);
  uv/=max(u_zoom,0.2);

  float construct=clamp(0.35+0.65*fract(u_beat*0.125)+0.2*u_energy,0.,1.);
  float v=0.;
  if(u_mode==0){
    float g=metatron(uv*(1.05+0.08*sin(u_beatPhase*6.283)),construct);
    g=max(g,packing(uv*1.2)*0.85*u_chaos);
    g=max(g,seedOfLife(uv*(1.1),construct)*0.9);
    v=g;
  }else if(u_mode==1){
    v=mix(fieldFlow(uv),nebula(uv),clamp(u_chaos*0.7,0.,1.));
  }else if(u_mode==2){
    v=mix(escape(uv),attractor(uv),clamp(u_chaos,0.,1.));
  }else if(u_mode==3){
    v=mix(growth(uv),mix(lsystem(uv),slime(uv),0.5),clamp(u_chaos,0.,0.8));
  }else if(u_mode==4){
    v=rdView(uv);
  }else if(u_mode==5){
    v=mix(truchet(uv),voronoi(uv),0.4+0.35*u_mid);
  }else if(u_mode==6){
    v=mix(particles(uv),slime(uv),0.35+0.2*u_low);
  }else{
    // mashup / latticefall-ish: lattice + field + fractal
    v=max(metatron(uv*0.85,construct),max(fieldFlow(uv*0.9)*0.7,escape(uv)*0.65));
  }

  v*=0.5+0.5*u_density;
  v=mix(v,v+0.35,u_onset*0.5);
  float hue=fract(u_hue+v*0.32+u_high*0.12+u_time*0.008);
  float sat=0.4+u_mid*0.4;
  float lit=0.07+v*0.58+u_energy*0.1;
  vec3 col=hsl2rgb(vec3(hue,sat,lit));
  o=vec4(col,clamp(v*1.25,0.,1.));
}
