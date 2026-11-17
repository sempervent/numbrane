import { FlowFieldRenderer } from "./renderer";
import type { GenerativeArtwork } from "./generativeArtwork";

export class FlowFieldArtwork implements GenerativeArtwork {
  readonly id = "flow-field" as const;
  readonly name = "Flow Field";
  private inner: FlowFieldRenderer;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.inner = new FlowFieldRenderer(canvas, { seed });
  }

  resize(): void {
    this.inner.resize();
  }

  step(dtSec: number, params: import("./features").VisualParams, timeSec?: number): void {
    this.inner.step(dtSec, params, timeSec);
  }

  applyVariation(seed: number): void {
    this.inner.applyVariation(seed);
  }

  getSeed(): number {
    return this.inner.getSeed();
  }

  getVariationFacet(): string {
    return this.inner.getArchetype();
  }

  sampleLumaReport() {
    return this.inner.sampleLumaReport();
  }

  dispose(): void {
    /* canvas-owned; nothing to tear down */
  }
}
