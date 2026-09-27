/**
 * GENERATE must be interactive for browser-native mashups (human repro: attractor calligraphy).
 */

import { test, expect } from "@playwright/test";
import {
  frameIsVisible,
  sampleStagePixels,
  waitForLiveFrame,
} from "./animationMetrics";
import { clickStudioMode } from "./studioUi";

const MASHUP = "mashups/attractor-calligraphy";
const SEED = 42;

test.describe("GENERATE interactive mashup", () => {
  test("attractor calligraphy shows live preview quickly, then animates same seed", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(
      `/studio.html?mode=generate&piece=${encodeURIComponent(MASHUP)}&seed=${SEED}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await page.waitForFunction(
      () =>
        (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
          .__NUMBRANE_STUDIO__?.studioBootComplete === true,
      null,
      { timeout: 90_000 },
    );

    const t0 = Date.now();
    await waitForLiveFrame(page, 8_000);
    const firstVisualMs = Date.now() - t0;
    const gen = await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { getGenerateDiagnostics?: () => Record<string, unknown> };
      }).__NUMBRANE_STUDIO__;
      return app?.getGenerateDiagnostics?.() ?? {};
    });
    expect(gen.surface).toBe("live");
    expect(gen.generatePreviewClass).toBe("interactive");
    expect(firstVisualMs, "first meaningful preview").toBeLessThan(8_000);
    expect(Number(gen.lastInteractivePreviewMs ?? 99_999)).toBeLessThan(8_000);

    const px = await sampleStagePixels(page);
    expect(frameIsVisible(px)).toBe(true);

    const status = await page.locator("#gen-status.visible").count();
    expect(status).toBe(0);

    await clickStudioMode(page, "animate");
    await waitForLiveFrame(page, 8_000);
    const after = await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { seed: number; pieceId: string; getAnimationDiagnostics?: () => { animationTimeSec?: number } };
      }).__NUMBRANE_STUDIO__;
      return {
        seed: app?.seed,
        piece: app?.pieceId,
        time: app?.getAnimationDiagnostics?.().animationTimeSec ?? 0,
      };
    });
    expect(after.piece).toBe(MASHUP);
    expect(after.seed).toBe(SEED);
    expect(after.time).toBeGreaterThan(0.05);
    const px2 = await sampleStagePixels(page);
    expect(frameIsVisible(px2)).toBe(true);
  });
});
