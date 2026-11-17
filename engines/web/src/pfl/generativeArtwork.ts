/**
 * Minimal contract for PFL generative artworks (one scheduler, many algorithms).
 */

import type { LumaReport } from "./luma";
import type { VisualParams } from "./features";
import type { ArtworkId } from "./artworkTypes";

export interface GenerativeArtwork {
  readonly id: ArtworkId;
  readonly name: string;
  resize(): void;
  step(dtSec: number, params: VisualParams, timeSec?: number): void;
  applyVariation(seed: number): void;
  getSeed(): number;
  /** Human-readable variation facet (archetype, lattice rhythm, etc.). */
  getVariationFacet(): string;
  sampleLumaReport(): LumaReport;
  dispose(): void;
}
