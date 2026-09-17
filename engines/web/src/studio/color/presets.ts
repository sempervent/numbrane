/**
 * Named solid swatches and data ramps.
 */

import type { ColorRamp, SrgbColor } from "./model";
import {
  ACID_GREEN,
  AMBER,
  BONE_WHITE,
  ELECTRIC_CYAN,
  INK_BLACK,
  SIGNAL_RED,
  VIOLET,
} from "./model";

export type SolidPreset = { id: string; label: string; color: SrgbColor };

export const SOLID_PRESETS: SolidPreset[] = [
  { id: "signal-red", label: "Signal Red", color: SIGNAL_RED },
  { id: "bone-white", label: "Bone White", color: BONE_WHITE },
  { id: "electric-cyan", label: "Electric Cyan", color: ELECTRIC_CYAN },
  { id: "acid-green", label: "Acid Green", color: ACID_GREEN },
  { id: "amber", label: "Amber", color: AMBER },
  { id: "violet", label: "Violet", color: VIOLET },
];

export type RampPreset = { id: string; label: string; ramp: ColorRamp };

export const RAMP_PRESETS: Record<string, RampPreset> = {
  "red-ember": {
    id: "red-ember",
    label: "Red Ember",
    ramp: {
      stops: [
        { t: 0, color: INK_BLACK },
        { t: 0.35, color: { space: "srgb", value: "#4a0810" } },
        { t: 0.7, color: { space: "srgb", value: "#c41e3a" } },
        { t: 1, color: SIGNAL_RED },
      ],
    },
  },
  "bone-red": {
    id: "bone-red",
    label: "Bone → Red",
    ramp: {
      stops: [
        { t: 0, color: BONE_WHITE },
        { t: 0.55, color: { space: "srgb", value: "#e8a090" } },
        { t: 1, color: SIGNAL_RED },
      ],
    },
  },
  "deep-ocean": {
    id: "deep-ocean",
    label: "Deep Ocean",
    ramp: {
      stops: [
        { t: 0, color: { space: "srgb", value: "#020810" } },
        { t: 0.5, color: { space: "srgb", value: "#0a4a6a" } },
        { t: 1, color: ELECTRIC_CYAN },
      ],
    },
  },
  "electric-cyan": {
    id: "electric-cyan",
    label: "Electric Cyan",
    ramp: {
      stops: [
        { t: 0, color: INK_BLACK },
        { t: 0.4, color: { space: "srgb", value: "#064e5a" } },
        { t: 1, color: ELECTRIC_CYAN },
      ],
    },
  },
  acid: {
    id: "acid",
    label: "Acid",
    ramp: {
      stops: [
        { t: 0, color: INK_BLACK },
        { t: 0.45, color: { space: "srgb", value: "#1a4d00" } },
        { t: 1, color: ACID_GREEN },
      ],
    },
  },
  thermal: {
    id: "thermal",
    label: "Thermal",
    ramp: {
      stops: [
        { t: 0, color: { space: "srgb", value: "#0a0020" } },
        { t: 0.35, color: { space: "srgb", value: "#6a0020" } },
        { t: 0.65, color: AMBER },
        { t: 1, color: { space: "srgb", value: "#ffffcc" } },
      ],
    },
  },
  viridis: {
    id: "viridis",
    label: "Viridis-like",
    ramp: {
      stops: [
        { t: 0, color: { space: "srgb", value: "#440154" } },
        { t: 0.35, color: { space: "srgb", value: "#31688e" } },
        { t: 0.65, color: { space: "srgb", value: "#35b779" } },
        { t: 1, color: { space: "srgb", value: "#fde725" } },
      ],
    },
  },
  "mono-ink": {
    id: "mono-ink",
    label: "Monochrome Ink",
    ramp: {
      stops: [
        { t: 0, color: INK_BLACK },
        { t: 0.5, color: { space: "srgb", value: "#505060" } },
        { t: 1, color: BONE_WHITE },
      ],
    },
  },
  "white-transparent": {
    id: "white-transparent",
    label: "White → Transparent",
    ramp: {
      stops: [
        { t: 0, color: { space: "srgb", value: "#ffffff00" } },
        { t: 1, color: BONE_WHITE },
      ],
    },
  },
  "red-black": {
    id: "red-black",
    label: "Red → Black",
    ramp: {
      stops: [
        { t: 0, color: INK_BLACK },
        { t: 0.5, color: { space: "srgb", value: "#3a0810" } },
        { t: 1, color: SIGNAL_RED },
      ],
    },
  },
};

export const RAMP_PRESET_LIST = Object.values(RAMP_PRESETS);

/** Piece-specific ramp mapping options shown in UI. */
export function rampMappingsForPiece(pieceId: string): import("./model").RampMapping[] {
  if (pieceId.includes("reaction-diffusion")) return ["concentration", "intensity"];
  if (pieceId.includes("strange-attractor")) return ["age", "intensity", "speed"];
  if (pieceId.includes("escape-time")) return ["iteration", "intensity"];
  if (pieceId.includes("sdf")) return ["distance", "intensity"];
  if (pieceId.includes("slime") || pieceId.includes("noodle")) return ["age", "speed", "field"];
  if (pieceId.includes("differential")) return ["layer", "intensity"];
  if (pieceId.startsWith("geometry/")) return ["layer", "intensity"];
  if (pieceId.includes("latticefall") || pieceId.includes("flagship")) {
    return ["intensity", "speed", "field"];
  }
  if (pieceId.includes("flow") || pieceId.includes("field")) return ["field", "intensity"];
  if (pieceId.includes("tiling") || pieceId.includes("truchet")) return ["layer", "distance"];
  return ["intensity", "age", "speed"];
}
