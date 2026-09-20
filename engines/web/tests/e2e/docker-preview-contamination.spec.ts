import { test, expect } from "@playwright/test";
import { enterAnimate, frameIsVisible, sampleStagePixels, waitForLiveFrame } from "./animationMetrics";

test("browser preview does not blank main stage afterward", async ({ page }) => {
  test.setTimeout(180_000);
  await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
  await waitForLiveFrame(page);

  await page.keyboard.press("p");
  await expect(page.locator("#browser")).toHaveClass(/visible/);
  await page.waitForTimeout(3000);
  const card = page.locator("#browser-list-host .piece").first();
  await card.hover();
  await page.waitForTimeout(1200);
  await page.keyboard.press("p");
  await page.waitForTimeout(500);

  await page.goto("/studio.html?mode=animate&piece=reaction-diffusion/reaction-diffusion&seed=44021");
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
  );
  await waitForLiveFrame(page, 45_000);
  const px = await sampleStagePixels(page);
  expect(frameIsVisible(px)).toBe(true);
});
