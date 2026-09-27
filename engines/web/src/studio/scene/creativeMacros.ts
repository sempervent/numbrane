/**
 * Semantic creative macros — deterministic maps to piece parameters.
 */

import type { MetaAxis } from "../explore/variants";
import { getPieceRuntime } from "../runtime/registry";
import { behaviorPresetById, type BehaviorPresetId } from "./behaviorPresets";

export type CreativeMacroId = "energy" | "density" | "motion" | "chaos";

export type CreativeMacroValues = Record<CreativeMacroId, number>;

export const DEFAULT_MACRO_VALUES: CreativeMacroValues = {
  energy: 0.55,
  density: 0.55,
  motion: 0.5,
  chaos: 0.35,
};

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clampParam(key: string, pieceId: string, value: number): number {
  const field = getPieceRuntime(pieceId).paramSchema.find((f) => f.key === key);
  if (!field || field.type !== "number") return value;
  const min = field.min ?? 0;
  const max = field.max ?? 1;
  return Math.min(max, Math.max(min, value));
}

/** Apply macro semantics onto params + meta (deterministic). */
export function applyCreativeMacros(
  pieceId: string,
  params: Record<string, number | string | boolean>,
  meta: Record<MetaAxis, number>,
  macros: CreativeMacroValues,
  behaviorPresetId: BehaviorPresetId | "" = "",
): { params: Record<string, number | string | boolean>; meta: Record<MetaAxis, number> } {
  const nextParams = { ...params };
  const nextMeta = { ...meta };

  const energy = clamp01(macros.energy);
  const density = clamp01(macros.density);
  const motion = clamp01(macros.motion);
  const chaos = clamp01(macros.chaos);

  if (typeof nextParams.density === "number") {
    nextParams.density = clampParam("density", pieceId, 0.25 + density * 1.1);
  }
  if (typeof nextParams.chaos === "number") {
    nextParams.chaos = clampParam("chaos", pieceId, 0.05 + chaos * 0.85);
  }
  if (typeof nextParams.exposure === "number") {
    nextParams.exposure = clampParam("exposure", pieceId, 0.85 + energy * 0.5);
  }
  if (typeof nextParams.zoom === "number") {
    nextParams.zoom = clampParam("zoom", pieceId, 0.92 + motion * 0.2);
  }

  nextMeta.density = density;
  nextMeta.chaos = chaos;
  nextMeta.kinetic = motion;
  nextMeta.organic = clamp01(1 - chaos * 0.65);

  const preset = behaviorPresetId ? behaviorPresetById(behaviorPresetId) : undefined;
  if (preset?.paramDelta) {
    for (const [k, delta] of Object.entries(preset.paramDelta)) {
      if (typeof nextParams[k] === "number") {
        nextParams[k] = clampParam(k, pieceId, Number(nextParams[k]) + delta);
      }
    }
  }

  return { params: nextParams, meta: nextMeta };
}
