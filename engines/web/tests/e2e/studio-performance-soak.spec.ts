/**
 * Long soak — stage must never go black on representative performance pieces.
 */

import { test, expect } from "@playwright/test";
import { enterAnimateViaUi } from "./studioUi";
import { frameIsVisible, sampleStagePixels, studioDiag } from "./animationMetrics";

const SOAK_PIECES = [
  "audiovisual/nodes",
  "flagship/latticefall",
  "reaction-diffusion/reaction-diffusion",
  "growth/slime-mold",
  "particles/noodles",
  "geometry/metatron",
  "fractals/escape-time",
  "fractals/strange-attractors",
  "tiling/truchet-tiles",
  "mashups/cosmic-venation-tiles",
];

for (const piece of SOAK_PIECES) {
  test(`${piece} 60s performance soak`, async ({ page }) => {
    test.setTimeout(240_000);
    await enterAnimateViaUi(page, piece);

    const digests: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      const px = await sampleStagePixels(page);
      expect(frameIsVisible(px), `${piece} visible at ${(i + 1) * 5}s`).toBe(true);
      digests.push(px.digest);
      const d = await studioDiag(page);
      expect((d.rafCount ?? 0) > 0, `${piece} raf alive`).toBe(true);
      expect((d.presentCount ?? 0) > 0, `${piece} present alive`).toBe(true);
    }
    const motionHits = digests.filter((d, i) => i > 0 && d !== digests[i - 1]).length;
    expect(motionHits, `${piece} meaningful changes over 60s`).toBeGreaterThanOrEqual(2);
  });
}
