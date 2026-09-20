/**
 * Named algorithmic parameter presets (not fixed images).
 * Values map to real piece parameters.
 */

export type ArtisticPreset = {
  id: string;
  label: string;
  parameters: Record<string, number | string | boolean>;
};

const PRESETS: Record<string, ArtisticPreset[]> = {
  "fields/flow-hatching": [
    { id: "laminar", label: "laminar", parameters: { density: 0.9, chaos: 0.15, zoom: 1 } },
    { id: "turbulent", label: "turbulent", parameters: { density: 1.2, chaos: 0.7, zoom: 1.1 } },
    { id: "vortex", label: "vortex", parameters: { density: 1.0, chaos: 0.45, zoom: 1.2 } },
    { id: "filament", label: "filament", parameters: { density: 0.7, chaos: 0.25, zoom: 1.05 } },
    { id: "dense-ink", label: "dense-ink", parameters: { density: 1.5, chaos: 0.2, zoom: 1 } },
    { id: "sparse", label: "sparse", parameters: { density: 0.4, chaos: 0.1, zoom: 1 } },
  ],
  "fractals/strange-attractors": [
    { id: "fine-line", label: "fine-line", parameters: { density: 0.55, chaos: 0.2, exposure: 1.2, render_mode: "fine-ink" } },
    { id: "dense-cloud", label: "dense-cloud", parameters: { density: 0.9, chaos: 0.35, exposure: 1.4, render_mode: "dense-ink" } },
    { id: "calligraphic", label: "calligraphic", parameters: { density: 0.65, chaos: 0.4, hue: 0.08, render_mode: "calligraphic" } },
    { id: "long-exposure", label: "long-exposure", parameters: { density: 0.85, chaos: 0.25, exposure: 1.6, render_mode: "long-exposure" } },
    { id: "ghost", label: "ghost", parameters: { density: 0.5, chaos: 0.2, render_mode: "ghost", pfl_style: "pfl-afterimage" } },
    { id: "technical", label: "technical", parameters: { density: 0.7, chaos: 0.15, render_mode: "technical", pfl_style: "pfl-machine" } },
  ],
  "reaction-diffusion/reaction-diffusion": [
    { id: "coral", label: "coral", parameters: { f: 0.055, k: 0.062, density: 0.8 } },
    { id: "cells", label: "cells", parameters: { f: 0.037, k: 0.06, density: 0.75 } },
    { id: "worms", label: "worms", parameters: { f: 0.078, k: 0.061, density: 0.7 } },
    { id: "mitosis", label: "mitosis", parameters: { f: 0.03, k: 0.062, density: 0.85 } },
    { id: "lace", label: "lace", parameters: { f: 0.026, k: 0.053, density: 0.65 } },
  ],
  "geometry/metatron": [
    { id: "construction", label: "construction", parameters: { density: 0.55, chaos: 0.05, zoom: 1 } },
    { id: "minimal", label: "minimal", parameters: { density: 0.35, chaos: 0.02, zoom: 0.95 } },
    { id: "dense", label: "dense", parameters: { density: 0.9, chaos: 0.1, zoom: 1.05 } },
    { id: "ritual", label: "ritual", parameters: { density: 0.7, chaos: 0.15, hue: 0.08, zoom: 1.1 } },
    { id: "broken-symmetry", label: "broken-symmetry", parameters: { density: 0.65, chaos: 0.45, rotation: 0.12 } },
  ],
  "growth/slime-mold": [
    { id: "network", label: "network", parameters: { density: 0.7, chaos: 0.25 } },
    { id: "veins", label: "veins", parameters: { density: 0.55, chaos: 0.35 } },
    { id: "dense", label: "dense", parameters: { density: 0.95, chaos: 0.2 } },
    { id: "sparse", label: "sparse", parameters: { density: 0.35, chaos: 0.15 } },
    { id: "nutrient-islands", label: "nutrient-islands", parameters: { density: 0.6, chaos: 0.55 } },
  ],
  "particles/noodles": [
    { id: "laminar", label: "laminar", parameters: { density: 0.6, chaos: 0.2, flow: 0.9 } },
    { id: "turbulent", label: "turbulent", parameters: { density: 0.9, chaos: 0.65, curl: 1.4 } },
    { id: "filament", label: "filament", parameters: { density: 0.5, chaos: 0.3, flow: 1.3 } },
  ],
};

