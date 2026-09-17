/**
 * Continuous field / flow / nebula / noise-landscape GPU animation.
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_hue;
uniform float u_chaos;
uniform float u_density;
uniform float u_zoom;
uniform int u_kind; // 0 flow 1 nebula 2 landscape

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0.,a=0.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.05+17.0;a*=0.5;}
  return v;
}
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}
vec2 flow(vec2 p){
  float n=fbm(p*1.4+u_time*0.08);
  float a=n*6.28318;
  return vec2(cos(a),sin(a));
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  uv/=max(0.25,u_zoom);
  float v=0.;
  if(u_kind==0){
    // streamlines via multi-sample advection ink
    vec2 p=uv;
    for(int i=0;i<18;i++){
      vec2 f=flow(p*(1.2+u_density)+u_chaos);
      p+=f*0.035;
      v+=exp(-18.*abs(sin(p.x*8.+p.y*3.+u_time*0.4)))*0.08;
      v+=0.04*noise(p*6.+u_time);
    }
  } else if(u_kind==1){
    float n=fbm(uv*1.5+u_time*0.05);
    float n2=fbm(uv*3.0-u_time*0.07);
    v=smoothstep(0.35,0.75,n)*0.7+n2*0.35*u_density;
    v*=0.55+0.45*sin(length(uv)*6.-u_time);
  } else {
    float h=fbm(uv*2.0+vec2(u_time*0.03,0.));
    float ridge=abs(h-0.5);
    v=smoothstep(0.25,0.02,ridge)+0.2*noise(uv*10.+u_time);
    v*=0.5+u_density*0.5;
  }
  float hue=fract(u_hue+v*0.15+u_time*0.01);
  vec3 col=hsl2rgb(vec3(hue,0.4+u_chaos*0.2,0.06+v*0.55));
  o=vec4(col,1.0);
}`;

function compile(gl: WebGL2RenderingContext, src: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, src);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`field-flow: ${gl.getShaderInfoLog(fs)}`);
  }
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

export async function createFieldFlowLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, FRAG);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const kind = pieceId.includes("nebula") ? 1 : pieceId.includes("landscape") ? 2 : 0;
  const params: Record<string, number> = {
    density: 0.8,
    chaos: 0.3,
    zoom: 1,
    hue: 0.55,
  };
  let last: FrameState = {
    frame: 0,
    t: 0,
    dt: 1 / 60,
    fps: 60,
    beat: 0,
    bar: 0,
    beatPhase: 0,
    bpm: 120,
  };
  let seed = 42;

  return {
    id: pieceId,
    initialize(_r, s) {
      seed = s >>> 0;
      params.hue = 0.4 + ((seed % 1000) / 1000) * 0.35;
    },
    resize() {},
    update(frame) {
      last = frame;
    },
    setParameter(name, value) {
      if (typeof value === "number" && name in params) params[name] = value;
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      return { energy: 0.5, texture: params.density, motion: 0.6, spectral: params.chaos };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t + (seed % 100) * 0.01);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_chaos"), params.chaos);
      gl.uniform1f(loc("u_density"), params.density);
      gl.uniform1f(loc("u_zoom"), params.zoom);
      gl.uniform1i(loc("u_kind"), kind);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
