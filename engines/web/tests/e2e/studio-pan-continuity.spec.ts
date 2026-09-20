/**
 * Live performance pan — monotonic motion past export cycle length (no GIF restart).
 */

import { test, expect } from "@playwright/test";
import {
  enterAnimate,
  sampleStagePixels,
  studioDiag,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";

const SCOPE_BLACK_LUMA = 8;

test.describe("Studio live pan continuity (Docker)", () => {
  test("pan left-right stays continuous past duration", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await waitForLiveFrame(page);
    await page.evaluate(() => {
      (
        window as unknown as {
          __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void };
        }
      ).__NUMBRANE_STUDIO__?.applyAnimationMethodId?.("pan-left-right");
    });
    await waitForAnimationTime(page, 1.5);

    const samples = [7.5, 7.9, 8.0, 8.1, 8.5, 15.9, 16.1, 30];
    const centerXs: number[] = [];
    const digests: string[] = [];
    for (const t of samples) {
      await waitForAnimationTime(page, t);
      await page.waitForTimeout(120);
      const d = await studioDiag(page);
      centerXs.push(d.cameraCenterX ?? 0);
      const px = await sampleStagePixels(page);
      digests.push(px.digest);
      expect(px.meanLuminance).toBeGreaterThan(SCOPE_BLACK_LUMA);
    }

    for (let i = 1; i < centerXs.length; i++) {
      expect(centerXs[i]!).toBeGreaterThan(centerXs[i - 1]! - 1e-5);
    }
    expect(digests[3]).not.toBe(digests[0]);
    expect(digests[digests.length - 1]).not.toBe(digests[2]);
  });
});
