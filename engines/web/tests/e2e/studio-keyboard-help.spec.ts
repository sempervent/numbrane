import { test, expect } from "@playwright/test";

async function waitStudio(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
  );
}

test.describe("Studio keyboard help (?)", () => {
  test("GENERATE, ANIMATE, REACT and Tab-hidden chrome", async ({ page }) => {
    await page.goto("/studio.html?mode=generate&piece=geometry/metatron&seed=42");
    await waitStudio(page);

    await page.keyboard.press("?");
    await expect(page.locator("#help")).toHaveClass(/visible/);
    await expect(page.locator("#help")).toContainText("Keyboard");
    await page.keyboard.press("?");
    await expect(page.locator("#help")).not.toHaveClass(/visible/);

    await page.keyboard.press("2");
    await expect(page.locator('#modebar button[data-mode="animate"]')).toHaveClass(/active/);
    await page.waitForTimeout(800);

    await page.keyboard.press("?");
    await expect(page.locator("#help")).toHaveClass(/visible/);
    await expect(page.locator("#help")).toContainText("Previous visualization");
    await expect(page.locator("#help")).toContainText("Next visualization");
    await expect(page.locator("#help")).toContainText("[ / ←");
    await page.keyboard.press("Escape");
    await expect(page.locator("#help")).not.toHaveClass(/visible/);

    await page.keyboard.press("Tab");
    await expect(page.locator("body")).toHaveClass(/controls-hidden/);
    await page.keyboard.press("?");
    await expect(page.locator("#help")).toHaveClass(/visible/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#help")).not.toHaveClass(/visible/);
    await expect(page.locator("body")).toHaveClass(/controls-hidden/);

    await page.keyboard.press("3");
    await expect(page.locator('#modebar button[data-mode="react"]')).toHaveClass(/active/);
    await page.keyboard.press("?");
    await expect(page.locator("#help")).toHaveClass(/visible/);
    await expect(page.locator("#help")).toContainText("Previous visualization");
    await page.keyboard.press("Escape");
  });

  test("visualization navigation keys work in ANIMATE", async ({ page }) => {
    await page.goto("/studio.html?mode=animate&piece=geometry/metatron&seed=42");
    await waitStudio(page);
    await page.waitForTimeout(600);

    const before = await page.evaluate(
      () =>
        (window as unknown as { __NUMBRANE_STUDIO__: { pieceId: string } }).__NUMBRANE_STUDIO__
          .pieceId,
    );
    await page.keyboard.press("]");
    await page.waitForTimeout(1200);
    const afterNext = await page.evaluate(
      () =>
        (window as unknown as { __NUMBRANE_STUDIO__: { pieceId: string } }).__NUMBRANE_STUDIO__
          .pieceId,
    );
    expect(afterNext).not.toBe(before);

    await page.keyboard.press("[");
    await page.waitForTimeout(1200);
    const afterPrev = await page.evaluate(
      () =>
        (window as unknown as { __NUMBRANE_STUDIO__: { pieceId: string } }).__NUMBRANE_STUDIO__
          .pieceId,
    );
    expect(afterPrev).toBe(before);
  });
});
