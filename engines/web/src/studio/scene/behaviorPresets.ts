/**
 * Autonomous behavior presets — capability-driven routing to animation methods.
 */

import { animationCapabilitiesFor } from "../animation/capabilities";
import { animationMethodsForPiece } from "../animation/methods";

/** Capability tags — behaviors compose these, not backend families. */
export type MotionCapability =
  | "spatial-drift"
  | "camera-orbit"
  | "scale-breathe"
  | "param-pulse"
  | "field-flow"
  | "sim-evolve"
  | "perturb-turbulence"
  | "settle-collapse";

const PRESET_CAPABILITIES: Record<BehaviorPresetId, MotionCapability[]> = {
  drift: ["spatial-drift"],
  flow: ["field-flow", "spatial-drift"],
  orbit: ["camera-orbit"],
  breathe: ["scale-breathe"],
  pulse: ["param-pulse", "scale-breathe"],
  evolve: ["sim-evolve"],
  turbulence: ["perturb-turbulence", "param-pulse"],
  collapse: ["settle-collapse"],
};

export function motionCapabilitiesForPiece(pieceId: string): Set<MotionCapability> {
  const caps = animationCapabilitiesFor(pieceId);
  const out = new Set<MotionCapability>();
  const hasCamera =
    caps.sources.includes("camera") || caps.sources.includes("composite");
  const hasGenerative =
    caps.sources.includes("generative") || caps.sources.includes("composite");
  const hasParams =
    caps.sources.includes("parameters") || caps.sources.includes("composite");
  const hasConstruction =
    caps.sources.includes("construction") || caps.sources.includes("composite");

  if (hasCamera || caps.motions.includes("drift") || caps.motions.includes("pan")) {
    out.add("spatial-drift");
    out.add("camera-orbit");
    out.add("scale-breathe");
    out.add("settle-collapse");
  }
  if (hasGenerative) {
    out.add("spatial-drift");
    out.add("field-flow");
    out.add("sim-evolve");
    out.add("perturb-turbulence");
  }
  if (hasParams || hasGenerative) {
    out.add("param-pulse");
    out.add("perturb-turbulence");
  }
  if (hasConstruction) {
    out.add("sim-evolve");
    if (pieceId.startsWith("geometry/")) out.add("settle-collapse");
  }
  if (pieceId.startsWith("mashups/") && hasGenerative) {
    out.add("field-flow");
    out.add("sim-evolve");
  }
  return out;
}

export function behaviorPresetCapabilityOk(pieceId: string, presetId: BehaviorPresetId): boolean {
  const need = PRESET_CAPABILITIES[presetId];
  const have = motionCapabilitiesForPiece(pieceId);
  return need.some((n) => have.has(n));
}

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
  drift: [
    "slow-drift",
    "generative-drift",
    "parameter-drift",
    "flow",
    "continuous-evolution",
    "native-evolution",
    "composite-evolution",
    "pan-left-right",
  ],
  flow: [
    "generative-flow",
    "flow",
    "generative-drift",
    "pan-left-right",
    "parameter-drift",
    "slow-drift",
    "continuous-evolution",
    "composite-evolution",
  ],
  orbit: ["pan-zoom", "pan-diagonal", "pan-left-right"],
  breathe: ["zoom-in", "zoom-out", "pan-zoom"],
  pulse: ["parameter-drift", "zoom-in", "pan-zoom"],
  evolve: [
    "construction",
    "generative-flow",
    "trail-growth",
    "native-evolution",
    "continuous-evolution",
    "composite-evolution",
    "slow-drift",
  ],
  turbulence: ["parameter-drift", "generative-flow", "slow-drift", "flow", "continuous-evolution"],
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
  if (!behaviorPresetCapabilityOk(pieceId, presetId)) {
    return {
      ok: false,
      reason: UNAVAILABLE_REASON[presetId] ?? "Not available for this runtime",
    };
  }
  const methodId = resolveBehaviorMethodId(pieceId, presetId);
  if (!methodId) {
    return {
      ok: false,
      reason: UNAVAILABLE_REASON[presetId] ?? "No animation route for this behavior",
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
