/**
 * CREATE behavior presets, macros, variation, persistence, Set → Rehearse.
 */

import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInConfig,
  waitForStudioSceneSettled,
} from "./studioUi";
import { waitForLiveFrame, sampleStagePixels, frameIsVisible } from "./animationMetrics";

test.describe("Studio Scene behavior authoring", () => {
  test("behavior, macros, variation, save and reload", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    test.setTimeout(240_000);
    await openStudioHome(page);
    await page.evaluate(() => {
      (
        window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
      ).__NUMBRANE_STUDIO__?.showChromeForTest?.(false);
    });
    await clickStudioMode(page, "animate");
    await selectPieceInConfig(page, "fractals/strange-attractors");
    await waitForLiveFrame(page);
    const px0 = await sampleStagePixels(page);
    expect(frameIsVisible(px0)).toBe(true);

    await page.selectOption("#scene-behavior", "drift");
    await waitForStudioSceneSettled(page);
    await page.locator("#scene-macro-energy").fill("0.85");
    await page.dispatchEvent("#scene-macro-energy", "change");
    await waitForStudioSceneSettled(page);

    await page.evaluate(() => document.getElementById("scene-variation")?.click());
    await waitForStudioSceneSettled(page);
    const seedAfterVariation = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__?: { seed?: number } }).__NUMBRANE_STUDIO__?.seed,
    );
    expect(seedAfterVariation).not.toBe(42);

    const sceneLabel = `E2E Behavior ${Date.now().toString(36)}`;
    await page.fill("#scene-name", sceneLabel);
    await page.evaluate(() => document.getElementById("scene-save")?.click());
    await page.waitForFunction(
      () => (document.getElementById("toast")?.textContent ?? "").includes("Scene saved"),
      null,
      { timeout: 30_000 },
    );
    const sceneId = await page.evaluate(
      () =>
        (
          window as unknown as { __NUMBRANE_STUDIO__?: { sceneAuthoring?: { activeSceneId?: string } } }
        ).__NUMBRANE_STUDIO__?.sceneAuthoring?.activeSceneId ?? "",
    );

    await page.evaluate(async (id) => {
      const app = window.__NUMBRANE_STUDIO__ as {
        loadSceneRecipeById?: (id: string) => Promise<void>;
      };
      await app.loadSceneRecipeById?.(id);
    }, sceneId);
    await waitForStudioSceneSettled(page);

    const restored = await page.evaluate(() => {
      const app = window.__NUMBRANE_STUDIO__ as {
        sceneAuthoringSemantics?: { behaviorPresetId?: string; creativeMacros?: { energy?: number } };
        seed?: number;
      };
      return {
        behavior: app.sceneAuthoringSemantics?.behaviorPresetId ?? "",
        energy: app.sceneAuthoringSemantics?.creativeMacros?.energy ?? 0,
        seed: app.seed ?? 0,
      };
    });
    expect(restored.behavior).toBe("drift");
    expect(restored.energy).toBeCloseTo(0.85, 1);
    expect(restored.seed).toBe(seedAfterVariation);

    await page.evaluate(() => document.getElementById("scene-add-set")?.click());
    await page.click('#workflow-nav button[data-workflow="set"]');
    await page.waitForSelector("#set-score-rail", { timeout: 10_000 });
    await expect(page.locator("#set-score-rail")).toContainText(sceneLabel);

    await page.click('#workflow-nav button[data-workflow="rehearse"]');
    await page.waitForSelector("#rehearse-panel", { timeout: 10_000 });
    await page.click("#set-rehearse-go");
    await waitForLiveFrame(page, 120_000);
    const px = await sampleStagePixels(page);
    expect(frameIsVisible(px)).toBe(true);
  });
});
