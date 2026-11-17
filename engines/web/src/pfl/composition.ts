/**
 * Seed-driven composition bundles — one engine, distinct archetypes.
 */

import { mulberry32 } from "./rng";

export type ArchetypeId = "vortex" | "river" | "bloom" | "weave" | "filament";

export type PaletteDef = {
  name: string;
  hues: [number, number, number];
  sat: number;
  lit: [number, number, number];
};

export type CompositionBundle = {
  seed: number;
  archetype: ArchetypeId;
  palette: PaletteDef;
  fieldScale: number;
  fieldDrift: number;
  curlGain: number;
  macroSpeed: number;
  mesoSpeed: number;
  macroCount: number;
  mesoCount: number;
  trailFade: number;
  macroWidth: number;
  mesoWidth: number;
  macroAlpha: number;
  mesoAlpha: number;
  attractorX: number;
  attractorY: number;
  flowBias: number;
  spawnCluster: number;
};

const PALETTES: PaletteDef[] = [
  { name: "cyan-gold", hues: [188, 198, 46], sat: 94, lit: [64, 72, 78] },
  { name: "magma-violet", hues: [318, 278, 24], sat: 88, lit: [62, 70, 76] },
  { name: "emerald-ivory", hues: [152, 168, 92], sat: 86, lit: [58, 68, 82] },
  { name: "electric-coral", hues: [205, 12, 42], sat: 92, lit: [66, 74, 70] },
];

const ARCHETYPES: ArchetypeId[] = ["vortex", "river", "bloom", "weave", "filament"];

export function compositionFromSeed(seed: number): CompositionBundle {
  const rng = mulberry32(seed >>> 0);
  const archetype = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)]!;
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)]!;
  const base = {
    seed: seed >>> 0,
    archetype,
    palette,
    attractorX: 0.35 + rng() * 0.3,
    attractorY: 0.35 + rng() * 0.3,
    flowBias: rng() * Math.PI * 2,
    spawnCluster: 0.15 + rng() * 0.25,
  };

  switch (archetype) {
    case "vortex":
      return {
        ...base,
        fieldScale: 1.1 + rng() * 0.4,
        fieldDrift: 0.08 + rng() * 0.06,
        curlGain: 2.8 + rng() * 1.2,
        macroSpeed: 1.35,
        mesoSpeed: 0.95,
        macroCount: 0.22,
        mesoCount: 0.55,
        trailFade: 0.028,
        macroWidth: 2.4,
        mesoWidth: 1.05,
        macroAlpha: 0.42,
        mesoAlpha: 0.22,
      };
    case "river":
      return {
        ...base,
        fieldScale: 0.75 + rng() * 0.35,
        fieldDrift: 0.05 + rng() * 0.04,
        curlGain: 1.4 + rng() * 0.5,
        macroSpeed: 1.6,
        mesoSpeed: 1.1,
        macroCount: 0.28,
        mesoCount: 0.62,
        trailFade: 0.032,
        macroWidth: 2.1,
        mesoWidth: 0.9,
        macroAlpha: 0.38,
        mesoAlpha: 0.2,
        flowBias: base.flowBias,
      };
    case "bloom":
      return {
        ...base,
        fieldScale: 1.3 + rng() * 0.5,
        fieldDrift: 0.1,
        curlGain: 2.2,
        macroSpeed: 1.15,
        mesoSpeed: 0.85,
        macroCount: 0.18,
        mesoCount: 0.7,
        trailFade: 0.026,
        macroWidth: 2.6,
        mesoWidth: 1.1,
        macroAlpha: 0.45,
        mesoAlpha: 0.24,
        spawnCluster: 0.08 + rng() * 0.12,
      };
    case "weave":
      return {
        ...base,
        fieldScale: 0.95 + rng() * 0.4,
        fieldDrift: 0.07,
        curlGain: 2.0,
        macroSpeed: 1.25,
        mesoSpeed: 1.0,
        macroCount: 0.25,
        mesoCount: 0.58,
        trailFade: 0.03,
        macroWidth: 2.0,
        mesoWidth: 0.85,
        macroAlpha: 0.4,
        mesoAlpha: 0.21,
      };
    case "filament":
      return {
        ...base,
        fieldScale: 1.5 + rng() * 0.6,
        fieldDrift: 0.09,
        curlGain: 3.2,
        macroSpeed: 1.05,
        mesoSpeed: 1.25,
        macroCount: 0.12,
        mesoCount: 0.75,
        trailFade: 0.022,
        macroWidth: 1.6,
        mesoWidth: 0.65,
        macroAlpha: 0.35,
        mesoAlpha: 0.28,
      };
  }
}

export { nextVariationSeed } from "./artworkTypes";
