/**
 * Human-facing transition editor ↔ SetEdgeDef mapping.
 */

import type { SetEdgeDef } from "../../live/types";

export type MorphUnit = "bars" | "beats" | "seconds";

export type LaunchQuantOption = "immediate" | "next_bar" | "2_bars" | "4_bars" | "8_bars";

const QUANT_TO_BARS: Record<LaunchQuantOption, number> = {
  immediate: 0,
  next_bar: 1,
  "2_bars": 2,
  "4_bars": 4,
  "8_bars": 8,
};

export function launchQuantFromBars(bars: number | undefined): LaunchQuantOption {
  const b = bars ?? 0;
  if (b <= 0) return "immediate";
  if (b === 1) return "next_bar";
  if (b === 2) return "2_bars";
  if (b === 4) return "4_bars";
  if (b === 8) return "8_bars";
  return "next_bar";
}

export function launchQuantToBars(option: LaunchQuantOption): number {
  return QUANT_TO_BARS[option];
}

export function readMorphDuration(edge: SetEdgeDef): { value: number; unit: MorphUnit } {
  const m = edge.morph;
  if (m?.duration_bars != null && m.duration_bars > 0) {
    return { value: m.duration_bars, unit: "bars" };
  }
  if (m?.duration_beats != null && m.duration_beats > 0) {
    return { value: m.duration_beats, unit: "beats" };
  }
  if (m?.duration_seconds != null && m.duration_seconds > 0) {
    return { value: m.duration_seconds, unit: "seconds" };
  }
  return { value: 2, unit: "beats" };
}

export function morphPatch(value: number, unit: MorphUnit): SetEdgeDef["morph"] {
  const base = { type: "crossfade" as const };
  if (unit === "bars") return { ...base, duration_bars: value };
  if (unit === "seconds") return { ...base, duration_seconds: value };
  return { ...base, duration_beats: value };
}

export function edgeFromTransitionForm(input: {
  automatic: boolean;
  dwellBars: number;
  quant: LaunchQuantOption;
  morphValue: number;
  morphUnit: MorphUnit;
  minDwellBars: number;
}): Partial<SetEdgeDef> {
  return {
    advancement: input.automatic
      ? { mode: "automatic", dwell_bars: Math.max(0, input.dwellBars) }
      : { mode: "manual" },
    launch_quantization_bars: launchQuantToBars(input.quant),
    minimum_dwell_bars: Math.max(0, input.minDwellBars),
    morph: morphPatch(Math.max(0, input.morphValue), input.morphUnit),
  };
}
