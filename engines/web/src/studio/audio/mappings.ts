/**
 * Default REACT audio mappings per piece family (meaningful algorithm params).
 * Prefers piece-specific PFL profiles with optional sensitivity scaling.
 */

import {
  scaledMappings,
  type ReactSensitivity,
} from "./profiles";

export type AudioMapping = {
  source: string;
  target: string;
  amount: number;
  curve?: "linear" | "ease";
};

export function defaultMappingsForPiece(
  pieceId: string,
  sensitivity: ReactSensitivity = "balanced",
): AudioMapping[] {
  return scaledMappings(pieceId, sensitivity);
}
