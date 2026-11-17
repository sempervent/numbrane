/**
 * Flow Field No. 1 — seeded particle traces on Canvas 2D.
 */

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
};

export type FlowRendererOptions = {
  seed: number;
  maxParticles?: number;
};

export class FlowFieldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private seed: number;
  private particles: Particle[] = [];
  private w = 1;
  private h = 1;
  private dpr = 1;
  private time = 0;
  private fieldTime = 0;
  private maxParticles: number;
  private rng: () => number;

  constructor(canvas: HTMLCanvasElement, opts: FlowRendererOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.seed = opts.seed >>> 0;
    this.maxParticles = opts.maxParticles ?? 1400;
    this.rng = mulberry32(this.seed);
    initNoisePerm(this.seed);
    this.resize();
    this.spawnFull();
    this.paintBackground(1);
    this.drawTraces(0.85);
    for (let i = 0; i < 8; i++) {
      this.step(1 / 60, {
        motion: 0.35,
        curl: 0.45,
        lineWeight: 0.65,
        shimmer: 0.22,
        impulse: 0,
        trailFade: 0.09,
        hue: 0.55,
      });
    }
  }

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
    initNoisePerm(this.seed);
    this.rng = mulberry32(this.seed);
    this.spawnFull();
    this.paintBackground(1);
    this.drawTraces(0.35);
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
    this.maxParticles = Math.min(2200, Math.max(600, Math.floor(area / 900)));
    if (this.particles.length > this.maxParticles) {
      this.particles.length = this.maxParticles;
    } else {
      this.spawnToCount(this.maxParticles);
    }
  }

  /** Deterministic step — `timeSec` advances simulation clock. */
  step(dtSec: number, params: VisualParams, timeSec?: number): void {
    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    if (timeSec !== undefined) this.time = timeSec;
    else this.time += dt;

    this.fieldTime += dt * (0.35 + params.motion * 0.9);

    const fade = params.trailFade + params.shimmer * 0.02;
    this.paintBackground(fade);

    const curl = 1.4 + params.curl * 4.5 + params.impulse * 2.2;
    const speed = (0.35 + params.motion * 1.8 + params.impulse * 1.2) * dt;
    const weight = 0.4 + params.lineWeight * 1.6;

    for (const p of this.particles) {
      const nx = (p.x / this.w) * 2.8 + this.seed * 0.00001;
      const ny = (p.y / this.h) * 2.8 + this.seed * 0.00002;
      const n1 = fbm2(nx + this.fieldTime * 0.12, ny - this.fieldTime * 0.08, 4);
      const n2 = fbm2(nx * 1.3 - this.fieldTime * 0.07, ny * 1.3 + 0.5, 3);
      const angle = (n1 * Math.PI * curl + n2 * 0.8) + params.impulse * 0.4;
      const ax = Math.cos(angle) * speed * 55;
      const ay = Math.sin(angle) * speed * 55;
      const ox = p.x;
      const oy = p.y;
      p.vx = p.vx * 0.72 + ax;
      p.vy = p.vy * 0.72 + ay;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;

      if (p.x < -4 || p.x > this.w + 4 || p.y < -4 || p.y > this.h + 4 || p.age > 14) {
        this.respawn(p);
        continue;
      }

      const alpha = 0.08 + params.shimmer * 0.12 + weight * 0.06;
      const hue = (p.hue + params.hue * 60) % 360;
      const light = 52 + params.shimmer * 28;
      this.ctx.strokeStyle = `hsla(${hue}, 78%, ${light}%, ${alpha})`;
      this.ctx.lineWidth = weight * this.dpr;
      this.ctx.beginPath();
      this.ctx.moveTo(ox, oy);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    }
  }

  /** Sample mean luminance from center tile (tests). */
  sampleMeanLuma(grid = 32): number {
    const margin = Math.floor(Math.min(this.w, this.h) / grid);
    const img = this.ctx.getImageData(
      margin,
      margin,
      Math.max(1, this.w - 2 * margin),
      Math.max(1, this.h - 2 * margin),
    );
    const d = img.data;
    let sum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
    }
    return sum / Math.max(1, n);
  }

  private paintBackground(fade: number): void {
    this.ctx.fillStyle = `rgba(3, 5, 10, ${Math.min(0.22, Math.max(0.04, fade))})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawTraces(boost: number): void {
    for (let i = 0; i < 40; i++) {
      const p = this.particles[i];
      if (!p) continue;
      this.ctx.strokeStyle = `hsla(${(p.hue + 40) % 360}, 70%, 55%, ${0.15 * boost})`;
      this.ctx.lineWidth = 1.2 * this.dpr;
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.ctx.lineTo(p.x + 8, p.y + 4);
      this.ctx.stroke();
    }
  }

  private spawnFull(): void {
    this.particles = [];
    this.spawnToCount(this.maxParticles);
  }

  private spawnToCount(n: number): void {
    while (this.particles.length < n) {
      this.particles.push(this.makeParticle());
    }
  }

  private makeParticle(): Particle {
    return {
      x: this.rng() * this.w,
      y: this.rng() * this.h,
      vx: 0,
      vy: 0,
      age: this.rng() * 4,
      hue: 180 + this.rng() * 120,
    };
  }

  private respawn(p: Particle): void {
    p.x = this.rng() * this.w;
    p.y = this.rng() * this.h;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.hue = 160 + this.rng() * 140;
  }
}
