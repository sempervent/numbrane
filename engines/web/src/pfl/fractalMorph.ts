/**
 * Fractal Morph — chaotic IFS with swirl / spherical post-transforms, density accumulation.
 * Inspired by common r/generative fractal-flame workflows; not a clone of any single post.
 */

import { analyzeLuma, type LumaReport } from "./luma";
import { mulberry32 } from "./rng";
import type { VisualParams } from "./features";
import type { GenerativeArtwork } from "./generativeArtwork";

type Variation = {
  seed: number;
  label: string;
  symmetry: number;
  palette: [number, number, number];
  base: Float32Array;
  amp: Float32Array;
  weight: Float32Array;
  colorW: Float32Array;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class FractalMorphArtwork implements GenerativeArtwork {
  readonly id = "fractal-morph" as const;
  readonly name = "Fractal Morph";

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private bw = 1;
  private bh = 1;
  private bufR = new Float32Array(0);
  private bufG = new Float32Array(0);
  private bufB = new Float32Array(0);
  private image: ImageData | null = null;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private variation: Variation;
  private rng: () => number;
  private time = 0;
  private x = 0.12;
  private y = 0.08;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.offscreen = document.createElement("canvas");
    const oc = this.offscreen.getContext("2d");
    if (!oc) throw new Error("offscreen 2d missing");
    this.offCtx = oc;
    this.variation = variationFromSeed(seed);
    this.rng = mulberry32(seed);
    this.resize();
    this.clearDisplay();
    this.prime(90);
  }

  getSeed(): number {
    return this.variation.seed;
  }

  getVariationFacet(): string {
    return this.variation.label;
  }

  applyVariation(seed: number): void {
    this.variation = variationFromSeed(seed);
    this.rng = mulberry32(seed);
    this.time = 0;
    this.x = 0.1 + (seed % 97) * 0.002;
    this.y = 0.06 + (seed % 53) * 0.003;
    this.clearBuffers();
    this.clearDisplay();
    this.prime(110);
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
    const scale = this.w > 1400 ? 4 : 3;
    this.bw = Math.max(120, Math.floor(this.w / scale));
    this.bh = Math.max(68, Math.floor(this.h / scale));
    const n = this.bw * this.bh;
    this.bufR = new Float32Array(n);
    this.bufG = new Float32Array(n);
    this.bufB = new Float32Array(n);
    this.image = this.ctx.createImageData(this.bw, this.bh);
    this.offscreen.width = this.bw;
    this.offscreen.height = this.bh;
    this.clearBuffers();
    this.clearDisplay();
  }

  step(dtSec: number, params: VisualParams, timeSec?: number): void {
    const dt = clamp(dtSec, 0.001, 0.05);
    if (timeSec !== undefined) this.time = timeSec;
  else this.time += dt;

    const morph = 0.55 + params.motion * 0.35;
    const bassStretch = 1 + params.motion * 0.12 + params.impulse * 0.08;
    const detail = 0.85 + params.curl * 0.25 + params.shimmer * 0.2;
    const hueShift = params.hue * 0.35;

    const fade = 0.012 + params.trailFade * 0.014;
    for (let i = 0; i < this.bufR.length; i++) {
      this.bufR[i]! *= 1 - fade;
      this.bufG[i]! *= 1 - fade;
      this.bufB[i]! *= 1 - fade;
    }

    const density = 3800 + detail * 2400;
    const iter = Math.floor(density * clamp(dt * 60, 0.5, 1.2));

    const coeffs = evalCoeffs(this.variation, this.time, morph, bassStretch, hueShift, params);

    for (let n = 0; n < iter; n++) {
      let sumW = 0;
      const pick = this.rng();
      for (let k = 0; k < 5; k++) sumW += coeffs.weight[k]!;
      let t = pick * sumW;
      let idx = 0;
      for (; idx < 5; idx++) {
        t -= coeffs.weight[idx]!;
        if (t <= 0) break;
      }
      if (idx > 4) idx = 4;

      const px = this.x;
      const py = this.y;
      const swirl = coeffs.swirl[idx]! + params.curl * 0.4;
      const rad = Math.hypot(px, py) + 1e-6;
      const sn = Math.sin(swirl * rad + this.time * 0.7);
      const cs = Math.cos(swirl * rad + this.time * 0.7);
      let sx = px * cs - py * sn;
      let sy = px * sn + py * cs;
      const sph = coeffs.sphere[idx]!;
      const r2 = sx * sx + sy * sy + 1e-8;
      sx = (sx / r2) * sph;
      sy = (sy / r2) * sph;

      const a = coeffs.a[idx]!;
      const b = coeffs.b[idx]!;
      const c = coeffs.c[idx]!;
      const d = coeffs.d[idx]!;
      const e = coeffs.e[idx]!;
      const f = coeffs.f[idx]!;
      this.x = a * sx + b * sy + e;
      this.y = c * sx + d * sy + f;

      const sym = this.variation.symmetry;
      if (sym > 1) {
        const ang = Math.atan2(this.y, this.x);
        const mag = Math.hypot(this.x, this.y);
        const slice = (Math.PI * 2) / sym;
        const snap = Math.round(ang / slice) * slice;
        this.x = Math.cos(snap) * mag;
        this.y = Math.sin(snap) * mag;
      }

      const fx = (this.x + 1.35) / 2.7;
      const fy = (this.y + 1.35) / 2.7;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;

      const ix = fx * (this.bw - 1);
      const iy = fy * (this.bh - 1);
      const x0 = ix | 0;
      const y0 = iy | 0;
      const x1 = Math.min(this.bw - 1, x0 + 1);
      const y1 = Math.min(this.bh - 1, y0 + 1);
      const tx = ix - x0;
      const ty = iy - y0;

      const w = coeffs.weight[idx]! * (0.55 + params.lineWeight * 0.35);
      const cr = coeffs.colorR[idx]!;
      const cg = coeffs.colorG[idx]!;
      const cb = coeffs.colorB[idx]!;

      const add = (bx: number, by: number, f: number) => {
        const bi = by * this.bw + bx;
        this.bufR[bi]! += cr * w * f;
        this.bufG[bi]! += cg * w * f;
        this.bufB[bi]! += cb * w * f;
      };
      add(x0, y0, (1 - tx) * (1 - ty));
      add(x1, y0, tx * (1 - ty));
      add(x0, y1, (1 - tx) * ty);
      add(x1, y1, tx * ty);
    }

    if (params.impulse > 0.05) {
      const cx = this.bw * 0.5;
      const cy = this.bh * 0.5;
      const punch = params.impulse * 0.15;
      for (let by = 0; by < this.bh; by++) {
        for (let bx = 0; bx < this.bw; bx++) {
          const bi = by * this.bw + bx;
          const dx = (bx - cx) / this.bw;
          const dy = (by - cy) / this.bh;
          const fall = Math.max(0, 1 - Math.hypot(dx, dy) * 2.2);
          this.bufR[bi]! += punch * fall;
          this.bufG[bi]! += punch * fall * 0.7;
          this.bufB[bi]! += punch * fall * 0.45;
        }
      }
    }

    this.toneMapToCanvas();
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

  dispose(): void {}

  private clearBuffers(): void {
    this.bufR.fill(0);
    this.bufG.fill(0);
    this.bufB.fill(0);
  }

  private clearDisplay(): void {
    this.ctx.fillStyle = "#020308";
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private prime(frames: number): void {
    const ambient: VisualParams = {
      motion: 0.52,
      curl: 0.5,
      lineWeight: 0.55,
      shimmer: 0.36,
      impulse: 0,
      trailFade: 0.42,
      hue: 0,
    };
    for (let i = 0; i < frames; i++) {
      this.step(1 / 60, ambient, i / 60);
    }
  }

  private toneMapToCanvas(): void {
    if (!this.image) return;
    const data = this.image.data;
    let max = 1e-6;
    for (let i = 0; i < this.bufR.length; i++) {
      const m = Math.max(this.bufR[i]!, this.bufG[i]!, this.bufB[i]!);
      if (m > max) max = m;
    }
    const inv = 1 / Math.log(1 + max * 1.8);
    for (let i = 0; i < this.bufR.length; i++) {
      const o = i * 4;
      data[o] = tone(this.bufR[i]!, inv);
      data[o + 1] = tone(this.bufG[i]!, inv);
      data[o + 2] = tone(this.bufB[i]!, inv);
      data[o + 3] = 255;
    }
    this.offCtx.putImageData(this.image, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.drawImage(this.offscreen, 0, 0, this.w, this.h);
  }
}

function tone(v: number, inv: number): number {
  const t = Math.log(1 + Math.max(0, v) * 1.8) * inv;
  return Math.min(255, Math.floor(t * 255 * 1.02));
}

function variationFromSeed(seed: number): Variation {
  const rng = mulberry32(seed);
  const labels = ["filigree", "organism", "ember", "coral", "helix", "nebula"];
  const label = labels[seed % labels.length]!;
  const symmetry = 2 + Math.floor(rng() * 5);
  const palette: [number, number, number] = [
    0.55 + rng() * 0.45,
    0.35 + rng() * 0.5,
    0.45 + rng() * 0.45,
  ];
  const base = new Float32Array(40);
  const amp = new Float32Array(40);
  const weight = new Float32Array(5);
  const colorW = new Float32Array(15);
  for (let i = 0; i < 40; i++) {
    base[i] = rng() * 2 - 1;
    amp[i] = 0.08 + rng() * 0.22;
  }
  let ws = 0;
  for (let k = 0; k < 5; k++) {
    weight[k] = 0.15 + rng() * 0.35;
    ws += weight[k]!;
  }
  for (let k = 0; k < 5; k++) weight[k]! /= ws;
  for (let i = 0; i < 15; i++) colorW[i] = palette[i % 3]! * (0.7 + rng() * 0.55);
  return { seed, label, symmetry, palette, base, amp, weight, colorW };
}

type CoeffSet = {
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  d: Float32Array;
  e: Float32Array;
  f: Float32Array;
  weight: Float32Array;
  swirl: Float32Array;
  sphere: Float32Array;
  colorR: Float32Array;
  colorG: Float32Array;
  colorB: Float32Array;
};

function evalCoeffs(
  v: Variation,
  time: number,
  morph: number,
  stretch: number,
  hueShift: number,
  params: VisualParams,
): CoeffSet {
  const { base, amp } = v;
  const k = 5;
  const a = new Float32Array(k);
  const b = new Float32Array(k);
  const c = new Float32Array(k);
  const d = new Float32Array(k);
  const e = new Float32Array(k);
  const f = new Float32Array(k);
  const swirl = new Float32Array(k);
  const sphere = new Float32Array(k);
  const colorR = new Float32Array(k);
  const colorG = new Float32Array(k);
  const colorB = new Float32Array(k);
  const weight = new Float32Array(k);
  for (let i = 0; i < k; i++) {
    const ph = time * (0.35 + i * 0.07) + i * 1.7;
    const wob = Math.sin(ph) * morph;
    const wob2 = Math.cos(ph * 0.73) * morph;
    const o = i * 8;
    a[i] = base[o]! * stretch + amp[o]! * wob;
    b[i] = base[o + 1]! + amp[o + 1]! * wob2;
    c[i] = base[o + 2]! + amp[o + 2]! * wob;
    d[i] = base[o + 3]! * stretch + amp[o + 3]! * wob2;
    e[i] = base[o + 4]! * 0.35 + amp[o + 4]! * Math.sin(ph * 1.1);
    f[i] = base[o + 5]! * 0.35 + amp[o + 5]! * Math.cos(ph * 0.9);
    swirl[i] = 0.8 + base[o + 6]! * 1.2 + params.curl * 0.9;
    sphere[i] = 0.65 + Math.abs(base[o + 7]!) * 0.9 + params.shimmer * 0.25;
    colorR[i] = v.colorW[i * 3]! * (1 + hueShift);
    colorG[i] = v.colorW[i * 3 + 1]! * (1 + hueShift * 0.5);
    colorB[i] = v.colorW[i * 3 + 2]! * (1 + hueShift * 0.3);
    weight[i] = v.weight[i]! * (0.9 + params.shimmer * 0.15);
  }
  return { a, b, c, d, e, f, weight, swirl, sphere, colorR, colorG, colorB };
}
