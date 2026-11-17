/**
 * Flow Field No. 1 — luminous multi-layer streamlines (Canvas 2D).
 */

import { compositionFromSeed, type CompositionBundle } from "./composition";
import { analyzeLuma, type LumaReport } from "./luma";
import { fbm2, initNoisePerm } from "./noise";
import { mulberry32 } from "./rng";
import type { VisualParams } from "./features";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  hue: number;
  layer: 0 | 1;
};

export type FlowRendererOptions = {
  seed: number;
};

export class FlowFieldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private composition: CompositionBundle;
  private particles: Particle[] = [];
  private w = 1;
  private h = 1;
  private dpr = 1;
  private time = 0;
  private fieldTime = 0;
  private rng: () => number;
  private maxParticles = 1400;

  constructor(canvas: HTMLCanvasElement, opts: FlowRendererOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.composition = compositionFromSeed(opts.seed);
    this.rng = mulberry32(this.composition.seed);
    initNoisePerm(this.composition.seed);
    this.resize();
    this.clearArtwork();
    this.spawnFull();
    this.primeFrames(72);
  }

  getSeed(): number {
    return this.composition.seed;
  }

  getArchetype(): string {
    return this.composition.archetype;
  }

  applyVariation(seed: number): void {
    this.composition = compositionFromSeed(seed);
    this.rng = mulberry32(this.composition.seed);
    initNoisePerm(this.composition.seed);
    this.fieldTime = 0;
    this.time = 0;
    this.clearArtwork();
    this.spawnFull();
    this.primeFrames(96);
  }

  get logicalTime(): number {
    return this.time;
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const cssW = Math.max(1, rect?.width ?? window.innerWidth);
    const cssH = Math.max(1, rect?.height ?? window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.floor(cssW * this.dpr);
    this.h = Math.floor(cssH * this.dpr);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const area = this.w * this.h;
    this.maxParticles = Math.min(2800, Math.max(900, Math.floor(area / 650)));
    this.spawnFull();
  }

  step(dtSec: number, params: VisualParams, timeSec?: number): void {
    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    if (timeSec !== undefined) this.time = timeSec;
    else this.time += dt;

    const comp = this.composition;
    const motion = 0.85 + params.motion * 0.55;
    const curl = comp.curlGain * (0.75 + params.curl * 0.65 + params.impulse * 0.45);
    const trailFade = comp.trailFade + params.trailFade * 0.012 - params.impulse * 0.004;
    this.fieldTime += dt * comp.fieldDrift * motion;

    this.paintBackground(Math.min(0.065, Math.max(0.018, trailFade)));

    const prevComp = this.ctx.globalCompositeOperation;
    this.ctx.globalCompositeOperation = "lighter";

    for (const p of this.particles) {
      const speedMul = p.layer === 0 ? comp.macroSpeed : comp.mesoSpeed;
      const angle = this.fieldAngle(p.x, p.y, curl, comp);
      const speed = (38 + speedMul * 42) * dt * (0.7 + params.motion * 0.5 + params.impulse * 0.35);
      const ax = Math.cos(angle) * speed;
      const ay = Math.sin(angle) * speed;
      const ox = p.x;
      const oy = p.y;
      p.vx = p.vx * 0.78 + ax;
      p.vy = p.vy * 0.78 + ay;
      p.x += p.vx;
      p.y += p.vy;
      p.age += dt;

      const maxAge = p.layer === 0 ? 22 : 16;
      if (p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20 || p.age > maxAge) {
        this.respawn(p);
        continue;
      }

      const pal = comp.palette;
      const huePick = pal.hues[p.layer === 0 ? 0 : 1 + (p.hue % 2)];
      const hue = (huePick + params.hue * 24 + p.hue * 0.04) % 360;
      const litBase = pal.lit[p.layer]!;
      const lightness = litBase + params.shimmer * 8 + params.impulse * 6;
      const alphaBase = p.layer === 0 ? comp.macroAlpha : comp.mesoAlpha;
      const alpha = Math.min(0.72, alphaBase + params.lineWeight * 0.08 + params.shimmer * 0.06);
      const width =
        (p.layer === 0 ? comp.macroWidth : comp.mesoWidth) *
        this.dpr *
        (0.85 + params.lineWeight * 0.35);

      this.ctx.strokeStyle = `hsla(${hue}, ${pal.sat}%, ${lightness}%, ${alpha})`;
      this.ctx.lineWidth = width;
      this.ctx.beginPath();
      this.ctx.moveTo(ox, oy);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    }

    this.ctx.globalCompositeOperation = prevComp;
  }

  sampleMeanLuma(): number {
    return this.sampleLumaReport().mean;
  }

  sampleLumaReport(): LumaReport {
    const margin = Math.floor(Math.min(this.w, this.h) * 0.04);
    const img = this.ctx.getImageData(
      margin,
      margin,
      Math.max(1, this.w - 2 * margin),
      Math.max(1, this.h - 2 * margin),
    );
    return analyzeLuma(img.data, 3);
  }

  captureFullFrame(): ImageData {
    return this.ctx.getImageData(0, 0, this.w, this.h);
  }

  private fieldAngle(x: number, y: number, curl: number, comp: CompositionBundle): number {
    const u = (x / this.w) * comp.fieldScale + this.fieldTime * 0.14;
    const v = (y / this.h) * comp.fieldScale - this.fieldTime * 0.11;
    const eps = 0.018;
    const nxp = fbm2(u + eps, v, 4);
    const nxm = fbm2(u - eps, v, 4);
    const nyp = fbm2(u, v + eps, 4);
    const nym = fbm2(u, v - eps, 4);
    let angle = Math.atan2(nyp - nym, nxp - nxm) * curl;

    if (comp.archetype === "vortex") {
      const ax = comp.attractorX * this.w;
      const ay = comp.attractorY * this.h;
      const dx = x - ax;
      const dy = y - ay;
      const tang = Math.atan2(dy, dx) + Math.PI / 2;
      const dist = Math.hypot(dx, dy) / Math.max(this.w, this.h);
      angle = angle * 0.45 + tang * (1.1 - dist * 0.8);
    } else if (comp.archetype === "river") {
      angle = angle * 0.55 + comp.flowBias;
    } else if (comp.archetype === "bloom") {
      const ax = comp.attractorX * this.w;
      const ay = comp.attractorY * this.h;
      const outward = Math.atan2(y - ay, x - ax);
      angle = angle * 0.5 + outward * 0.85;
    } else if (comp.archetype === "weave") {
      const wave = Math.sin(u * 3.2 + v * 2.1 + this.fieldTime) * 0.9;
      angle += wave;
    }

    return angle;
  }

  private clearArtwork(): void {
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.fillStyle = "#030508";
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private paintBackground(fade: number): void {
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.fillStyle = `rgba(3, 5, 8, ${fade})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private primeFrames(n: number): void {
    const ambient: VisualParams = {
      motion: 0.55,
      curl: 0.55,
      lineWeight: 0.6,
      shimmer: 0.35,
      impulse: 0,
      trailFade: 0.5,
      hue: 0,
    };
    for (let i = 0; i < n; i++) {
      this.step(1 / 60, ambient, i / 60);
    }
  }

  private spawnFull(): void {
    const comp = this.composition;
    const macroN = Math.floor(this.maxParticles * comp.macroCount);
    const mesoN = this.maxParticles - macroN;
    this.particles = [];
    for (let i = 0; i < macroN; i++) this.particles.push(this.makeParticle(0));
    for (let i = 0; i < mesoN; i++) this.particles.push(this.makeParticle(1));
  }

  private makeParticle(layer: 0 | 1): Particle {
    const comp = this.composition;
    let x = this.rng() * this.w;
    let y = this.rng() * this.h;
    if (comp.archetype === "vortex" || comp.archetype === "bloom") {
      const ax = comp.attractorX * this.w;
      const ay = comp.attractorY * this.h;
      const r = comp.spawnCluster * Math.min(this.w, this.h) * (0.4 + this.rng() * 1.4);
      const t = this.rng() * Math.PI * 2;
      x = ax + Math.cos(t) * r;
      y = ay + Math.sin(t) * r;
    } else if (comp.archetype === "river") {
      const band = Math.floor(this.rng() * 5);
      y = ((band + 0.2 + this.rng() * 0.6) / 5) * this.h;
      x = this.rng() * this.w;
    }
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      age: this.rng() * 3,
      hue: this.rng() * 360,
      layer,
    };
  }

  private respawn(p: Particle): void {
    const fresh = this.makeParticle(p.layer);
    p.x = fresh.x;
    p.y = fresh.y;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.hue = fresh.hue;
  }
}
