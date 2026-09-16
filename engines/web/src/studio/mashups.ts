/**
 * Mashup catalog pieces — multi-layer live sets composing authentic runtimes.
 */

import type { SetDef } from "../live/types";

function mashupSet(
  pieceId: string,
  name: string,
  layers: SetDef["scenes"][0]["layers"],
): SetDef {
  return {
    protocol_version: "0.1.0",
    set_id: pieceId,
    name,
    scenes: [
      {
        id: "main",
        name,
        layers,
        modulation: [],
        post: { bloom: 0.18, feedback: 0.05 },
      },
    ],
    cues: [],
  };
}

const MASHUP_BUILDERS: Record<
  string,
  (seed: number, params: Record<string, number | string | boolean>) => SetDef
> = {
  "mashups/attractor-calligraphy": (seed, params) =>
    mashupSet("mashups/attractor-calligraphy", "Attractor calligraphy", [
      {
        id: "L0",
        piece: "fractals/strange-attractors",
        opacity: 1,
        blend: "normal",
        seed,
        parameters: { ...params, ink: 1.6, paper_style: "warm-paper" },
      },
      {
        id: "L1",
        piece: "fields/flow-hatching",
        opacity: 0.42,
        blend: "screen",
        seed: seed ^ 0x9e3779b9,
        parameters: { ...params, density: Math.min(1, (Number(params.density) || 0.7) * 0.65) },
      },
    ]),
  "mashups/bureaucratic-growth-forms": (seed, params) =>
    mashupSet("mashups/bureaucratic-growth-forms", "Bureaucratic growth forms", [
      {
        id: "L0",
        piece: "growth/differential-growth",
        opacity: 1,
        blend: "normal",
        seed,
        parameters: { ...params, growth_rate: 1.1 },
      },
      {
        id: "L1",
        piece: "geometry/isometric",
        opacity: 0.48,
        blend: "screen",
        seed: seed ^ 0x27d4eb2d,
        parameters: { ...params, density: 0.55, "geom.levels": 3 },
      },
    ]),
  "mashups/cosmic-venation-tiles": (seed, params) =>
    mashupSet("mashups/cosmic-venation-tiles", "Cosmic venation tiles", [
      {
        id: "L0",
        piece: "growth/slime-mold",
        opacity: 0.92,
        blend: "normal",
        seed,
        parameters: { ...params },
      },
      {
        id: "L1",
        piece: "tiling/voronoi-stained-glass",
        opacity: 0.55,
        blend: "multiply",
        seed: seed ^ 0x85ebca6b,
        parameters: { ...params, num_points: 72 },
      },
    ]),
  "mashups/ritual-diagrams": (seed, params) =>
    mashupSet("mashups/ritual-diagrams", "Ritual diagrams", [
      {
        id: "L0",
        piece: "geometry/sri-yantra",
        opacity: 1,
        blend: "normal",
        seed,
        parameters: { ...params, density: 0.6 },
      },
      {
        id: "L1",
        piece: "fractals/strange-attractors",
        opacity: 0.45,
        blend: "screen",
        seed: seed ^ 0xc2b2ae35,
        parameters: { ...params, attractor_type: "clifford", ink: 1.2 },
      },
    ]),
  "mashups/slime-on-sdf": (seed, params) =>
    mashupSet("mashups/slime-on-sdf", "Slime on SDF", [
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
  "mashups/striped-worms-eating-boxes": (seed, params) =>
    mashupSet("mashups/striped-worms-eating-boxes", "Striped worms eating boxes", [
      {
        id: "L0",
        piece: "particles/noodles",
        opacity: 1,
        blend: "normal",
        seed,
        parameters: { ...params, flow: 1.4, curl: 1.2 },
      },
      {
        id: "L1",
        piece: "fractals/sdf-raymarch2d",
        opacity: 0.38,
        blend: "screen",
        seed: seed ^ 0x165667b1,
        parameters: { ...params, zoom: 1.2 },
      },
    ]),
};

export function isMashupPiece(pieceId: string): boolean {
  return pieceId.startsWith("mashups/");
}

export function buildMashupSet(
  pieceId: string,
  seed: number,
  params: Record<string, number | string | boolean>,
): SetDef | null {
  const build = MASHUP_BUILDERS[pieceId];
  return build ? build(seed, params) : null;
}
