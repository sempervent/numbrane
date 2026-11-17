/**
 * Block Lattice — recursive rectangular tessellation with isometric depth and breathing motion.
 * Geometric identity distinct from flow fields and fractal density maps.
 */

import { fbm2, initNoisePerm } from "./noise";
import { analyzeLuma, type LumaReport } from "./luma";
import { mulberry32 } from "./rng";
import type { VisualParams } from "./features";
import type { GenerativeArtwork } from "./generativeArtwork";

type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  hue: number;
  lit: number;
};

type LatticeVariation = {
  seed: number;
  rhythm: string;
  cols: number;
  rows: number;
  skew: number;
  lift: number;
  blocks: Block[];
};

export class BlockLatticeArtwork implements GenerativeArtwork {
  readonly id = "block-lattice" as const;
  readonly name = "Block Lattice";

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private variation: LatticeVariation;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.variation = buildLattice(seed);
    initNoisePerm(seed);
    this.resize();
    this.clear();
  }

  getSeed(): number {
    return this.variation.seed;
  }

  getVariationFacet(): string {
    return this.variation.rhythm;
  }

  applyVariation(seed: number): void {
    this.variation = buildLattice(seed);
    initNoisePerm(seed);
    this.time = 0;
    this.clear();
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
  }

  step(dtSec: number, params: VisualParams, timeSec?: number): void {
    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    if (timeSec !== undefined) this.time = timeSec;
    else this.time += dt;

    const breath = 0.55 + params.motion * 0.35;
    const deform = 0.5 + params.curl * 0.4 + params.impulse * 0.25;
    const accent = params.shimmer * 0.35 + params.lineWeight * 0.2;

    this.clear();

    const margin = Math.min(this.w, this.h) * 0.06;
    const cols = this.variation.cols;
    const rows = this.variation.rows;
    const cellW = (this.w - margin * 2) / cols;
    const cellH = (this.h - margin * 2) / rows;
    const skew = this.variation.skew;
    const lift = this.variation.lift * this.dpr;

    const sorted = [...this.variation.blocks].sort((a, b) => a.depth - b.depth);

    for (const b of sorted) {
      const nx = (b.x + 0.5) / cols;
      const ny = (b.y + 0.5) / rows;
      const wave =
        Math.sin(this.time * (0.9 + deform * 0.4) + nx * 5.2 + ny * 4.1) * breath * 0.35;
      const ripple =
        params.impulse > 0.05
          ? Math.sin(this.time * 8 - Math.hypot(nx - 0.5, ny - 0.5) * 14) *
            params.impulse *
            0.4
          : 0;
      const noise = fbm2(nx * 2.2, ny * 2.2 + this.time * 0.15, 3) * 0.25;
      const elev = (b.depth + wave + ripple + noise) * lift;

      const gx = margin + b.x * cellW;
      const gy = margin + b.y * cellH;
      const bw = b.w * cellW - 2 * this.dpr;
      const bh = b.h * cellH - 2 * this.dpr;

      const ox = skew * elev * 0.6;
      const oy = -elev * 1.1;

      const hue = (b.hue + params.hue * 40 + this.time * 6) % 360;
      const topLit = b.lit + accent * 25 + elev * 8;
      const sideLit = topLit - 18;
      const frontLit = topLit - 10;

      this.ctx.fillStyle = `hsl(${hue}, 72%, ${clampLit(sideLit - 12)}%)`;
      this.ctx.beginPath();
      this.ctx.moveTo(gx, gy + bh);
      this.ctx.lineTo(gx + bw, gy + bh);
      this.ctx.lineTo(gx + bw + ox, gy + bh + oy);
      this.ctx.lineTo(gx + ox, gy + oy + bh);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = `hsl(${(hue + 12) % 360}, 68%, ${clampLit(frontLit - 8)}%)`;
      this.ctx.beginPath();
      this.ctx.moveTo(gx + bw, gy);
      this.ctx.lineTo(gx + bw + ox, gy + oy);
      this.ctx.lineTo(gx + bw + ox, gy + bh + oy);
      this.ctx.lineTo(gx + bw, gy + bh);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = `hsl(${(hue + 28) % 360}, 78%, ${clampLit(topLit)}%)`;
      this.ctx.fillRect(gx + ox, gy + oy, bw, bh);

      if (accent > 0.15) {
        this.ctx.strokeStyle = `hsla(${(hue + 50) % 360}, 90%, 82%, ${0.08 + accent * 0.12})`;
        this.ctx.lineWidth = this.dpr;
        this.ctx.strokeRect(gx + ox + 1, gy + oy + 1, bw - 2, bh - 2);
      }
    }
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

  private clear(): void {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "#06080f");
    g.addColorStop(1, "#020306");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }
}

function clampLit(v: number): number {
  return Math.min(82, Math.max(22, v));
}

function buildLattice(seed: number): LatticeVariation {
  const rng = mulberry32(seed);
  const rhythms = ["metro", "cantilever", "stagger", "terraced", "woven"];
  const rhythm = rhythms[seed % rhythms.length]!;
  const cols = 10 + Math.floor(rng() * 6);
  const rows = 7 + Math.floor(rng() * 5);
  const skew = 0.35 + rng() * 0.55;
  const lift = 6 + rng() * 14;
  const blocks: Block[] = [];

  const occupy = new Uint8Array(cols * rows);
  const tryPlace = (x: number, y: number, w: number, h: number): boolean => {
    if (x + w > cols || y + h > rows) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (occupy[(y + dy) * cols + (x + dx)]!) return false;
      }
    }
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) occupy[(y + dy) * cols + (x + dx)] = 1;
    }
    return true;
  };

  const sizes =
    rhythm === "woven"
      ? ([
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ] as [number, number][])
      : ([
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
          [3, 1],
          [1, 3],
        ] as [number, number][]);

  let guard = 0;
  while (guard < 800) {
    guard++;
    const bw = sizes[Math.floor(rng() * sizes.length)]!;
    const x = Math.floor(rng() * cols);
    const y = Math.floor(rng() * rows);
    if (!tryPlace(x, y, bw[0]!, bw[1]!)) continue;
    const depth = 0.25 + rng() * 0.85;
    const hue = 180 + rng() * 160 + (seed % 37);
    const lit = 38 + rng() * 28;
    blocks.push({ x, y, w: bw[0]!, h: bw[1]!, depth, hue, lit });
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupy[y * cols + x]) {
        const depth = 0.15 + rng() * 0.35;
        blocks.push({
          x,
          y,
          w: 1,
          h: 1,
          depth,
          hue: 200 + rng() * 90,
          lit: 32 + rng() * 18,
        });
        occupy[y * cols + x] = 1;
      }
    }
  }

  return { seed, rhythm, cols, rows, skew, lift, blocks };
}
