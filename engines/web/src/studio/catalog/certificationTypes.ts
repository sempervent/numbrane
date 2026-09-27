/**
 * Catalog render certification — structured report rows (not artistic goldens).
 */

import type { GeneratePolicy } from "../runtime/registry";
import type { RendererKind } from "../runtime/registry";
import type { RenderHealthClass } from "./renderHealth";

export type CatalogCertMode = "generate" | "animate";

export type CatalogCertRow = {
  pieceId: string;
  displayName: string;
  family: string;
  rendererGenerate: RendererKind;
  rendererAnimate: RendererKind | null;
  generatePolicy: GeneratePolicy;
  generateHealth: RenderHealthClass;
  animateHealth: RenderHealthClass;
  generateReadyMs: number;
  animateReadyMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  canvasWidth: number;
  canvasHeight: number;
  presentCount: number;
  alphaCoverage: number;
  luminanceVariance: number;
  occupiedFraction: number;
  animationTimeSec: number;
  screenshotPath: string;
  blockedByChildren?: { pieceId: string; health: RenderHealthClass }[];
  notes: string;
};

export type CatalogCertReport = {
  generatedAt: string;
  branch: string;
  head: string;
  totals: Record<RenderHealthClass, number>;
  rows: CatalogCertRow[];
};
