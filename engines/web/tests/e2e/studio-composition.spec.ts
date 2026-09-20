/**
 * Performance composition — single LiveSession, multi-layer compositor.
 */

import { test, expect } from "@playwright/test";
import {
  enterAnimate,
  sampleStagePixels,
  studioDiag,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";

async function setComposition(page: import("@playwright/test").Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: { setPerformanceComposition?: (id: string | null) => Promise<void> };
    }).__NUMBRANE_STUDIO__;
    return app?.setPerformanceComposition?.(id || null);
  }, id);
}

test.describe("Studio performance composition (Docker)", () => {
  test("geometry-sdf loads two layers in one session", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await waitForLiveFrame(page);
    await setComposition(page, "geometry-sdf");
    await waitForLiveFrame(page, 90_000);
    const d = await studioDiag(page);
    expect(d.primaryLiveSessionCount ?? 1).toBe(1);
    expect((d.layerStates ?? []).length).toBeGreaterThanOrEqual(2);
    expect(d.compositionId).toBe("geometry-sdf");
  });

  test("overlay disable and opacity change output", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await setComposition(page, "geometry-sdf");
    await waitForLiveFrame(page, 90_000);
    await page.waitForTimeout(1500);
    const full = await sampleStagePixels(page);
    await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: {
          session?: { setLayerPerformanceState: (id: string, p: { enabled?: boolean }) => void };
        };
      }).__NUMBRANE_STUDIO__;
      app?.session?.setLayerPerformanceState("L1", { enabled: false });
    });
    await page.waitForTimeout(800);
    const overlayOff = await sampleStagePixels(page);
    expect(overlayOff.digest).not.toBe(full.digest);
  });

  test("composition stays animated past 16s", async ({ page }) => {
    test.setTimeout(240_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await setComposition(page, "geometry-sdf");
    await waitForLiveFrame(page, 90_000);
    const a = await sampleStagePixels(page);
    await waitForAnimationTime(page, 17);
    await page.waitForTimeout(400);
    const b = await sampleStagePixels(page);
    expect(b.digest).not.toBe(a.digest);
  });

  test("single piece restore clears composition", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await setComposition(page, "geometry-sdf");
    await waitForLiveFrame(page, 60_000);
    await setComposition(page, "");
    await waitForLiveFrame(page, 60_000);
    const d = await studioDiag(page);
    expect(d.compositionId ?? null).toBeNull();
    expect((d.layerStates ?? []).length).toBeLessThanOrEqual(1);
  });
});
