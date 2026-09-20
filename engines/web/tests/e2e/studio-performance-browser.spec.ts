import { test, expect } from "@playwright/test";

test.describe("Performance browser", () => {
  test("opens curated catalog with motion pane and actions", async ({ page }) => {
    await page.goto("/studio.html?mode=animate&piece=fractals/sdf-raymarch2d&seed=42");
    await page.waitForFunction(
      () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    );
    await page.keyboard.press("p");
    await expect(page.locator("#browser")).toHaveClass(/visible/);
    await expect(page.locator("#browser-header")).toContainText("Performance catalog");
    await expect(page.locator("#browser .chip, #browser .chips button.on")).toBeTruthy();
    const curatedOn = page.locator("#browser-header .chips button.on");
    await expect(curatedOn).toHaveText(/curated/);
    await expect(page.locator("#browser-list-host .piece").first()).toBeVisible();
    await expect(page.locator("#browser-motion-canvas")).toBeAttached();
    const first = page.locator("#browser-list-host .piece").first();
    await first.hover();
    await page.waitForTimeout(500);
    await expect(page.locator("#browser-motion")).toBeVisible();
    await first.locator('button[data-animate]').click();
    await page.waitForTimeout(800);
    await expect(page.locator("#browser")).not.toHaveClass(/visible/);
  });
});
