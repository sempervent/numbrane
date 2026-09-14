/**
 * LATTICEFALL telemetry producers (NAP energy / texture / motion / spectral).
 *
 * All outputs are clamped to [0, 1].
 *
 * - energy: mean particle speed + mean |field| proxy from energy channel
 * - motion: mean |Δposition| vs previous frame + directional variance
 * - texture: spatial density variance of particles in a coarse grid
 * - spectral: blend of geometry node count proxy + fractal pressure
 */

import type { PhaseSnapshot } from "./phases";

export type LatticefallTelemetry = {
  energy: number;
  texture: number;
  motion: number;
  spectral: number;
};

const FLOATS = 9;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export type TelemetryPrev = {
  xs: Float32Array;
  ys: Float32Array;
};

export function emptyPrev(count: number): TelemetryPrev {
  return {
    xs: new Float32Array(count),
    ys: new Float32Array(count),
  };
}

/**
 * Compute telemetry from particle buffer layout:
 * [id, x, y, vx, vy, age, lifetime, energy, source_node] × N
 */
export function computeTelemetry(
  buffer: Float32Array,
  count: number,
  prev: TelemetryPrev,
  phase: PhaseSnapshot,
  fieldMeanMag: number,
): { telemetry: LatticefallTelemetry; next: TelemetryPrev } {
  const n = Math.max(1, count);
  let speedSum = 0;
  let energySum = 0;
  let dispSum = 0;
  let dxSum = 0;
  let dySum = 0;

  const grid = 8;
  const bins = new Float32Array(grid * grid);

  const nextXs = new Float32Array(n);
  const nextYs = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * FLOATS;
    const x = buffer[o + 1] ?? 0;
    const y = buffer[o + 2] ?? 0;
    const vx = buffer[o + 3] ?? 0;
    const vy = buffer[o + 4] ?? 0;
    const energy = buffer[o + 7] ?? 0;
    speedSum += Math.hypot(vx, vy);
    energySum += energy;

    const px = prev.xs[i] ?? x;
    const py = prev.ys[i] ?? y;
    const ddx = x - px;
    const ddy = y - py;
    dispSum += Math.hypot(ddx, ddy);
    dxSum += ddx;
    dySum += ddy;

    nextXs[i] = x;
    nextYs[i] = y;

    // Map world ≈ [-2,2] → grid
    const gx = Math.min(grid - 1, Math.max(0, Math.floor(((x + 2) / 4) * grid)));
    const gy = Math.min(grid - 1, Math.max(0, Math.floor(((y + 2) / 4) * grid)));
    bins[gy * grid + gx]! += 1;
  }

  const meanSpeed = speedSum / n;
  const meanEnergy = energySum / n;
  const meanDisp = dispSum / n;
  const meanDx = dxSum / n;
  const meanDy = dySum / n;

  let dirVar = 0;
  for (let i = 0; i < n; i++) {
    const o = i * FLOATS;
    const x = buffer[o + 1] ?? 0;
    const y = buffer[o + 2] ?? 0;
    const px = prev.xs[i] ?? x;
    const py = prev.ys[i] ?? y;
    const ddx = x - px - meanDx;
    const ddy = y - py - meanDy;
    dirVar += ddx * ddx + ddy * ddy;
  }
  dirVar = Math.sqrt(dirVar / n);

  let binMean = 0;
  for (let i = 0; i < bins.length; i++) binMean += bins[i]!;
  binMean /= bins.length;
  let binVar = 0;
  for (let i = 0; i < bins.length; i++) {
    const d = bins[i]! - binMean;
    binVar += d * d;
  }
  binVar = Math.sqrt(binVar / bins.length) / Math.max(1, n / bins.length);

  const energy = clamp01(
    0.55 * Math.tanh(meanSpeed * 1.8) +
      0.25 * Math.tanh(meanEnergy) +
      0.2 * Math.tanh(fieldMeanMag * 0.8) * phase.fieldVisibility,
  );
  const motion = clamp01(
    0.65 * Math.tanh(meanDisp * 12) + 0.35 * Math.tanh(dirVar * 8),
  );
  const texture = clamp01(binVar * phase.particleActivity + phase.fieldVisibility * 0.15);
  const spectral = clamp01(
    0.4 * phase.fractalPressure +
      0.35 * phase.geometryClarity * 0.5 +
      0.25 * Math.tanh(fieldMeanMag),
  );

  return {
    telemetry: { energy, texture, motion, spectral },
    next: { xs: nextXs, ys: nextYs },
  };
}
