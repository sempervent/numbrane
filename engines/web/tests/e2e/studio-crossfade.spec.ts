import { test, expect } from "@playwright/test";
import { frameIsVisible, sampleStagePixels, waitForLiveFrame } from "./animationMetrics";

type StudioWin = {
  __NUMBRANE_STUDIO__: {
    setPiece: (id: string) => Promise<void>;
    pieceTransition: "cut" | "crossfade";
  };
};

test("crossfade shows outgoing hold then incoming stage", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/studio.html?mode=animate&piece=geometry/metatron&seed=42");
  await page.waitForFunction(() => !!(window as unknown as StudioWin).__NUMBRANE_STUDIO__);
  await waitForLiveFrame(page);

  await page.evaluate(() => {
    (window as unknown as StudioWin).__NUMBRANE_STUDIO__.pieceTransition = "crossfade";
  });

  const holdVisibleDuring = page.waitForFunction(
    () => {
      const hold = document.getElementById("switch-hold");
      return !!hold?.classList.contains("visible") && !!hold.getAttribute("src");
    },
    null,
    { timeout: 20_000 },
  );

  await page.evaluate(() => {
    void (window as unknown as StudioWin).__NUMBRANE_STUDIO__.setPiece("fractals/sdf-raymarch2d");
  });

  await holdVisibleDuring;
  await waitForLiveFrame(page, 45_000);
  const px = await sampleStagePixels(page);
  expect(frameIsVisible(px)).toBe(true);
});

test("cut does not keep switch-hold overlay visible", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/studio.html?mode=animate&piece=geometry/metatron&seed=42");
  await page.waitForFunction(() => !!(window as unknown as StudioWin).__NUMBRANE_STUDIO__);
  await waitForLiveFrame(page);

  await page.evaluate(() => {
    (window as unknown as StudioWin).__NUMBRANE_STUDIO__.pieceTransition = "cut";
    void (window as unknown as StudioWin).__NUMBRANE_STUDIO__.setPiece("fractals/sdf-raymarch2d");
  });
  await waitForLiveFrame(page, 45_000);
  await page.waitForTimeout(500);
  const hold = page.locator("#switch-hold");
  await expect(hold).not.toHaveClass(/visible/);
});
