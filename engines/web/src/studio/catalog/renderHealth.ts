/**
 * Catalog render health — structural signals, not artistic goldens.
 */

import { frameHasMeaningfulStructure, type PixelFrame } from "../../live/pixelMetrics";

export type RenderHealthClass =
  | "PASS"
  | "DEGRADED"
  | "BLANK"
  | "INVALID"
  | "WRONG_OUTPUT"
  | "UNSUPPORTED";

export function classifyPixelFrame(px: PixelFrame | null | undefined): RenderHealthClass {
  if (!px) return "INVALID";
  if (!frameHasMeaningfulStructure(px)) return "BLANK";
  if (px.occupiedFraction > 0.88 && px.luminanceVariance < 1.5) {
    return "WRONG_OUTPUT";
  }
  if (px.luminanceVariance < 0.4 && px.occupiedFraction < 0.12) {
    return "DEGRADED";
  }
  return "PASS";
}
