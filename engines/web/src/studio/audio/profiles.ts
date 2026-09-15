/**
 * Piece-specific REACT audio profiles with sensitivity scaling.
 */

import type { AudioMapping } from "../audio/mappings";

export type ReactSensitivity = "subtle" | "balanced" | "aggressive";

const SENSITIVITY_SCALE: Record<ReactSensitivity, number> = {
  subtle: 0.55,
  balanced: 1,
  aggressive: 1.55,
};

const PROFILES: Record<string, AudioMapping[]> = {
  "reaction-diffusion/reaction-diffusion": [
    { source: "energy", target: "f", amount: 0.012, curve: "ease" },
    { source: "low", target: "f", amount: 0.008 },
    { source: "high", target: "k", amount: 0.01 },
    { source: "onset", target: "chaos", amount: 0.25 },
    { source: "energy", target: "density", amount: 0.2, curve: "ease" },
  ],
  "growth/slime-mold": [
    { source: "low", target: "stepSize", amount: 0.35, curve: "ease" },
    { source: "mid", target: "sensorDistance", amount: 0.3 },
    { source: "high", target: "sensorAngle", amount: 0.28 },
    { source: "flux", target: "turnRate", amount: 0.22 },
    { source: "onset", target: "deposit", amount: 0.35 },
  ],
  "particles/noodles": [
    { source: "energy", target: "flow", amount: 0.4, curve: "ease" },
    { source: "low", target: "density", amount: 0.3 },
    { source: "centroid", target: "curl", amount: 0.35 },
    { source: "onset", target: "chaos", amount: 0.28 },
  ],
  "growth/differential-growth": [
    { source: "energy", target: "growth_rate", amount: 0.35, curve: "ease" },
    { source: "low", target: "chaos", amount: 0.25 },
    { source: "onset", target: "density", amount: 0.3 },
    { source: "centroid", target: "hue", amount: 0.15 },
  ],
  "flagship/latticefall": [
    { source: "energy", target: "density", amount: 0.4, curve: "ease" },
    { source: "low", target: "chaos", amount: 0.28 },
    { source: "onset", target: "exposure", amount: 0.4 },
    { source: "flux", target: "zoom", amount: 0.15 },
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
