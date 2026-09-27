/**
 * Perceptual visual quality — detect "technically changing but visually dead" output.
 */

import { edgeEnergyFromGrid, type PixelFrame } from "./pixelMetrics";
import type { PerformanceDensity, PerformanceMotion } from "../studio/performance/catalog";

export type VisualQualityStatus =
  | "healthy"
  | "warming-up"
  | "paused"
  | "static"
  | "degenerate-dark"
  | "degenerate-flat"
  | "recovering"
  | "failed";

export type VisualQualitySnapshot = {
  meanLuminance: number;
  luminanceVariance: number;
  occupiedFraction: number;
  edgeEnergy: number;
  changedPixelFraction: number;
  secondsSinceMeaningfulMotion: number;
  status: VisualQualityStatus;
  reason: string;
};

export function snapshotFromFrame(frame: PixelFrame, pixels?: Uint8Array): Omit<VisualQualitySnapshot, "status" | "secondsSinceMeaningfulMotion" | "reason"> {
  const edgeEnergy =
    pixels && pixels.length >= frame.gridW * frame.gridH * 4
      ? edgeEnergyFromGrid(pixels, frame.gridW, frame.gridH)
      : frame.edgeEnergy > 0
        ? frame.edgeEnergy
        : Math.sqrt(Math.max(0, frame.luminanceVariance));
  return {
    meanLuminance: frame.meanLuminance,
    luminanceVariance: frame.luminanceVariance,
    occupiedFraction: frame.occupiedFraction,
    edgeEnergy,
    changedPixelFraction: frame.changedPixelFraction,
  };
}

type MotionProfile = { density: PerformanceDensity; motion: PerformanceMotion };

const DEFAULT_PROFILE: MotionProfile = { density: "medium", motion: "moderate" };

function minEdgeEnergy(profile: MotionProfile): number {
  if (profile.density === "dense" || profile.motion === "intense") return 4.5;
  if (profile.density === "sparse" || profile.motion === "calm") return 1.2;
  return 2.2;
}

function minVariance(profile: MotionProfile): number {
  if (profile.density === "dense" || profile.motion === "intense") return 35;
  if (profile.motion === "calm") return 8;
  return 18;
}

export function classifyVisualQuality(
  current: Omit<VisualQualitySnapshot, "status" | "secondsSinceMeaningfulMotion" | "reason">,
  profile: MotionProfile = DEFAULT_PROFILE,
  secondsSinceMotion: number,
  playing: boolean,
  warmupSec: number,
): VisualQualitySnapshot {
  if (!playing) {
    return { ...current, status: "paused", secondsSinceMeaningfulMotion: 0, reason: "" };
  }
  if (warmupSec < 2.5) {
    return { ...current, status: "warming-up", secondsSinceMeaningfulMotion: secondsSinceMotion, reason: "" };
  }

  const minEdge = minEdgeEnergy(profile);
  const minVar = minVariance(profile);
  const dark =
    current.meanLuminance < 6 &&
    current.luminanceVariance < minVar * 0.32 &&
    current.edgeEnergy < minEdge * 0.38 &&
    current.occupiedFraction > 0.88;
  const flat =
    current.luminanceVariance < minVar * 0.45 &&
    current.edgeEnergy < minEdge * 0.55 &&
    current.occupiedFraction > 0.85;

  if (dark) {
    return {
      ...current,
      status: "degenerate-dark",
      secondsSinceMeaningfulMotion: secondsSinceMotion,
      reason: `low structure: meanLum=${current.meanLuminance.toFixed(1)} var=${current.luminanceVariance.toFixed(1)} edge=${current.edgeEnergy.toFixed(2)}`,
    };
  }
  if (flat) {
    return {
      ...current,
      status: "degenerate-flat",
      secondsSinceMeaningfulMotion: secondsSinceMotion,
      reason: `flat field: var=${current.luminanceVariance.toFixed(1)} edge=${current.edgeEnergy.toFixed(2)}`,
    };
  }
  if (secondsSinceMotion >= 5 && current.changedPixelFraction < 0.002) {
    return {
      ...current,
      status: "static",
      secondsSinceMeaningfulMotion: secondsSinceMotion,
      reason: "no meaningful pixel motion",
    };
  }
  return { ...current, status: "healthy", secondsSinceMeaningfulMotion: secondsSinceMotion, reason: "" };
}

export function isPerceptuallyAlive(
  a: PixelFrame,
  b: PixelFrame,
  profile: MotionProfile = DEFAULT_PROFILE,
): boolean {
  const minEdge = minEdgeEnergy(profile);
  const edgeA =
    a.luminanceVariance > 0 ? Math.sqrt(a.luminanceVariance) : 0;
  const edgeB =
    b.luminanceVariance > 0 ? Math.sqrt(b.luminanceVariance) : 0;
  const temporal =
    b.changedPixelFraction >= 0.003 ||
    b.rmsDifference >= 2.5 ||
    b.digest !== a.digest;
  const strongMotion =
    b.changedPixelFraction >= 0.012 ||
    b.rmsDifference >= 5 ||
    (b.changedPixelFraction >= 0.006 && b.rmsDifference >= 3);
  const structural =
    Math.max(a.luminanceVariance, b.luminanceVariance) >=
      minVariance(profile) * (strongMotion ? 0.22 : 0.5) &&
    Math.max(edgeA, edgeB) >= minEdge * (strongMotion ? 0.3 : 0.45);
  return temporal && (structural || strongMotion);
}
