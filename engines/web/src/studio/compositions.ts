/**
 * Composition recipes — authentic multi-piece compositor scenes.
 */

import type { BlendMode, SetDef } from "../live/types";

export type CompositionLayerDefaults = {
  opacity?: number;
  blend?: BlendMode;
};

export type CompositionRecipe = {
  id: string;
  label: string;
  description: string;
  /** Live Animate method id per layer (L0 follows Studio primary method when omitted). */
  layerMethods?: Partial<Record<string, string>>;
  build: (seed: number, params: Record<string, number | string | boolean>) => SetDef;
};

function setOf(
  id: string,
  name: string,
  layers: SetDef["scenes"][0]["layers"],
  modulation: SetDef["scenes"][0]["modulation"] = [],
): SetDef {
  return {
    protocol_version: "0.1.0",
    set_id: id,
    name,
    scenes: [
      {
        id: "main",
        name,
        layers,
        modulation,
        post: { bloom: 0.15, feedback: 0.04 },
      },
    ],
    cues: [],
  };
}

export const COMPOSITIONS: CompositionRecipe[] = [
  {
    id: "geometry-sdf",
    label: "Geometry + SDF",
    description: "Metatron ritual geometry over SDF raymarch field",
    layerMethods: {
      L0: "pan-left-right",
      L1: "construction",
    },
    build: (seed, params) =>
      setOf("geometry-sdf", "Geometry + SDF", [
        {
          id: "L0",
          piece: "fractals/sdf-raymarch2d",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "geometry/metatron",
          opacity: 0.48,
          blend: "screen",
          seed,
          parameters: { ...params, density: 0.52 },
        },
      ]),
  },
  {
    id: "yantra-sdf",
    label: "Yantra + SDF",
    description: "Sri Yantra over SDF depth field",
    layerMethods: {
      L0: "slow-drift",
      L1: "construction",
    },
    build: (seed, params) =>
      setOf("yantra-sdf", "Yantra + SDF", [
        {
          id: "L0",
          piece: "fractals/sdf-raymarch2d",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "geometry/sri-yantra",
          opacity: 0.5,
          blend: "screen",
          seed: seed ^ 0x9e3779b9,
          parameters: { ...params, density: 0.55 },
        },
      ]),
  },
  {
    id: "attractor-hatch",
    label: "Attractor + hatch",
    description: "Strange attractor density under flow hatching",
    build: (seed, params) =>
      setOf("attractor-hatch", "Attractor + hatch", [
        {
          id: "L0",
          piece: "fractals/strange-attractors",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "fields/flow-hatching",
          opacity: 0.45,
          blend: "screen",
          seed: seed ^ 0x9e3779b9,
          parameters: {
            ...params,
            density: Math.min(1, (Number(params.density) || 0.7) * 0.7),
          },
        },
      ]),
  },
  {
    id: "rd-geometry",
    label: "RD + geometry mask",
    description: "Reaction diffusion with Metatron overlay",
    layerMethods: {
      L0: "continuous-evolution",
      L1: "construction",
    },
    build: (seed, params) =>
      setOf("rd-geometry", "RD + geometry", [
        {
          id: "L0",
          piece: "reaction-diffusion/reaction-diffusion",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "geometry/metatron",
          opacity: 0.55,
          blend: "screen",
          seed,
          parameters: { ...params, density: 0.5 },
        },
      ]),
  },
  {
    id: "slime-sdf",
    label: "Slime + SDF",
    description: "Authentic slime mold over SDF raymarch",
    layerMethods: {
      L0: "continuous-evolution",
      L1: "pan-left-right",
    },
    build: (seed, params) =>
      setOf("slime-sdf", "Slime + SDF", [
        {
          id: "L0",
          piece: "growth/slime-mold",
          opacity: 0.9,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "fractals/sdf-raymarch2d",
          opacity: 0.5,
          blend: "screen",
          seed: seed ^ 0x5f3759df,
          parameters: { ...params },
        },
      ]),
  },
  {
    id: "voronoi-flow",
    label: "Voronoi + flow",
    description: "Stained-glass cells with flow hatch",
    build: (seed, params) =>
      setOf("voronoi-flow", "Voronoi + flow", [
        {
          id: "L0",
          piece: "tiling/voronoi-stained-glass",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "fields/flow-hatching",
          opacity: 0.4,
          blend: "multiply",
          seed: seed ^ 0x85ebca6b,
          parameters: { ...params, density: 0.55 },
        },
      ]),
  },
  {
    id: "metatron-noodles",
    label: "Metatron + particles",
    description: "Sacred geometry with noodle trails",
    layerMethods: {
      L0: "construction",
      L1: "flow",
    },
    build: (seed, params) =>
      setOf("metatron-noodles", "Metatron + noodles", [
        {
          id: "L0",
          piece: "geometry/metatron",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "particles/noodles",
          opacity: 0.55,
          blend: "add",
          seed: seed ^ 0xc2b2ae35,
          parameters: { ...params, density: 0.6 },
        },
      ]),
  },
  {
    id: "yantra-rd",
    label: "Sri Yantra + RD",
    description: "Reaction diffusion under ritual geometry",
    layerMethods: {
      L0: "continuous-evolution",
      L1: "slow-drift",
    },
    build: (seed, params) =>
      setOf("yantra-rd", "Yantra + RD", [
        {
          id: "L0",
          piece: "reaction-diffusion/reaction-diffusion",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params, evolved_preset: "lace" },
        },
        {
          id: "L1",
          piece: "geometry/sri-yantra",
          opacity: 0.5,
          blend: "screen",
          seed,
          parameters: { ...params, density: 0.55 },
        },
      ]),
  },
  {
    id: "slime-geometry",
    label: "Slime + geometry nutrients",
    description: "Slime mold guided by Metatron site map",
    build: (seed, params) =>
      setOf("slime-geometry", "Slime + geometry", [
        {
          id: "L0",
          piece: "growth/slime-mold",
          opacity: 0.95,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "geometry/metatron",
          opacity: 0.35,
          blend: "screen",
          seed: seed ^ 0x27d4eb2d,
          parameters: { ...params, density: 0.4 },
        },
      ]),
  },
  {
    id: "truchet-growth",
    label: "Truchet + differential growth",
    description: "Tiled field with organic growth overlay",
    build: (seed, params) =>
      setOf("truchet-growth", "Truchet + growth", [
        {
          id: "L0",
          piece: "tiling/truchet-tiles",
          opacity: 1,
          blend: "normal",
          seed,
          parameters: { ...params },
        },
        {
          id: "L1",
          piece: "growth/differential-growth",
          opacity: 0.55,
          blend: "screen",
          seed: seed ^ 0x165667b1,
          parameters: { ...params, density: 0.7 },
        },
      ]),
  },
];

export function compositionById(id: string): CompositionRecipe | undefined {
  return COMPOSITIONS.find((c) => c.id === id);
}
