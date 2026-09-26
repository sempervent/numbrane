/**
 * Autonomous behavior presets — map creative intent to animation methods + param nudges.
 */

import { animationMethodsForPiece, defaultAnimationMethodId } from "../animation/methods";
import { animationCapabilitiesFor } from "../animation/capabilities";
import { familyOf } from "../catalog";

export type BehaviorPresetId =
  | "drift"
  | "orbit"
  | "breathe"
  | "pulse"
  | "flow"
  | "evolve"
  | "turbulence"
  | "collapse";

export type BehaviorPresetDef = {
  id: BehaviorPresetId;
  label: string;
  description: string;
  /** Preferred animation method id when compatible. */
  animationMethodId: string;
  /** Optional param deltas applied after macro pass. */
  paramDelta?: Record<string, number>;
  families?: string[];
  pieceIds?: string[];
};

export const BEHAVIOR_PRESETS: BehaviorPresetDef[] = [
  {
    id: "drift",
    label: "Drift",
    description: "Slow generative drift",
    animationMethodId: "parameter-drift",
    families: ["fractal", "field", "particle"],
  },
  {
    id: "flow",
    label: "Flow",
    description: "Field-like continuous motion",
    animationMethodId: "pan-left-right",
    paramDelta: { density: 0.05 },
    families: ["field", "geometry"],
  },
  {
    id: "orbit",
    label: "Orbit",
    description: "Camera orbit feel",
    animationMethodId: "pan-zoom",
    families: ["geometry", "fractal"],
  },
  {
    id: "breathe",
    label: "Breathe",
    description: "Pulse zoom in/out",
    animationMethodId: "zoom-in",
    families: ["geometry", "fractal", "reaction"],
  },
  {
    id: "pulse",
    label: "Pulse",
    description: "Parameter pulse",
    animationMethodId: "parameter-drift",
    families: ["fractal", "particle", "reaction"],
  },
  {
    id: "evolve",
    label: "Evolve",
    description: "Construction / emergence",
    animationMethodId: "construction",
    families: ["geometry", "growth"],
  },
  {
    id: "turbulence",
    label: "Turbulence",
    description: "Higher chaos motion",
    animationMethodId: "parameter-drift",
    paramDelta: { chaos: 0.15 },
    families: ["field", "particle", "fractal"],
  },
  {
    id: "collapse",
    label: "Collapse",
    description: "Settle / collapse arc",
    animationMethodId: "deconstruction",
    families: ["fractal", "particle"],
  },
];

export type BehaviorCompatibility =
  | { ok: true; preset: BehaviorPresetDef; methodId: string }
  | { ok: false; reason: string };

function methodExists(pieceId: string, methodId: string): boolean {
  return animationMethodsForPiece(pieceId).some((m) => m.id === methodId);
}

/** Map catalog path prefix / manifest family to preset taxonomy (singular). */
export function behaviorFamilyForPiece(pieceId: string): string {
  const raw = familyOf(pieceId).toLowerCase();
  const aliases: Record<string, string> = {
    fractals: "fractal",
    particles: "particle",
    fields: "field",
    geometry: "geometry",
    growth: "growth",
    mashups: "mashup",
    reaction: "reaction",
    "reaction-diffusion": "reaction",
    audiovisual: "field",
    landscape: "field",
    calligraphy: "field",
    attractors: "fractal",
  };
  if (aliases[raw]) return aliases[raw];
  if (raw.endsWith("s") && raw.length > 3) {
    const singular = raw.slice(0, -1);
    if (["fractal", "particle", "field"].includes(singular)) return singular;
  }
  if (pieceId.includes("attractor")) return "fractal";
  if (pieceId.includes("calligraphy")) return "field";
  return raw;
}

export function behaviorPresetById(id: string): BehaviorPresetDef | undefined {
  return BEHAVIOR_PRESETS.find((p) => p.id === id);
}

export function behaviorCompatibility(pieceId: string, presetId: BehaviorPresetId): BehaviorCompatibility {
  const preset = behaviorPresetById(presetId);
  if (!preset) return { ok: false, reason: "Unknown behavior" };
  const family = behaviorFamilyForPiece(pieceId);
  if (preset.pieceIds && !preset.pieceIds.includes(pieceId)) {
    return { ok: false, reason: "Not supported for this piece" };
  }
  if (preset.families && !preset.families.includes(family)) {
    return { ok: false, reason: `Best for ${preset.families.join(", ")} visuals` };
  }
  let methodId = preset.animationMethodId;
  if (!methodExists(pieceId, methodId)) {
    methodId = defaultAnimationMethodId(pieceId);
  }
  const caps = animationCapabilitiesFor(pieceId);
  if (caps.sources.length === 0) {
    return { ok: false, reason: "Piece has no animate surface" };
  }
  return { ok: true, preset, methodId };
}

export function listCompatibleBehaviors(pieceId: string): Array<BehaviorPresetDef & { methodId: string; disabled: boolean; reason?: string }> {
  return BEHAVIOR_PRESETS.map((preset) => {
    const c = behaviorCompatibility(pieceId, preset.id);
    if (c.ok) return { ...preset, methodId: c.methodId, disabled: false };
    return { ...preset, methodId: preset.animationMethodId, disabled: true, reason: c.reason };
  });
}
