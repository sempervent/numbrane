/**
 * Human catalog review sentinels — meaningful structure in GENERATE and ANIMATE.
 */

import { test, expect } from "@playwright/test";
import { HUMAN_FAILED_SENTINELS } from "../../src/studio/catalog/sentinels";
import {
  frameHasMeaningfulStructure,
  sampleStagePixels,
  studioDiag,
  waitForLiveFrame,
  waitForStudioPresent,
} from "./animationMetrics";
import { classifyPixelFrame } from "../../src/studio/catalog/renderHealth";
import { clickStudioMode } from "./studioUi";

const SEED = 42;

test.describe("catalog render sentinels (human review list)", () => {
  test.describe.configure({ mode: "serial" });

  for (const pieceId of HUMAN_FAILED_SENTINELS) {
    test(`${pieceId} — GENERATE and ANIMATE meaningful structure`, async ({ page }) => {
      test.setTimeout(180_000);

      await page.goto(
        `/studio.html?mode=generate&piece=${encodeURIComponent(pieceId)}&seed=${SEED}`,
        { waitUntil: "domcontentloaded", timeout: 30_000 },
      );
      await page.waitForFunction(
        () =>
          (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
            .__NUMBRANE_STUDIO__?.studioBootComplete === true,
        null,
        { timeout: 90_000 },
      );
      await page.waitForFunction(
        () => {
          const app = (window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } })
            .__NUMBRANE_STUDIO__;
          return !app?.generating;
        },
        null,
        { timeout: 120_000 },
      );
      await waitForStudioPresent(page, 90_000);
      const genPx = await sampleStagePixels(page);
      const genClass = classifyPixelFrame(genPx);
      expect(
        frameHasMeaningfulStructure(genPx),
        `${pieceId} generate structure (class=${genClass})`,
      ).toBe(true);
      expect(genClass, `${pieceId} generate health`).not.toBe("WRONG_OUTPUT");

      await clickStudioMode(page, "animate");
      await waitForLiveFrame(page, 60_000);
      await page.waitForTimeout(1500);
      const animPx = await sampleStagePixels(page);
      const animDiag = await studioDiag(page);
      expect(frameHasMeaningfulStructure(animPx), `${pieceId} animate structure`).toBe(true);
      expect((animDiag.animationTimeSec ?? 0) > 0.05, `${pieceId} animation time`).toBe(true);
    });
  }
});
