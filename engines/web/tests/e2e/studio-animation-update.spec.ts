/**
 * Regression: live sim updates must advance (not frozen snapshot with render-only loop).
 */

import { test, expect } from "@playwright/test";
import { enterAnimate, studioDiag, waitForLiveFrame } from "./animationMetrics";

const MATRIX: { piece: string; minUpdates: number; waitMs: number }[] = [
  { piece: "reference/circle-lattice", minUpdates: 2, waitMs: 2500 },
  { piece: "fractals/sdf-raymarch2d", minUpdates: 5, waitMs: 2500 },
  { piece: "reaction-diffusion/reaction-diffusion", minUpdates: 5, waitMs: 3500 },
  { piece: "geometry/metatron", minUpdates: 2, waitMs: 2500 },
];

test.describe("Studio live update count advances", () => {
  test.setTimeout(120_000);

  for (const { piece, minUpdates, waitMs } of MATRIX) {
    test(`${piece} — updateCount grows in animate`, async ({ page }) => {
      await enterAnimate(page, piece);
      await waitForLiveFrame(page);
      const d0 = await studioDiag(page);
      expect(d0.useSourceSnapshot, `${piece} should not freeze on snapshot`).toBe(false);
      await page.waitForTimeout(waitMs);
      const d1 = await studioDiag(page);
      expect(d1.updateCount ?? 0, `${piece} updateCount`).toBeGreaterThanOrEqual(minUpdates);
      expect(d1.renderCount ?? 0).toBeGreaterThan(d0.renderCount ?? 0);
      expect(d1.presentCount ?? 0).toBeGreaterThan(d0.presentCount ?? 0);
    });
  }
});
