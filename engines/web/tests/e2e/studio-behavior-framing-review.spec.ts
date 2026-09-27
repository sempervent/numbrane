/**
 * Human review artifacts — tmp/behavior-framing-review/ (BEHAVIOR_REVIEW=1).
 */

import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { waitForLiveFrame, sampleStagePixels } from "./animationMetrics";
import { waitForStudioSceneSettled } from "./studioUi";
import { spatialCoverageFromGrid } from "../../src/live/pixelMetrics";

const run = process.env.BEHAVIOR_REVIEW === "1";
const OUT = path.resolve(process.cwd(), "../../tmp/behavior-framing-review");

test.describe("behavior framing review captures", () => {
  test.skip(!run, "set BEHAVIOR_REVIEW=1");

  test("truchet behaviors and viewports", async ({ page }) => {
    test.setTimeout(300_000);
    fs.mkdirSync(OUT, { recursive: true });
    const behaviors = ["", "drift", "pulse", "orbit"] as const;
    for (const b of behaviors) {
      await page.goto(
        `/studio.html?mode=animate&piece=tiling/truchet-tiles&seed=42`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction(
        () =>
          (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
            .__NUMBRANE_STUDIO__?.studioBootComplete === true,
        null,
        { timeout: 120_000 },
      );
      if (b) await page.selectOption("#scene-behavior", b);
      await waitForStudioSceneSettled(page, 120_000);
      await waitForLiveFrame(page, 60_000);
      await page.waitForTimeout(2000);
      const label = b || "default";
      await page.locator("#stage").screenshot({
        path: path.join(OUT, `truchet-${label}.png`),
        type: "png",
      });
    }
    for (const [w, h, tag] of [
      [1280, 800, "1280x800"],
      [1920, 1080, "1920x1080"],
      [1600, 700, "wide"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/studio.html?mode=animate&piece=tiling/truchet-tiles&seed=42`, {
        waitUntil: "domcontentloaded",
      });
      await waitForLiveFrame(page, 90_000);
      await page.waitForTimeout(1500);
      await page.locator("#stage").screenshot({
        path: path.join(OUT, `truchet-${tag}.png`),
        type: "png",
      });
      const px = await sampleStagePixels(page);
      const grid = await page.evaluate(() => {
        const app = window.__NUMBRANE_STUDIO__ as {
          samplePresentedPixels?: (w?: number, h?: number) => { gridW: number; gridH: number } | null;
        };
        return app.samplePresentedPixels?.(64, 36);
      });
      void px;
      void grid;
    }
    const px = await sampleStagePixels(page);
    const raw = await page.evaluate(() => {
      const app = window.__NUMBRANE_STUDIO__ as {
        samplePresentedPixels?: (w?: number, h?: number) => unknown;
      };
      return app.samplePresentedPixels?.(64, 36);
    });
    void raw;
    fs.writeFileSync(
      path.join(OUT, "README.md"),
      `# Behavior / framing review\n\nTruchet captures at \`${OUT}\`.\n`,
    );
  });
});
