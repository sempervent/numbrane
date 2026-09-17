/**
 * Merge color config into API/recipe parameters.
 */

import type { ColorConfig } from "./model";
import { rampToPythonStops } from "./lut";

export function colorToRecipeParams(color: ColorConfig): Record<string, unknown> {
  return {
    color: {
      mode: color.mode,
      primary: color.primary,
      secondary: color.secondary,
      background: color.background,
      transparentBackground: color.transparentBackground,
      rampPreset: color.rampPreset,
      ramp: color.ramp,
      rampMapping: color.rampMapping,
      gradient: color.gradient,
    },
    // Python palette bridge
    palette: color.rampPreset || "fire",
    color_stops: rampToPythonStops(color.mode === "ramp" ? color.ramp : color.ramp),
    color_primary: color.primary.value,
    color_background: color.transparentBackground ? "transparent" : color.background.value,
  };
}

export function mergeParamsWithColor(
  params: Record<string, number | string | boolean>,
  color: ColorConfig,
): Record<string, number | string | boolean> {
  const c = colorToRecipeParams(color);
  return {
    ...params,
    ...Object.fromEntries(
      Object.entries(c).filter(([, v]) => typeof v !== "object"),
    ),
    color_json: JSON.stringify(c.color),
  };
}
