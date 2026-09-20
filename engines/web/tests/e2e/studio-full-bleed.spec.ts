/**
 * Performance stage fills viewport — no letterboxed scope / inset render target.
 */

import { test, expect } from "@playwright/test";
import { enterAnimate, waitForLiveFrame, studioDiag, sampleStagePixels } from "./animationMetrics";

const viewports = [
  { width: 1920, height: 1080, name: "1080p" },
  { width: 1280, height: 720, name: "720p" },
  { width: 2560, height: 1440, name: "1440p" },
  { width: 1440, height: 900, name: "non-16:9" },
];

for (const vp of viewports) {
  test(`full-bleed stage @ ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await enterAnimate(page, "tiling/truchet-tiles", 42);
    await waitForLiveFrame(page);
    let px = await sampleStagePixels(page);
    for (let i = 0; i < 40 && px.occupiedFraction < 0.008; i++) {
      await page.waitForTimeout(500);
      px = await sampleStagePixels(page);
    }
    const d = await studioDiag(page);
    const dpr = await page.evaluate(() => Math.min(2, window.devicePixelRatio || 1));
    expect(d.canvasWidth ?? 0).toBeGreaterThanOrEqual(Math.floor(vp.width * dpr * 0.65));
    expect(d.canvasHeight ?? 0).toBeGreaterThanOrEqual(Math.floor(vp.height * dpr * 0.65));

    const scope = await page.evaluate(() => {
      const m = (
        window as unknown as {
          __NUMBRANE_STUDIO__?: {
            sampleStageScopeMetrics?: () => {
              borderMeanLuma: number;
              innerMeanLuma: number;
            } | null;
          };
        }
      ).__NUMBRANE_STUDIO__?.sampleStageScopeMetrics?.();
      if (!m) throw new Error("sampleStageScopeMetrics unavailable");
      return m;
    });

    expect(px.occupiedFraction).toBeGreaterThan(0.008);
    // Letterboxed scope: bright interior, near-black border ring.
    const scopedBox =
      scope.innerMeanLuma > 35 &&
      scope.borderMeanLuma < 10 &&
      scope.innerMeanLuma / Math.max(1, scope.borderMeanLuma) > 6;
    expect(scopedBox).toBe(false);
    expect(scope.innerMeanLuma + scope.borderMeanLuma).toBeGreaterThan(6);
  });
}
