/**
 * Minimal Studio golden path — first gate for recovery and regressions.
 */

import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  failureBannerText,
  waitForStudioBoot,
  waitForStudioSceneSettled,
} from "./studioUi";
import {
  frameIsVisible,
  sampleStagePixels,
  waitForLiveFrame,
  waitForStudioPresent,
} from "./animationMetrics";

test.describe("Studio golden path", () => {
  test("CREATE → Generate/Animate simple pieces → Set flow", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/studio.html", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForStudioBoot(page, 120_000);
    expect(await failureBannerText(page)).toBeNull();

    await page.selectOption("#cfg-piece", "tiling/truchet-tiles");
    await clickStudioMode(page, "generate");
    await waitForStudioSceneSettled(page, 120_000);
    await page.waitForFunction(
      () => {
        const app = (window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } })
          .__NUMBRANE_STUDIO__;
        return !app?.generating;
      },
      null,
      { timeout: 120_000 },
    );
    await waitForStudioPresent(page, 60_000);
    const genPx = await sampleStagePixels(page);
    expect(frameIsVisible(genPx)).toBe(true);

    await clickStudioMode(page, "animate");
    await waitForStudioSceneSettled(page, 120_000);
    await waitForLiveFrame(page, 60_000);

    const behaviorCount = await page.locator("#scene-behavior option:not([value=''])").count();
    expect(behaviorCount).toBeGreaterThan(0);
    if (behaviorCount > 0) {
      const val = await page.locator("#scene-behavior option:not([value=''])").first().getAttribute("value");
      if (val) {
        await page.selectOption("#scene-behavior", val);
        await waitForStudioSceneSettled(page, 60_000);
      }
    }

    await page.fill("#scene-name", "Golden path scene");
    await page.evaluate(() => document.getElementById("scene-save")?.click());
    await page.waitForFunction(
      () => (document.getElementById("toast")?.textContent ?? "").includes("Scene saved"),
      null,
      { timeout: 30_000 },
    );

    await page.evaluate(() => {
      (
        window as unknown as { __NUMBRANE_STUDIO__?: { setWorkflow?: (w: string) => void } }
      ).__NUMBRANE_STUDIO__?.setWorkflow?.("set");
    });
    await page.waitForTimeout(400);

    const fatal = errors.filter((e) => !e.includes("favicon"));
    expect(fatal, `console/page errors: ${fatal.join("\n")}`).toEqual([]);
  });
});
