/**
 * Canonical Studio color configuration (NAP-friendly, serializable).
 */

export type SrgbColor = {
  space: "srgb";
  value: string;
};

export type RampStop = {
  t: number;
  color: SrgbColor;
};

export type ColorRamp = {
  stops: RampStop[];
};

export type RampMapping =
  | "intensity"
  | "age"
  | "speed"
  | "field"
  | "layer"
  | "distance"
  | "concentration"
  | "iteration";

export type GradientType = "linear" | "radial";

export type SpatialGradient = {
  type: GradientType;
  angleDeg: number;
  stops: RampStop[];
};

export type ColorMode = "solid" | "ramp" | "gradient";

export type ColorConfig = {
  mode: ColorMode;
  primary: SrgbColor;
  secondary: SrgbColor;
  background: SrgbColor;
  transparentBackground: boolean;
  rampPreset: string;
  ramp: ColorRamp;
  rampMapping: RampMapping;
  gradient: SpatialGradient;
};

export const SIGNAL_RED: SrgbColor = { space: "srgb", value: "#e32636" };
export const BONE_WHITE: SrgbColor = { space: "srgb", value: "#f5f0e8" };
export const ELECTRIC_CYAN: SrgbColor = { space: "srgb", value: "#22d3ee" };
export const ACID_GREEN: SrgbColor = { space: "srgb", value: "#84cc16" };
export const AMBER: SrgbColor = { space: "srgb", value: "#f59e0b" };
export const VIOLET: SrgbColor = { space: "srgb", value: "#8b5cf6" };
export const INK_BLACK: SrgbColor = { space: "srgb", value: "#050508" };

export function defaultColorConfig(): ColorConfig {
  return {
    mode: "solid",
    primary: { ...SIGNAL_RED },
    secondary: { ...ELECTRIC_CYAN },
    background: { ...INK_BLACK },
    transparentBackground: false,
    rampPreset: "red-ember",
    ramp: {
      stops: [
        { t: 0, color: { space: "srgb", value: "#050508" } },
        { t: 0.45, color: { space: "srgb", value: "#7a1020" } },
        { t: 1, color: { ...SIGNAL_RED } },
      ],
    },
    rampMapping: "intensity",
    gradient: {
      type: "linear",
      angleDeg: 90,
      stops: [
        { t: 0, color: { ...ELECTRIC_CYAN } },
        { t: 1, color: { ...VIOLET } },
      ],
    },
  };
}

const HEX_RE = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return { r: 1, g: 1, b: 1, a: 1 };
  const n = parseInt(m[1]!, 16);
  const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a,
  };
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** sRGB channel → HSL hue turn [0,1) for legacy u_hue pieces. */
export function hexToHueTurn(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h % 1;
}

export function normalizeColorConfig(raw: unknown): ColorConfig {
  const base = defaultColorConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<ColorConfig>;
  const pickColor = (v: unknown, fallback: SrgbColor): SrgbColor => {
    if (v && typeof v === "object" && "value" in (v as object)) {
      const val = String((v as SrgbColor).value ?? fallback.value);
      return { space: "srgb", value: val.startsWith("#") ? val : fallback.value };
    }
    if (typeof v === "string" && v.startsWith("#")) return { space: "srgb", value: v };
    return fallback;
  };
  return {
    mode: o.mode === "ramp" || o.mode === "gradient" ? o.mode : "solid",
    primary: pickColor(o.primary, base.primary),
    secondary: pickColor(o.secondary, base.secondary),
    background: pickColor(o.background, base.background),
    transparentBackground: !!o.transparentBackground,
    rampPreset: typeof o.rampPreset === "string" ? o.rampPreset : base.rampPreset,
    ramp:
      o.ramp && Array.isArray(o.ramp.stops)
        ? {
            stops: o.ramp.stops
              .filter((s) => s && typeof s.t === "number")
              .map((s) => ({
                t: Math.min(1, Math.max(0, s.t)),
                color: pickColor(s.color, base.primary),
              }))
              .sort((a, b) => a.t - b.t),
          }
        : base.ramp,
    rampMapping:
      typeof o.rampMapping === "string" ? (o.rampMapping as RampMapping) : base.rampMapping,
    gradient:
      o.gradient && Array.isArray(o.gradient.stops)
        ? {
            type: o.gradient.type === "radial" ? "radial" : "linear",
            angleDeg: Number(o.gradient.angleDeg) || 90,
            stops: o.gradient.stops.map((s) => ({
              t: Math.min(1, Math.max(0, s.t)),
              color: pickColor(s.color, base.primary),
            })),
          }
        : base.gradient,
  };
}

export function colorConfigEqual(a: ColorConfig, b: ColorConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
