/**
 * Studio performance contract — visible indefinite ANIMATE for full catalog.
 */

import { test, expect } from "@playwright/test";
import { enterAnimateViaUi, failureBannerText } from "./studioUi";
import { frameIsVisible, sampleStagePixels, waitForLiveFrame } from "./animationMetrics";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

test.describe("Studio performance contract", () => {
  for (const piece of catalogPieces) {
    test(`${piece} performance animate`, async ({ page }) => {
      test.setTimeout(180_000);

      await enterAnimateViaUi(page, piece);
      expect(await failureBannerText(page)).toBeNull();
      await waitForLiveFrame(page, 45_000);

      const t0 = await sampleStagePixels(page);
      expect(frameIsVisible(t0), `${piece} first frame`).toBe(true);

      await page.waitForTimeout(10_000);
      const t1 = await sampleStagePixels(page);
      expect(frameIsVisible(t1), `${piece} after 10s`).toBe(true);
      expect(
        t1.digest !== t0.digest || t1.changedPixelFraction >= 0.003,
        `${piece} motion 10s`,
      ).toBe(true);

      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void } })
          .__NUMBRANE_STUDIO__?.applyAnimationMethodId?.("zoom-in");
      });
      await page.waitForTimeout(1500);
      const zoom = await sampleStagePixels(page);
      expect(frameIsVisible(zoom), `${piece} zoom method`).toBe(true);

      await page.evaluate(() => {
        const app = (window as unknown as {
          __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void; randomIntervalSec?: number };
        }).__NUMBRANE_STUDIO__;
        if (app) app.randomIntervalSec = 2;
        app?.applyAnimationMethodId?.("random");
      });

      const segments: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(1000);
        const seg = await page.evaluate(() => {
          const app = (window as unknown as {
            __NUMBRANE_STUDIO__?: { activeAnimationMethodId?: string };
          }).__NUMBRANE_STUDIO__;
          return app?.activeAnimationMethodId ?? "";
        });
        segments.push(seg);
        const px = await sampleStagePixels(page);
        expect(frameIsVisible(px), `${piece} random segment ${i}`).toBe(true);
      }
      expect(new Set(segments).size, `${piece} random segments`).toBeGreaterThanOrEqual(3);

      await page.keyboard.press("]");
      await waitForLiveFrame(page, 20_000);
      const afterSwitch = await sampleStagePixels(page);
      expect(frameIsVisible(afterSwitch), `${piece} after piece switch`).toBe(true);
    });
  }
});
