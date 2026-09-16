/**
 * Studio piece contract — GENERATE + ANIMATE methods + Random sequencer.
 */

import { test, expect } from "@playwright/test";
import {
  enterAnimateViaUi,
  enterGenerateViaUi,
  failureBannerText,
  fetchBrowserCatalog,
} from "./studioUi";
import { frameIsVisible, sampleStagePixels, waitForStudioPresent } from "./animationMetrics";
import { animationMethodsForPiece } from "../../src/studio/animation/methods";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

test.describe("Studio piece contract", () => {
  test("catalog has 31 maintained pieces", async ({ baseURL }) => {
    const catalog = await fetchBrowserCatalog(baseURL!);
    expect(catalog.length).toBe(31);
  });

  for (const piece of catalogPieces) {
    test(`${piece} contract`, async ({ page }) => {
      test.setTimeout(360_000);

      await enterGenerateViaUi(page, piece);
      expect(await failureBannerText(page)).toBeNull();
      await page.waitForTimeout(2000);
      const genPx = await sampleStagePixels(page);
      expect(frameIsVisible(genPx), `${piece} generate`).toBe(true);

      await enterAnimateViaUi(page, piece);
      expect(await failureBannerText(page)).toBeNull();
      await waitForStudioPresent(page, 90_000);

      const methods = animationMethodsForPiece(piece);
      expect(methods.length).toBeGreaterThanOrEqual(3);

      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void } })
          .__NUMBRANE_STUDIO__?.applyAnimationMethodId?.("pan-left-right");
      });
      await page.waitForTimeout(1500);
      const panA = await sampleStagePixels(page);
      await page.waitForTimeout(800);
      const panB = await sampleStagePixels(page);
      expect(
        panB.digest !== panA.digest || panB.changedPixelFraction >= 0.003,
        `${piece} pan motion`,
      ).toBe(true);

      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void } })
          .__NUMBRANE_STUDIO__?.applyAnimationMethodId?.("zoom-in");
      });
      await page.waitForTimeout(1500);
      const zoomA = await sampleStagePixels(page);
      await page.waitForTimeout(800);
      const zoomB = await sampleStagePixels(page);
      expect(
        zoomB.digest !== zoomA.digest || zoomB.changedPixelFraction >= 0.003,
        `${piece} zoom motion`,
      ).toBe(true);

      const native = methods.find((m) => m.category === "native");
      if (native) {
        await page.evaluate((id) => {
          (window as unknown as { __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (x: string) => void } })
            .__NUMBRANE_STUDIO__?.applyAnimationMethodId?.(id);
        }, native.id);
        await page.waitForTimeout(2000);
        expect(await failureBannerText(page)).toBeNull();
      }

      await page.evaluate(() => {
        const app = (window as unknown as {
          __NUMBRANE_STUDIO__?: {
            applyAnimationMethodId?: (id: string) => void;
            randomIntervalSec?: number;
          };
        }).__NUMBRANE_STUDIO__;
        if (app) app.randomIntervalSec = 2;
        app?.applyAnimationMethodId?.("random");
      });
      const segments: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(1000);
        const seg = await page.evaluate(() => {
          const app = (window as unknown as {
            __NUMBRANE_STUDIO__?: { animationSpec?: { source?: string; motion?: string } };
          }).__NUMBRANE_STUDIO__;
          return `${app?.animationSpec?.source}/${app?.animationSpec?.motion}`;
        });
        segments.push(seg);
      }
      const uniq = new Set(segments);
      expect(uniq.size, `${piece} random segments ${segments.join(" | ")}`).toBeGreaterThanOrEqual(3);
      expect(await failureBannerText(page)).toBeNull();
    });
  }
});
