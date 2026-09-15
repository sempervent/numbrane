/**
 * Piece-specific REACT audio profiles with sensitivity scaling.
 */

import type { AudioMapping } from "../audio/mappings";

export type ReactSensitivity = "subtle" | "balanced" | "aggressive";

const SENSITIVITY_SCALE: Record<ReactSensitivity, number> = {
  subtle: 0.38,
  balanced: 0.85,
  aggressive: 1.35,
};

/** Soft noise-floor: amounts below this feature level contribute little. */
export const AUDIO_NOISE_FLOOR = 0.055;

const PROFILES: Record<string, AudioMapping[]> = {
  "reaction-diffusion/reaction-diffusion": [
    { source: "energy", target: "f", amount: 0.008, curve: "ease" },
    { source: "low", target: "f", amount: 0.005, curve: "ease" },
    { source: "high", target: "k", amount: 0.006, curve: "ease" },
    { source: "onset", target: "chaos", amount: 0.14 },
    { source: "energy", target: "density", amount: 0.12, curve: "ease" },
  ],
  "growth/slime-mold": [
    { source: "low", target: "stepSize", amount: 0.22, curve: "ease" },
    { source: "mid", target: "sensorDistance", amount: 0.2, curve: "ease" },
    { source: "high", target: "sensorAngle", amount: 0.18, curve: "ease" },
    { source: "flux", target: "turnRate", amount: 0.12, curve: "ease" },
    { source: "onset", target: "deposit", amount: 0.22 },
  ],
  "particles/noodles": [
    { source: "energy", target: "flow", amount: 0.26, curve: "ease" },
    { source: "low", target: "density", amount: 0.2, curve: "ease" },
    { source: "centroid", target: "curl", amount: 0.22, curve: "ease" },
    { source: "onset", target: "chaos", amount: 0.16 },
  ],
  "growth/differential-growth": [
    { source: "energy", target: "growth_rate", amount: 0.22, curve: "ease" },
    { source: "low", target: "chaos", amount: 0.14, curve: "ease" },
    { source: "onset", target: "density", amount: 0.18 },
    { source: "centroid", target: "hue", amount: 0.08, curve: "ease" },
  ],
  "flagship/latticefall": [
    { source: "energy", target: "density", amount: 0.26, curve: "ease" },
    { source: "low", target: "chaos", amount: 0.18, curve: "ease" },
    { source: "onset", target: "exposure", amount: 0.26 },
    { source: "flux", target: "zoom", amount: 0.1, curve: "ease" },
  ],
};

export function reactProfileForPiece(pieceId: string): AudioMapping[] {
  if (PROFILES[pieceId]) return PROFILES[pieceId]!;
  for (const [key, maps] of Object.entries(PROFILES)) {
    if (pieceId.includes(key.split("/")[1]!)) return maps;
  }
  return [
    { source: "energy", target: "density", amount: 0.3, curve: "ease" },
    { source: "onset", target: "exposure", amount: 0.35 },
    { source: "low", target: "chaos", amount: 0.2 },
  ];
}

export function gatedFeature(value: number, floor: number = AUDIO_NOISE_FLOOR): number {
  if (!Number.isFinite(value) || value <= floor) return 0;
  return Math.min(1, (value - floor) / Math.max(1e-6, 1 - floor));
}

export function scaledMappings(
  pieceId: string,
  sensitivity: ReactSensitivity = "balanced",
): AudioMapping[] {
  const scale = SENSITIVITY_SCALE[sensitivity];
  return reactProfileForPiece(pieceId).map((m) => ({
    ...m,
    amount: m.amount * scale,
  }));
}
