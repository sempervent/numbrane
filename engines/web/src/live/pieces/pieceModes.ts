/** Piece id → live shader mode / submode (no WebGL imports). */

export const PIECE_MODE: Record<string, number> = {
  "geometry/metatron": 0,
  "geometry/seed-of-life": 0,
  "geometry/flower-of-life": 0,
  "geometry/sri-yantra": 0,
  "geometry/isometric": 0,
  "geometry/circle-packing": 0,
  "reference/circle-lattice": 0,
  "fields/flow-hatching": 1,
  "fields/nebula": 1,
  "landscape/noise-landscape": 1,
  "reference/noise-landscape": 1,
  "fractals/escape-time": 2,
  "fractals/strange-attractors": 2,
  "fractals/sdf-raymarch2d": 2,
  "reference/escape-time": 2,
  "growth/differential-growth": 3,
  "growth/lsystem": 3,
  "growth/slime-mold": 3,
  "reaction-diffusion/reaction-diffusion": 4,
  "tiling/truchet-tiles": 5,
  "tiling/voronoi-stained-glass": 5,
  "particles/noodles": 6,
  "audiovisual/nodes": 7,
  "reference/audiovisual-nodes": 7,
  "mashups/attractor-calligraphy": 7,
  "mashups/bureaucratic-growth-forms": 7,
  "mashups/cosmic-venation-tiles": 7,
  "mashups/ritual-diagrams": 7,
  "mashups/slime-on-sdf": 7,
  "mashups/striped-worms-eating-boxes": 7,
  "flagship/latticefall": 7,
};

/** Within a mode family, select the authentic visual (0=primary). */
export const PIECE_SUBMODE: Record<string, number> = {
  "geometry/seed-of-life": 0,
  "geometry/metatron": 1,
  "geometry/flower-of-life": 0,
  "geometry/sri-yantra": 1,
  "geometry/isometric": 2,
  "geometry/circle-packing": 2,
  "reference/circle-lattice": 0,
  "fields/flow-hatching": 0,
  "fields/nebula": 1,
  "landscape/noise-landscape": 0,
  "reference/noise-landscape": 0,
  "fractals/escape-time": 0,
  "reference/escape-time": 0,
  "fractals/strange-attractors": 1,
  "fractals/sdf-raymarch2d": 2,
  "growth/differential-growth": 0,
  "growth/lsystem": 1,
  "growth/slime-mold": 2,
  "tiling/truchet-tiles": 0,
  "tiling/voronoi-stained-glass": 1,
  "particles/noodles": 0,
  "mashups/attractor-calligraphy": 0,
  "mashups/bureaucratic-growth-forms": 1,
  "mashups/cosmic-venation-tiles": 2,
  "mashups/ritual-diagrams": 3,
  "mashups/slime-on-sdf": 4,
  "mashups/striped-worms-eating-boxes": 5,
  "audiovisual/nodes": 6,
  "reference/audiovisual-nodes": 6,
  "flagship/latticefall": 7,
};

export const LIVE_PIECE_IDS = Object.keys(PIECE_MODE);

export function pieceMode(pieceId: string): number {
  return PIECE_MODE[pieceId] ?? 7;
}

export function pieceSubmode(pieceId: string): number {
  return PIECE_SUBMODE[pieceId] ?? 0;
}