export function presetsForPiece(pieceId: string): ArtisticPreset[] {
  if (PRESETS[pieceId]) return PRESETS[pieceId]!;
  if (pieceId.includes("geometry/")) return PRESETS["geometry/metatron"]!;
  if (pieceId.includes("flow")) return PRESETS["fields/flow-hatching"]!;
  if (pieceId.includes("attractor")) return PRESETS["fractals/strange-attractors"]!;
  if (pieceId.includes("reaction")) return PRESETS["reaction-diffusion/reaction-diffusion"]!;
  if (pieceId.includes("slime")) return PRESETS["growth/slime-mold"]!;
  return [
    { id: "balanced", label: "balanced", parameters: { density: 0.7, chaos: 0.3 } },
    { id: "sparse", label: "sparse", parameters: { density: 0.4, chaos: 0.15 } },
    { id: "dense", label: "dense", parameters: { density: 0.95, chaos: 0.4 } },
  ];
}

/** Animation arc envelopes over logical t in [0,1]. */
export type AnimArc = {
  id: string;
  label: string;
  /** Apply to params given progress 0..1 */
  apply: (params: Record<string, number>, t01: number) => Record<string, number>;
};

/** Piece-aware envelopes — not global sine wobble. */
export const ANIM_ARCS: AnimArc[] = [
  {
    id: "emergence",
    label: "emergence",
    apply: (p, t) => {
      const e = t * t; // ease-in reveal
      return {
        ...p,
        density: (p.density ?? 0.7) * (0.15 + 0.85 * e),
        exposure: 0.55 + 0.7 * e,
        chaos: (p.chaos ?? 0.3) * (0.4 + 0.6 * t),
      };
    },
  },
  {
    id: "reveal",
    label: "reveal",
    apply: (p, t) => ({
      ...p,
      margin: (p.margin ?? 1.2) * (1.45 - 0.4 * t),
      ink: (p.ink ?? 1.2) * (0.5 + 0.7 * t),
      exposure: 0.6 + 0.55 * t,
    }),
  },
  {
    id: "growth",
    label: "growth",
    apply: (p, t) => ({
      ...p,
      zoom: (p.zoom ?? 1) * (0.82 + 0.4 * t),
      density: (p.density ?? 0.7) * (0.65 + 0.45 * t),
      growth_rate: (p.growth_rate ?? 0.5) * (0.5 + 0.8 * t),
    }),
  },
  {
    id: "drift",
    label: "drift",
    apply: (p, t) => {
      const phase = t * Math.PI * 2;
      const w = 0.5 + 0.5 * Math.sin(phase);
      const c = 0.5 + 0.5 * Math.cos(phase * 0.73);
      return {
        ...p,
        zoom: (p.zoom ?? 1) * (0.9 + 0.16 * w),
        chaos: (p.chaos ?? 0.3) * (0.78 + 0.38 * c),
        density: (p.density ?? 0.7) * (0.88 + 0.2 * w),
        hue: ((p.hue ?? 0.5) + 0.05 * Math.sin(phase)) % 1,
        rotation: (p.rotation ?? 0) + 0.06 * Math.sin(phase * 0.5),
        off_center_x: (p.off_center_x ?? 0) + 0.08 * Math.sin(phase * 0.4),
      };
    },
  },
  {
    id: "fracture",
    label: "fracture",
    apply: (p, t) => {
      const crack = t < 0.35 ? t / 0.35 : 1;
      return {
        ...p,
        chaos: (p.chaos ?? 0.3) * (0.3 + 1.4 * crack),
        density: (p.density ?? 0.7) * (1.1 - 0.35 * crack),
      };
    },
  },
  {
    id: "collapse",
    label: "collapse",
    apply: (p, t) => ({
      ...p,
      density: (p.density ?? 0.7) * (1.15 - 0.95 * t),
      zoom: (p.zoom ?? 1) * (1 + 0.35 * t),
      chaos: (p.chaos ?? 0.3) * (0.45 + 0.9 * t),
    }),
  },
  {
    id: "settle",
    label: "settle",
    apply: (p, t) => ({
      ...p,
      chaos: (p.chaos ?? 0.3) * (1 - 0.75 * t),
      density: (p.density ?? 0.7) * (0.85 + 0.15 * (1 - t)),
      exposure: 0.95 + 0.15 * (1 - t),
    }),
  },
  {
    id: "afterimage",
    label: "afterimage",
    apply: (p, t) => ({
      ...p,
      exposure: 1.1 - 0.55 * t,
      ink: (p.ink ?? 1.2) * (1.2 - 0.5 * t),
      density: (p.density ?? 0.7) * (1 - 0.25 * t),
      bloom_intensity: 0.08 + 0.25 * (1 - t),
    }),
  },
];
