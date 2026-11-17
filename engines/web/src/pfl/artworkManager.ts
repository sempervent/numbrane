/**
 * Single-canvas artwork lifecycle — create, switch, dispose.
 */

import type { ArtworkId } from "./artworkTypes";
import { artworkDisplayName } from "./artworkTypes";
import type { GenerativeArtwork } from "./generativeArtwork";
import { FlowFieldArtwork } from "./flowFieldArtwork";
import { FractalMorphArtwork } from "./fractalMorph";
import { BlockLatticeArtwork } from "./blockLattice";

export function createArtwork(
  id: ArtworkId,
  canvas: HTMLCanvasElement,
  seed: number,
): GenerativeArtwork {
  switch (id) {
    case "flow-field":
      return new FlowFieldArtwork(canvas, seed);
    case "fractal-morph":
      return new FractalMorphArtwork(canvas, seed);
    case "block-lattice":
      return new BlockLatticeArtwork(canvas, seed);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export type { GenerativeArtwork } from "./generativeArtwork";

export function switchArtwork(
  current: GenerativeArtwork | null,
  canvas: HTMLCanvasElement,
  id: ArtworkId,
  seed: number,
): GenerativeArtwork {
  if (current) current.dispose();
  const next = createArtwork(id, canvas, seed);
  next.resize();
  return next;
}

export function artworkLabel(artwork: GenerativeArtwork): string {
  return `${artworkDisplayName(artwork.id)} · ${artwork.getVariationFacet()}`;
}
