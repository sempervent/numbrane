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
  private snapTex!: WebGLTexture;
  private snapFbo!: WebGLFramebuffer;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blendProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texA"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texB"), 1);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_opacity"), 1);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_blend"), 0);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_progress"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawCameraPresent(camera: CameraView, tex: WebGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.cameraProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(this.cameraProg, "u_tex"), 0);
    gl.uniform4f(
      gl.getUniformLocation(this.cameraProg, "u_cam"),
      camera.centerX,
      camera.centerY,
      camera.scale,
      camera.rotation,
    );
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
    // Draw accum + layer -> accumB, then swap
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFboB);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blendProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texA"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texB"), 1);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_opacity"), opacity);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_blend"), BLEND_INDEX[blend] ?? 0);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_progress"), 0);
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.postProg);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(gl.getUniformLocation(this.postProg, "u_scene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTex);
    gl.uniform1i(gl.getUniformLocation(this.postProg, "u_feedback"), 1);
    gl.uniform2f(gl.getUniformLocation(this.postProg, "u_res"), this.w, this.h);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_exposure"), post.exposure ?? 1);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_contrast"), post.contrast ?? 1);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_saturation"), post.saturation ?? 1);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_hue"), post.hue_shift ?? 0);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_vignette"), post.vignette ?? 0.35);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_bloom"), post.bloom ?? 0.15);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_feedbackAmt"), post.feedback ?? 0.25);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_feedbackZoom"), post.feedback_zoom ?? 1.01);
    gl.uniform1f(
      gl.getUniformLocation(this.postProg, "u_feedbackRot"),
      post.feedback_rotation ?? 0,
    );
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_chromatic"), post.chromatic ?? 0);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_grain"), post.grain ?? 0.1);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_time"), t);
    gl.uniform1f(gl.getUniformLocation(this.postProg, "u_blackout"), blackout ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // copy out -> feedback for next frame
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFbo);
    gl.viewport(0, 0, this.w, this.h);
    // simple blit via blend normal
    gl.useProgram(this.blendProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texA"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texB"), 1);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_opacity"), 1);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_blend"), 0);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_progress"), 0);
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
        gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texA"), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.outTex);
        gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_texB"), 1);
        gl.uniform1f(gl.getUniformLocation(this.blendProg, "u_opacity"), 1);
        gl.uniform1i(gl.getUniformLocation(this.blendProg, "u_blend"), 0);
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
}
