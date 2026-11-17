/**
 * Multi-layer WebGL compositor with blend modes, feedback, and post FX.
 */

import { loadShader } from "../gl";
import type { CameraView } from "../studio/animation/spec";
import type { BlendMode, PostDef } from "./types";

const BLEND_INDEX: Record<BlendMode, number> = {
  normal: 0,
  add: 1,
  multiply: 2,
  screen: 3,
  difference: 4,
  lighten: 5,
  darken: 6,
};

type BlendLocs = {
  texA: WebGLUniformLocation | null;
  texB: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  blend: WebGLUniformLocation | null;
  progress: WebGLUniformLocation | null;
};

type PostLocs = {
  scene: WebGLUniformLocation | null;
  feedback: WebGLUniformLocation | null;
  res: WebGLUniformLocation | null;
  exposure: WebGLUniformLocation | null;
  contrast: WebGLUniformLocation | null;
  saturation: WebGLUniformLocation | null;
  hue: WebGLUniformLocation | null;
  vignette: WebGLUniformLocation | null;
  bloom: WebGLUniformLocation | null;
  feedbackAmt: WebGLUniformLocation | null;
  feedbackZoom: WebGLUniformLocation | null;
  feedbackRot: WebGLUniformLocation | null;
  chromatic: WebGLUniformLocation | null;
  grain: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  blackout: WebGLUniformLocation | null;
};

type CameraLocs = {
  tex: WebGLUniformLocation | null;
  cam: WebGLUniformLocation | null;
};

function createTex(gl: WebGL2RenderingContext, w: number, h: number, alpha: boolean): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    alpha ? gl.RGBA8 : gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function createFbo(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return f;
}

async function compile(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragName: string,
): Promise<WebGLProgram> {
  const fragSrc = await loadShader(fragName);
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vertSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`${fragName}: ${gl.getShaderInfoLog(fs)}`);
  }
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link ${fragName}: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

function cacheBlendLocs(gl: WebGL2RenderingContext, prog: WebGLProgram): BlendLocs {
  return {
    texA: gl.getUniformLocation(prog, "u_texA"),
    texB: gl.getUniformLocation(prog, "u_texB"),
    opacity: gl.getUniformLocation(prog, "u_opacity"),
    blend: gl.getUniformLocation(prog, "u_blend"),
    progress: gl.getUniformLocation(prog, "u_progress"),
  };
}

function cachePostLocs(gl: WebGL2RenderingContext, prog: WebGLProgram): PostLocs {
  return {
    scene: gl.getUniformLocation(prog, "u_scene"),
    feedback: gl.getUniformLocation(prog, "u_feedback"),
    res: gl.getUniformLocation(prog, "u_res"),
    exposure: gl.getUniformLocation(prog, "u_exposure"),
    contrast: gl.getUniformLocation(prog, "u_contrast"),
    saturation: gl.getUniformLocation(prog, "u_saturation"),
    hue: gl.getUniformLocation(prog, "u_hue"),
    vignette: gl.getUniformLocation(prog, "u_vignette"),
    bloom: gl.getUniformLocation(prog, "u_bloom"),
    feedbackAmt: gl.getUniformLocation(prog, "u_feedbackAmt"),
    feedbackZoom: gl.getUniformLocation(prog, "u_feedbackZoom"),
    feedbackRot: gl.getUniformLocation(prog, "u_feedbackRot"),
    chromatic: gl.getUniformLocation(prog, "u_chromatic"),
    grain: gl.getUniformLocation(prog, "u_grain"),
    time: gl.getUniformLocation(prog, "u_time"),
    blackout: gl.getUniformLocation(prog, "u_blackout"),
  };
}

function cacheCameraLocs(gl: WebGL2RenderingContext, prog: WebGLProgram): CameraLocs {
  return {
    tex: gl.getUniformLocation(prog, "u_tex"),
    cam: gl.getUniformLocation(prog, "u_cam"),
  };
}

