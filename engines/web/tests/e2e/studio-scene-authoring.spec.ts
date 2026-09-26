/**
 * CREATE Scene authoring — save, Save As, load, Add to Set, rehearse path.
 */

import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInConfig,
  waitForStudioSceneSettled,
  studioPieceState,
} from "./studioUi";
import {
  enterAnimate,
  waitForAnimationTime,
  waitForLiveFrame,
  studioDiag,
  frameIsVisible,
  sampleStagePixels,
} from "./animationMetrics";

test.describe("Studio Scene authoring", () => {
  test("save, Save As, reload, and add to Set draft", async ({ page }) => {
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

    const sceneLabel = `E2E Attractors ${Date.now().toString(36)}`;
    await page.fill("#scene-name", sceneLabel);
    await page.evaluate(() => document.getElementById("scene-save")?.click());
    await page.waitForFunction(
      () => (document.getElementById("toast")?.textContent ?? "").includes("Scene saved"),
      null,
      { timeout: 30_000 },
    );
    await expect(page.locator(".scene-dirty-hint")).toContainText("Saved", { timeout: 5_000 });
    const originalSceneId = await page.evaluate(
      () =>
        (
          window as unknown as { __NUMBRANE_STUDIO__?: { sceneAuthoring?: { activeSceneId?: string } } }
        ).__NUMBRANE_STUDIO__?.sceneAuthoring?.activeSceneId ?? "",
    );
    expect(originalSceneId.length).toBeGreaterThan(0);

    await page.evaluate(async () => {
      const app = window.__NUMBRANE_STUDIO__ as {
        seed?: number;
        enqueueApplyPieceScene?: () => Promise<void>;
      };
      if (!app) return;
      app.seed = 7777;
      await app.enqueueApplyPieceScene?.();
    });
    await waitForStudioSceneSettled(page);
    await page.waitForFunction(
      () =>
        (
          window as unknown as { __NUMBRANE_STUDIO__?: { isSceneAuthoringDirty?: () => boolean } }
        ).__NUMBRANE_STUDIO__?.isSceneAuthoringDirty?.() === true,
      null,
      { timeout: 15_000 },
    );

    await page.evaluate(() => document.getElementById("scene-save-as")?.click());
    await waitForStudioSceneSettled(page);

    await page.evaluate(async (id) => {
      const app = window.__NUMBRANE_STUDIO__ as { loadSceneRecipeById?: (id: string) => Promise<void> };
      await app.loadSceneRecipeById?.(id);
    }, originalSceneId);
    await waitForStudioSceneSettled(page);
    const seedAfterLoad = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__?: { seed?: number } }).__NUMBRANE_STUDIO__?.seed,
    );
    expect(seedAfterLoad).toBe(42);

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
    const state = await studioPieceState(page);
    expect(state.pieceId).toBe("fractals/strange-attractors");
  });

  test("restart keeps seed; animation stays live past 8s", async ({ page }) => {
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
    const seedBefore = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__?: { seed?: number } }).__NUMBRANE_STUDIO__?.seed,
    );
    await page.click("#cfg-restart-scene");
    await waitForAnimationTime(page, 0.5);
    const seedAfter = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__?: { seed?: number } }).__NUMBRANE_STUDIO__?.seed,
    );
    expect(seedAfter).toBe(seedBefore);

    await waitForAnimationTime(page, 9);
    const d = await studioDiag(page);
    expect(d.animationTimeSec ?? 0).toBeGreaterThan(8);
    expect(d.animationEndBehavior).toBe("continuous");
    expect((d.animationPhase as number) ?? 0).toBeLessThan(0.999);
  });
});
