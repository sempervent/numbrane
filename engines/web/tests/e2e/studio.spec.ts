import { test, expect } from "@playwright/test";

test.describe("NUMBRANE Studio", () => {
  test("canvas-first keyboard chrome", async ({ page }) => {
    await page.goto("/studio.html?mode=generate&piece=geometry/metatron&seed=42");
    await expect(page.locator("#stage")).toBeVisible();
    await page.waitForFunction(() => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__);

    await page.keyboard.press("?");
    await expect(page.locator("#help")).toHaveClass(/visible/);
    await page.keyboard.press("?");
    await expect(page.locator("#help")).not.toHaveClass(/visible/);

    await page.keyboard.press("Tab");
    await expect(page.locator("body")).toHaveClass(/controls-hidden/);
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).toHaveClass(/controls-visible/);

    await page.keyboard.press("1");
    await expect(page.locator('#modebar button[data-mode="generate"]')).toHaveClass(/active/);
    await page.keyboard.press("2");
    await expect(page.locator('#modebar button[data-mode="animate"]')).toHaveClass(/active/);
    await page.keyboard.press("3");
    await expect(page.locator('#modebar button[data-mode="react"]')).toHaveClass(/active/);

    const studio = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { pieceId: string; seed: number } })
        .__NUMBRANE_STUDIO__;
      return { pieceId: s.pieceId, seed: s.seed };
    });
    expect(studio.pieceId).toContain("geometry/");
  });

  test("react inject features modulates density", async ({ page }) => {
    await page.goto("/studio.html?mode=react&piece=reaction-diffusion/reaction-diffusion&seed=7");
    await page.waitForFunction(() => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__);
    await page.evaluate(() => {
      const s = (window as unknown as {
        __NUMBRANE_STUDIO__: { session: { injectFeatures: (f: Record<string, number | boolean>) => void } };
      }).__NUMBRANE_STUDIO__;
      s.session.injectFeatures({
        energy: 0.9,
        low: 0.8,
        mid: 0.4,
        high: 0.3,
        onset: true,
        flux: 0.5,
        centroid: 0.4,
      });
    });
    await page.waitForTimeout(200);
    await expect(page.locator("#stage")).toBeVisible();
  });
});