export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private w = 1;
  private h = 1;
  private layerTex!: WebGLTexture;
  private layerFbo!: WebGLFramebuffer;
  private accumTex!: WebGLTexture;
  private accumFbo!: WebGLFramebuffer;
  private accumTexB!: WebGLTexture;
  private accumFboB!: WebGLFramebuffer;
  private feedbackTex!: WebGLTexture;
  private feedbackFbo!: WebGLFramebuffer;
  private outTex!: WebGLTexture;
  private outFbo!: WebGLFramebuffer;
  private blendProg!: WebGLProgram;
  private postProg!: WebGLProgram;
  private cameraProg!: WebGLProgram;
  private blendLocs!: BlendLocs;
  private postLocs!: PostLocs;
  private cameraLocs!: CameraLocs;
  private snapTex!: WebGLTexture;
  private snapFbo!: WebGLFramebuffer;
  private digestTex: WebGLTexture | null = null;
  private digestFbo: WebGLFramebuffer | null = null;
  private digestW = 0;
  private digestH = 0;
  private quadVao!: WebGLVertexArrayObject;
  private ready = false;
  transparent = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 required for NUMBRANE LIVE");
    this.gl = gl;
  }

  async init(): Promise<void> {
    const gl = this.gl;
    const vert = await loadShader("live_quad.vert");
    this.blendProg = await compile(gl, vert, "live_blend.frag");
    this.postProg = await compile(gl, vert, "live_post.frag");
    this.cameraProg = await compile(gl, vert, "live_camera.frag");
    this.blendLocs = cacheBlendLocs(gl, this.blendProg);
    this.postLocs = cachePostLocs(gl, this.postProg);
    this.cameraLocs = cacheCameraLocs(gl, this.cameraProg);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.resize(1280, 720);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  resize(width: number, height: number): void {
    const gl = this.gl;
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    const rebuild = (oldT?: WebGLTexture, oldF?: WebGLFramebuffer) => {
      if (oldT) gl.deleteTexture(oldT);
      if (oldF) gl.deleteFramebuffer(oldF);
    };
    rebuild(this.layerTex, this.layerFbo);
    rebuild(this.accumTex, this.accumFbo);
    rebuild(this.accumTexB, this.accumFboB);
    rebuild(this.feedbackTex, this.feedbackFbo);
    rebuild(this.outTex, this.outFbo);
    rebuild(this.snapTex, this.snapFbo);

    this.layerTex = createTex(gl, this.w, this.h, true);
    this.layerFbo = createFbo(gl, this.layerTex);
    this.accumTex = createTex(gl, this.w, this.h, true);
    this.accumFbo = createFbo(gl, this.accumTex);
    this.accumTexB = createTex(gl, this.w, this.h, true);
    this.accumFboB = createFbo(gl, this.accumTexB);
    this.feedbackTex = createTex(gl, this.w, this.h, true);
    this.feedbackFbo = createFbo(gl, this.feedbackTex);
    this.outTex = createTex(gl, this.w, this.h, true);
    this.outFbo = createFbo(gl, this.outTex);
    this.snapTex = createTex(gl, this.w, this.h, true);
    this.snapFbo = createFbo(gl, this.snapTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Copy post-processed output into frozen source snapshot (camera-only pan/zoom). */
  capturePresentationSnapshot(): void {
    const gl = this.gl;
    const L = this.blendLocs;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blendProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texB, 1);
    gl.uniform1f(L.opacity, 1);
    gl.uniform1i(L.blend, 0);
    gl.uniform1f(L.progress, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawCameraPresent(camera: CameraView, tex: WebGLTexture): void {
    const gl = this.gl;
    const C = this.cameraLocs;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.cameraProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(C.tex, 0);
    gl.uniform4f(C.cam, camera.centerX, camera.centerY, camera.scale, camera.rotation);
    gl.clearColor(0, 0, 0, this.transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  getLayerTarget(): { framebuffer: WebGLFramebuffer; width: number; height: number } {
    return { framebuffer: this.layerFbo, width: this.w, height: this.h };
  }

  beginFrame(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo);
    gl.viewport(0, 0, this.w, this.h);
    if (this.transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(0.01, 0.01, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Composite current layer texture onto accum with blend/opacity. */
  compositeLayer(blend: BlendMode, opacity: number): void {
    const gl = this.gl;
    const L = this.blendLocs;
    // Draw accum + layer -> accumB, then swap
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFboB);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blendProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(L.texA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.uniform1i(L.texB, 1);
    gl.uniform1f(L.opacity, opacity);
    gl.uniform1i(L.blend, BLEND_INDEX[blend] ?? 0);
    gl.uniform1f(L.progress, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // swap
    const t = this.accumTex;
    const f = this.accumFbo;
    this.accumTex = this.accumTexB;
    this.accumFbo = this.accumFboB;
    this.accumTexB = t;
    this.accumFboB = f;
  }

  endFrame(
    post: PostDef,
    blackout: boolean,
    t: number,
    drawToScreen = true,
    camera: CameraView | null = null,
    presentFromSnapshot = false,
  ): void {
    if (presentFromSnapshot && camera && drawToScreen) {
      this.drawCameraPresent(camera, this.snapTex);
      return;
    }
    const gl = this.gl;
    const P = this.postLocs;
    const L = this.blendLocs;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.postProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(P.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTex);
    gl.uniform1i(P.feedback, 1);
    gl.uniform2f(P.res, this.w, this.h);
    gl.uniform1f(P.exposure, post.exposure ?? 1);
    gl.uniform1f(P.contrast, post.contrast ?? 1);
    gl.uniform1f(P.saturation, post.saturation ?? 1);
    gl.uniform1f(P.hue, post.hue_shift ?? 0);
    gl.uniform1f(P.vignette, post.vignette ?? 0);
    gl.uniform1f(P.bloom, post.bloom ?? 0.15);
    gl.uniform1f(P.feedbackAmt, post.feedback ?? 0.25);
    gl.uniform1f(P.feedbackZoom, post.feedback_zoom ?? 1.01);
    gl.uniform1f(P.feedbackRot, post.feedback_rotation ?? 0);
    gl.uniform1f(P.chromatic, post.chromatic ?? 0);
    gl.uniform1f(P.grain, post.grain ?? 0.1);
    gl.uniform1f(P.time, t);
    gl.uniform1f(P.blackout, blackout ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // copy out -> feedback for next frame
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFbo);
    gl.viewport(0, 0, this.w, this.h);
    // simple blit via blend normal
    gl.useProgram(this.blendProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texB, 1);
    gl.uniform1f(L.opacity, 1);
    gl.uniform1i(L.blend, 0);
    gl.uniform1f(L.progress, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (drawToScreen) {
      if (camera) {
        this.drawCameraPresent(camera, this.outTex);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(this.blendProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.outTex);
        gl.uniform1i(L.texA, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.outTex);
        gl.uniform1i(L.texB, 1);
        gl.uniform1f(L.opacity, 1);
        gl.uniform1i(L.blend, 0);
        gl.clearColor(0, 0, 0, this.transparent ? 0 : 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindVertexArray(null);
  }

  resetFeedback(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Downsample the presented output into a tiny FBO and read only that.
   * Avoids full-framebuffer readPixels (multi-MB sync GPU→CPU) on the hot path.
   */
  readOutputPixels(gridW: number, gridH: number, into?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const w = Math.max(1, gridW | 0);
    const h = Math.max(1, gridH | 0);
    if (!this.digestTex || !this.digestFbo || this.digestW !== w || this.digestH !== h) {
      if (this.digestTex) gl.deleteTexture(this.digestTex);
      if (this.digestFbo) gl.deleteFramebuffer(this.digestFbo);
      this.digestTex = createTex(gl, w, h, true);
      this.digestFbo = createFbo(gl, this.digestTex);
      this.digestW = w;
      this.digestH = h;
    }
    const L = this.blendLocs;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.digestFbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blendProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(L.texB, 1);
    gl.uniform1f(L.opacity, 1);
    gl.uniform1i(L.blend, 0);
    gl.uniform1f(L.progress, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const need = w * h * 4;
    const raw = into && into.length >= need ? into : new Uint8Array(need);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return raw.length === need ? raw : raw.subarray(0, need);
  }
}
