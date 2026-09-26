/**
 * CREATE Scene authoring — save, Save As, load, Add to Set, rehearse path.
 */

import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInConfig,
  waitForStudioSceneSettled,
} from "./studioUi";
import {
  enterAnimate,
  waitForAnimationTime,
  waitForLiveFrame,
  studioDiag,
} from "./animationMetrics";

test.describe("Studio Scene authoring", () => {
  test("save, Save As, reload, and add to Set draft", async ({ page }) => {
    test.setTimeout(240_000);
    await openStudioHome(page);
    await page.evaluate(() => {
      (
        window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
      ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
    });
    await clickStudioMode(page, "animate");
    await selectPieceInConfig(page, "fractals/strange-attractors");
    await waitForLiveFrame(page);

    await page.fill("#scene-name", "E2E Attractors");
    await page.click("#scene-save");
    await expect(page.locator(".scene-dirty-hint")).toContainText("Saved");

    await page.fill("#cfg-seed", "7777");
    await page.dispatchEvent("#cfg-seed", "change");
    await waitForStudioSceneSettled(page);
    await expect(page.locator(".scene-dirty-hint")).toContainText("Unsaved");

    await page.click("#scene-save-as");
    await waitForStudioSceneSettled(page);

    await page.selectOption("#scene-load", { label: "E2E Attractors" });
    await waitForStudioSceneSettled(page);
    const seedAfterLoad = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__?: { seed?: number } }).__NUMBRANE_STUDIO__?.seed,
    );
    expect(seedAfterLoad).not.toBe(7777);

    await page.click("#scene-add-set");
    await page.click('#workflow-nav button[data-workflow="set"]');
    await page.waitForSelector("#set-score-rail", { timeout: 10_000 });
    await expect(page.locator("#set-score-rail")).toContainText("E2E Attractors");
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
    expect(d.animationDurationSec).toBeGreaterThan(0);
    expect((d.animationPhase as number) ?? 0).toBeLessThan(0.999);
  });
});
