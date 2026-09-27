/**
 * Regression: audiovisual/nodes must never present a black stage in ANIMATE.
 */

import { test, expect } from "@playwright/test";
import { enterAnimateViaUi, failureBannerText } from "./studioUi";
import { frameIsVisible, sampleStagePixels, studioDiag, waitForLiveFrame } from "./animationMetrics";

const NODE_PIECES = ["audiovisual/nodes", "reference/audiovisual-nodes"] as const;

for (const piece of NODE_PIECES) {
  test(`${piece} animate is visible and keeps moving 30s`, async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimateViaUi(page, piece);
    expect(await failureBannerText(page)).toBeNull();
    await waitForLiveFrame(page, 30_000);

    const first = await sampleStagePixels(page);
    expect(frameIsVisible(first), `${piece} first frame`).toBe(true);
    expect(first.meanLuminance, `${piece} luminance`).toBeGreaterThan(2);

    const samples = [first];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);
      const px = await sampleStagePixels(page);
      samples.push(px);
      expect(frameIsVisible(px), `${piece} visible at ${(i + 1) * 5}s`).toBe(true);
    }

    const diag = await studioDiag(page);
    expect(diag.animationTimeSec ?? 0, `${piece} animation clock`).toBeGreaterThan(25);
    const digest0 = diag.pixelDigest ?? "";
    await page.waitForTimeout(3000);
    const digest1 = (await studioDiag(page)).pixelDigest ?? "";
    expect(digest0.length).toBeGreaterThan(0);
    expect(digest1, `${piece} compositor digest evolves`).not.toBe(digest0);
    expect((diag.presentCount ?? 0) > 0, `${piece} presentCount`).toBe(true);
    expect((diag.renderCount ?? 0) > 0, `${piece} renderCount`).toBe(true);
    expect(diag.animationSource, `${piece} should run generative native`).toBe("generative");
  });
}
