/**
 * Continuous Truchet / Voronoi tiling animation.
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_hue;
uniform float u_density;
uniform float u_chaos;
uniform int u_kind; // 0 truchet 1 voronoi
uniform float u_seed;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+u_seed)*43758.5453);}
vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}

float truchet(vec2 uv){
  float scale=6.+u_density*6.;
  vec2 gv=fract(uv*scale)-0.5;
  vec2 id=floor(uv*scale);
  float rnd=hash(id+floor(u_time*0.15));
  if(rnd>0.5) gv.x*=-1.;
  // field-driven orientation evolution
  float bias=sin(id.x*0.4+id.y*0.3+u_time*(0.2+u_chaos*0.5));
  if(bias>0.35) gv.y*=-1.;
  float d=min(length(gv-vec2(-0.5,0.5)),length(gv-vec2(0.5,-0.5)));
  return smoothstep(0.08,0.02,abs(d-0.5));
}

float voronoi(vec2 uv){
  float scale=4.+u_density*5.;
  vec2 p=uv*scale;
  vec2 n=floor(p);
  vec2 f=fract(p);
  float md=8.;
  for(int j=-1;j<=1;j++)
  for(int i=-1;i<=1;i++){
    vec2 g=vec2(float(i),float(j));
    vec2 o=vec2(hash(n+g),hash(n+g+17.));
    o=0.5+0.5*sin(u_time*(0.4+u_chaos)+6.2831*o);
    vec2 r=g+o-f;
    md=min(md,dot(r,r));
  }
  float edge=smoothstep(0.0,0.08,sqrt(md))-smoothstep(0.05,0.12,sqrt(md));
  return edge+0.15*(1.-smoothstep(0.,0.4,sqrt(md)));
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  float v=u_kind==0?truchet(uv):voronoi(uv);
  float hue=fract(u_hue+v*0.1+u_time*0.01);
  vec3 col=hsl2rgb(vec3(hue,0.35,0.05+v*0.6));
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
    throw new Error(`tiling: ${gl.getShaderInfoLog(fs)}`);
  }
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

export async function createTilingLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, FRAG);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const kind = pieceId.includes("voronoi") ? 1 : 0;
  const params: Record<string, number> = { density: 0.7, chaos: 0.3, hue: 0.55 };
  let seed = 42;
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

  return {
    id: pieceId,
    initialize(_r, s) {
      seed = s >>> 0;
      params.hue = 0.45 + ((seed % 200) / 200) * 0.2;
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
      return { energy: 0.4, texture: params.density, motion: 0.5, spectral: params.chaos };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_density"), params.density);
      gl.uniform1f(loc("u_chaos"), params.chaos);
      gl.uniform1i(loc("u_kind"), kind);
      gl.uniform1f(loc("u_seed"), (seed % 10000) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
