/**
 * GENERATE warm-up — Differential Growth must reach a meaningful preview interactively.
 */

import { test, expect } from "@playwright/test";
import {
  frameHasMeaningfulStructure,
  frameIsVisible,
  sampleStagePixels,
  waitForLiveFrame,
} from "./animationMetrics";
import { clickStudioMode } from "./studioUi";

const PIECE = "growth/differential-growth";
const SEED = 42;

test.describe("GENERATE differential growth warm-up", () => {
  test("live warm-up produces meaningful preview and continues in Animate", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(
      `/studio.html?mode=generate&piece=${encodeURIComponent(PIECE)}&seed=${SEED}`,
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
    await waitForLiveFrame(page, 15_000);
    const gen0 = await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: {
          getGenerateDiagnostics?: () => Record<string, unknown>;
        };
      }).__NUMBRANE_STUDIO__;
      return app?.getGenerateDiagnostics?.() ?? {};
    });
    expect(gen0.surface).toBe("live");
    expect(gen0.generatePolicy).toMatchObject({ interactive: "warmup" });

    let meaningfulMs = -1;
    for (let i = 0; i < 40; i++) {
      const px = await sampleStagePixels(page);
      if (frameHasMeaningfulStructure(px)) {
        meaningfulMs = Date.now() - t0;
        break;
      }
      await page.waitForTimeout(250);
    }
    expect(meaningfulMs, "meaningful structure within interactive budget").toBeGreaterThan(0);
    expect(meaningfulMs).toBeLessThan(12_000);

    const gen1 = await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: {
          getGenerateDiagnostics?: () => Record<string, unknown>;
          getAnimationDiagnostics?: () => { logicalFrame?: number };
        };
      }).__NUMBRANE_STUDIO__;
      return {
        gen: app?.getGenerateDiagnostics?.() ?? {},
        frame: app?.getAnimationDiagnostics?.().logicalFrame ?? 0,
      };
    });
    expect(Number(gen1.gen.lastWarmupStepsCompleted ?? 0)).toBeGreaterThan(20);
    const warmupFrame = gen1.frame;

    await clickStudioMode(page, "animate");
    await waitForLiveFrame(page, 8_000);
    const after = await page.evaluate(() => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: {
          seed: number;
          pieceId: string;
          getAnimationDiagnostics?: () => { logicalFrame?: number; animationTimeSec?: number };
        };
      }).__NUMBRANE_STUDIO__;
      return {
        seed: app?.seed,
        piece: app?.pieceId,
        frame: app?.getAnimationDiagnostics?.().logicalFrame ?? 0,
        time: app?.getAnimationDiagnostics?.().animationTimeSec ?? 0,
      };
    });
    expect(after.piece).toBe(PIECE);
    expect(after.seed).toBe(SEED);
    expect(after.frame).toBeGreaterThanOrEqual(warmupFrame - 2);
    expect(after.time).toBeGreaterThan(0.02);

    const px = await sampleStagePixels(page);
    expect(frameIsVisible(px)).toBe(true);
    expect(frameHasMeaningfulStructure(px)).toBe(true);

    const status = await page.locator("#gen-status.visible").count();
    expect(status).toBe(0);
  });
});
