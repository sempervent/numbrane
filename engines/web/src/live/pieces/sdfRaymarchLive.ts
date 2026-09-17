/**
 * Continuous 2D SDF raymarch — authentic GPU animation (no /api/render per frame).
 */

import { FULLSCREEN_VERTEX_SHADER } from "../../gl";
import type { FrameState, LivePiece, LiveTelemetry, RenderContext } from "../piece";
import { defaultColorConfig, type ColorConfig } from "../../studio/color/model";
import { bindColorUniforms, createColorGlBinding } from "../../studio/color/gl";
import { COLOR_APPLY_FUNC, COLOR_UNIFORM_DECL } from "../../studio/color/shaderSnippets";

const SDF_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_hue;
uniform float u_chaos;
uniform float u_density;
uniform float u_zoom;
uniform float u_seed;
${COLOR_UNIFORM_DECL}
${COLOR_APPLY_FUNC}

float hash(float n){return fract(sin(n)*43758.5453);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

float sdCircle(vec2 p,float r){return length(p)-r;}
float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float sdRing(vec2 p,float r,float w){return abs(length(p)-r)-w;}

mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

float scene(vec2 p){
  float t=u_time;
  float d=1e9;
  // rotating ring lattice
  for(int i=0;i<5;i++){
    float fi=float(i);
    float a=t*0.35+fi*1.2566+u_seed;
    vec2 c=rot(a)*vec2(0.35+0.08*sin(t*0.7+fi),0.0);
    d=min(d,sdRing(p-c,0.18+0.04*sin(t+fi),0.02));
    d=min(d,sdCircle(p-c*1.4,0.04+0.02*u_density));
  }
  // chaos-warped box field
  vec2 q=p*rot(t*0.15);
  q+=0.12*u_chaos*vec2(sin(q.y*4.+t),cos(q.x*4.-t));
  d=min(d,sdBox(q,vec2(0.22+0.08*u_density)));
  // soft metaball cluster
  float m=0.;
  for(int i=0;i<6;i++){
    float fi=float(i);
    vec2 c=vec2(sin(t*0.6+fi*1.7+u_seed),cos(t*0.5+fi*2.1))*0.45;
    m+=0.08/max(0.001,length(p-c));
  }
  d=min(d,0.25-m);
  return d;
}

vec3 hsl2rgb(vec3 c){
  vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return c.z+(c.y*(1.-abs(2.*c.z-1.)))*(rgb-.5);
}

void main(){
  vec2 uv=(gl_FragCoord.xy/u_res)*2.-1.;
  uv.x*=u_res.x/u_res.y;
  uv/=max(0.2,u_zoom);

  // cheap 2d "raymarch" / distance shade
  float d=scene(uv);
  float edge=smoothstep(0.02,0.0,d);
  float glow=exp(-8.*max(d,0.))*0.65;
  float fill=smoothstep(0.08, -0.02, d);

  float hue=fract(u_hue+u_time*0.02+edge*0.1);
  vec3 col=hsl2rgb(vec3(hue,0.55,0.08+fill*0.35+glow*0.4+edge*0.25));
  float rampT=clamp(glow+fill*0.6+edge*0.4,0.,1.);
  col=applyPieceColor(col,rampT);
  float vig=1.-dot(uv,uv)*0.25;
  col*=vig;
  vec3 bg=u_colorBg.rgb;
  if(u_colorBg.a<0.5) bg=vec3(0.02,0.02,0.03);
  col=mix(bg,col,clamp(col.r+col.g+col.b,0.,1.));
  o=vec4(col,1.0);
}`;

function compile(gl: WebGL2RenderingContext, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, FULLSCREEN_VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`sdf-raymarch2d: ${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`sdf-raymarch2d link: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export async function createSdfRaymarchLivePiece(
  gl: WebGL2RenderingContext,
  pieceId: string,
): Promise<LivePiece> {
  const prog = compile(gl, SDF_FRAG);
  const colorBinding = createColorGlBinding(gl);
  let colorConfig: ColorConfig = defaultColorConfig();
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  let seed = 42;
  const params: Record<string, number> = {
    density: 0.7,
    chaos: 0.3,
    zoom: 1,
    hue: 0.55,
    exposure: 1,
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

  return {
    id: pieceId,
    initialize(_recipe, s) {
      seed = s >>> 0;
      params.hue = 0.4 + ((seed % 1000) / 1000) * 0.3;
    },
    resize() {},
    update(frame) {
      last = frame;
    },
    setParameter(name, value) {
      if (typeof value === "number" && name in params) params[name] = value;
      if (name === "color.mode" && typeof value === "string") {
        colorConfig.mode = value as ColorConfig["mode"];
      }
      if (name === "color.rampMapping" && typeof value === "string") {
        colorConfig.rampMapping = value as ColorConfig["rampMapping"];
      }
    },
    setColorConfig(config: ColorConfig) {
      colorConfig = config;
    },
    getParameter(name) {
      return params[name];
    },
    getBaseParameters() {
      return { ...params };
    },
    getTelemetry(): LiveTelemetry {
      return { energy: 0.5, texture: params.density, motion: 0.7, spectral: params.chaos };
    },
    render(ctx: RenderContext) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.framebuffer);
      gl.viewport(0, 0, ctx.width, ctx.height);
      const bg = colorConfig.transparentBackground ? [0, 0, 0, 0] : [0.02, 0.02, 0.03, 1];
      gl.clearColor(bg[0]!, bg[1]!, bg[2]!, bg[3]!);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      bindColorUniforms(gl, prog, colorBinding, colorConfig);
      gl.uniform2f(loc("u_res"), ctx.width, ctx.height);
      gl.uniform1f(loc("u_time"), last.t);
      gl.uniform1f(loc("u_hue"), params.hue);
      gl.uniform1f(loc("u_chaos"), params.chaos);
      gl.uniform1f(loc("u_density"), params.density);
      gl.uniform1f(loc("u_zoom"), params.zoom);
      gl.uniform1f(loc("u_seed"), (seed % 10000) / 10000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        // Surface once via throw on first bad draw in debug paths; keep silent in steady state
        console.warn("sdf-raymarch2d WebGL error", err);
      }
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
