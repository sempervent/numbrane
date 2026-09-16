/**
 * 30-second sustained ANIMATE soak — representative subset, decoded pixels.
 */

import { test, expect } from "@playwright/test";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";
import { enterAnimate, sampleStagePixels, studioDiag, waitForLiveFrame } from "./animationMetrics";

const SOAK_PIECES = [
  "flagship/latticefall",
  "reaction-diffusion/reaction-diffusion",
  "growth/slime-mold",
  "particles/noodles",
  "fractals/sdf-raymarch2d",
  "fractals/escape-time",
  "fractals/strange-attractors",
  "geometry/metatron",
  "tiling/truchet-tiles",
];

const SOAK_MS = 30_000;
const SAMPLE_INTERVAL_MS = 2_000;

test.describe("Studio animation soak (Docker)", () => {
  for (const piece of SOAK_PIECES) {
    test(`${piece} — 30s sustained motion`, async ({ page }) => {
      test.setTimeout(120_000);
      await enterAnimate(page, piece, 42);
      await waitForLiveFrame(page, 30_000);

      const samples: PixelFrame[] = [];
      const loopAlive: boolean[] = [];
      let lastPresent = 0;
      let lastRaf = 0;
      const start = Date.now();
      while (Date.now() - start < SOAK_MS) {
        samples.push(await sampleStagePixels(page));
        const d = await studioDiag(page);
        const present = d.presentCount ?? 0;
        const raf = d.rafCount ?? 0;
        loopAlive.push(
          !d.rafStalled && (present > lastPresent || raf > lastRaf || (d.rafHz ?? 0) > 2),
        );
        lastPresent = present;
        lastRaf = raf;
        await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      }

      expect(
        loopAlive.filter(Boolean).length,
        `${piece} render loop alive throughout soak`,
      ).toBeGreaterThanOrEqual(Math.max(1, loopAlive.length - 1));

      let motionHits = 0;
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i]!;
        if (
          s.changedPixelFraction >= 0.003 ||
          isMeaningfulVisualChange(samples[i - 1]!, s) ||
          s.digest !== samples[i - 1]!.digest
        ) {
          motionHits += 1;
        }
      }
      expect(motionHits, `${piece} motion hits over 30s`).toBeGreaterThanOrEqual(4);
    });
  }
});
