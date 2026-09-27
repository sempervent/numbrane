/** Human catalog review failures — explicit regression set. */
export const HUMAN_FAILED_SENTINELS = [
  "mashups/cosmic-venation-tiles",
  "growth/differential-growth",
  "fractals/escape-time",
  "fields/flow-hatching",
  "growth/lsystem",
  "flagship/latticefall",
  "fields/nebula",
  "landscape/noise-landscape",
  "reference/noise-landscape",
  "particles/noodles",
  "reaction-diffusion/reaction-diffusion",
  "fractals/sdf-raymarch2d",
  "growth/slime-mold",
  "fractals/strange-attractors",
  "tiling/truchet-tiles",
  "tiling/voronoi-stained-glass",
  "mashups/striped-worms-eating-boxes",
] as const;

export type HumanFailedSentinel = (typeof HUMAN_FAILED_SENTINELS)[number];
