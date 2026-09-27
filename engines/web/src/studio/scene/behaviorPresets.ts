/**
 * Autonomous behavior presets — capability-driven routing to animation methods.
 */

import { animationCapabilitiesFor } from "../animation/capabilities";
import { animationMethodsForPiece } from "../animation/methods";

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
  /** Optional param nudges applied via macro pass (not cumulative). */
  paramDelta?: Record<string, number>;
};

export const BEHAVIOR_PRESETS: BehaviorPresetDef[] = [
  {
    id: "drift",
    label: "Drift",
    description: "Slow continuous spatial movement",
    paramDelta: { zoom: 0.02 },
  },
  {
    id: "flow",
    label: "Flow",
    description: "Field-like continuous motion",
    paramDelta: { density: 0.04 },
  },
  {
    id: "orbit",
    label: "Orbit",
    description: "Rotational camera movement",
  },
  {
    id: "breathe",
    label: "Breathe",
    description: "Rhythmic zoom in and out",
  },
  {
    id: "pulse",
    label: "Pulse",
    description: "Rhythmic parameter amplitude",
  },
  {
    id: "evolve",
    label: "Evolve",
    description: "Construction or emergence arc",
  },
  {
    id: "turbulence",
    label: "Turbulence",
    description: "Higher chaos and motion",
    paramDelta: { chaos: 0.12 },
  },
  {
    id: "collapse",
    label: "Collapse",
    description: "Settle or collapse arc",
  },
];

/** Preferred animation method ids per behavior (first match wins). */
const BEHAVIOR_METHOD_ROUTES: Record<BehaviorPresetId, string[]> = {
  drift: ["slow-drift", "parameter-drift", "flow", "continuous-evolution", "native-evolution", "pan-left-right"],
  flow: ["flow", "pan-left-right", "parameter-drift", "slow-drift", "continuous-evolution"],
  orbit: ["pan-zoom", "pan-diagonal", "pan-left-right"],
  breathe: ["zoom-in", "zoom-out", "pan-zoom"],
  pulse: ["parameter-drift", "zoom-in", "pan-zoom"],
  evolve: ["construction", "trail-growth", "native-evolution", "continuous-evolution", "slow-drift"],
  turbulence: ["parameter-drift", "slow-drift", "flow", "continuous-evolution"],
  collapse: ["deconstruction", "zoom-out", "slow-drift"],
};

const UNAVAILABLE_REASON: Partial<Record<BehaviorPresetId, string>> = {
  orbit: "No transformable camera path for this piece",
  breathe: "No zoom/camera envelope for this piece",
  evolve: "No construction or native evolution path",
  collapse: "No collapse/deconstruction path",
};

export type BehaviorCompatibility =
  | { ok: true; preset: BehaviorPresetDef; methodId: string }
  | { ok: false; reason: string };

export function behaviorFamilyForPiece(pieceId: string): string {
  const seg = pieceId.split("/")[0] ?? pieceId;
  const aliases: Record<string, string> = {
    fractals: "fractal",
    particles: "particle",
    fields: "field",
    tiling: "tiling",
    growth: "growth",
    mashups: "mashup",
    "reaction-diffusion": "reaction",
    audiovisual: "field",
    landscape: "field",
    flagship: "flagship",
  };
  return aliases[seg] ?? seg;
}

export function behaviorPresetById(id: string): BehaviorPresetDef | undefined {
  return BEHAVIOR_PRESETS.find((p) => p.id === id);
}

function resolveBehaviorMethodId(pieceId: string, presetId: BehaviorPresetId): string | null {
  const allowed = new Set(animationMethodsForPiece(pieceId).map((m) => m.id));
  for (const mid of BEHAVIOR_METHOD_ROUTES[presetId]) {
    if (allowed.has(mid)) return mid;
  }
  return null;
}

export function behaviorCompatibility(pieceId: string, presetId: BehaviorPresetId): BehaviorCompatibility {
  const preset = behaviorPresetById(presetId);
  if (!preset) return { ok: false, reason: "Unknown behavior" };
  const caps = animationCapabilitiesFor(pieceId);
  if (caps.sources.length === 0) {
    return { ok: false, reason: "Piece has no animate surface" };
  }
  const methodId = resolveBehaviorMethodId(pieceId, presetId);
  if (!methodId) {
    return {
      ok: false,
      reason: UNAVAILABLE_REASON[presetId] ?? "Not available for this runtime",
    };
  }
  return { ok: true, preset, methodId };
}

export function listCompatibleBehaviors(
  pieceId: string,
): Array<BehaviorPresetDef & { methodId: string; disabled: boolean; reason?: string }> {
  return BEHAVIOR_PRESETS.map((preset) => {
    const c = behaviorCompatibility(pieceId, preset.id);
    if (c.ok) return { ...preset, methodId: c.methodId, disabled: false };
    return { ...preset, methodId: "", disabled: true, reason: c.reason };
  });
}

/** Count of selectable non-default behaviors (certification). */
export function behaviorSupportCount(pieceId: string): { available: number; total: number } {
  const list = listCompatibleBehaviors(pieceId);
  const available = list.filter((b) => !b.disabled).length;
  return { available, total: list.length };
}
