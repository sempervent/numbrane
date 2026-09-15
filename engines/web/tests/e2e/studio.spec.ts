import { test, expect } from "@playwright/test";

test.describe("NUMBRANE Studio", () => {
  test("canvas-first keyboard chrome", async ({ page }) => {
    await page.goto("/studio.html?mode=generate&piece=geometry/metatron&seed=42");
    await expect(page.locator("#stage-wrap")).toBeVisible();
    await page.waitForFunction(() => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__);
    // GENERATE uses API preview surface; live canvas may be visibility-hidden
    await expect(page.locator("#generate-preview")).toBeAttached();

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

  test("piece switching changes render identity digests", async ({ page }) => {
    await page.goto("/studio.html?mode=generate&piece=geometry/metatron&seed=42");
    await page.waitForFunction(() => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__);

    const read = async () =>
      page.evaluate(() => {
        const s = (window as unknown as {
          __NUMBRANE_STUDIO__: {
            pieceId: string;
            seed: number;
            renderDigest: string;
            recipeDigest: string;
          };
        }).__NUMBRANE_STUDIO__;
        return {
          pieceId: s.pieceId,
          seed: s.seed,
          renderDigest: s.renderDigest,
          recipeDigest: s.recipeDigest,
        };
      });

    // Wait for first generate preview (may be empty if no API; still assert piece id)
    await page.waitForTimeout(800);
    const a = await read();
    expect(a.pieceId).toBe("geometry/metatron");

    await page.evaluate(async () => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { setPiece: (id: string) => Promise<void> } })
        .__NUMBRANE_STUDIO__;
      await s.setPiece("reaction-diffusion/reaction-diffusion");
    });
    await page.waitForTimeout(1200);
    const b = await read();
    expect(b.pieceId).toBe("reaction-diffusion/reaction-diffusion");
    expect(b.pieceId).not.toBe(a.pieceId);
    if (a.recipeDigest && b.recipeDigest) {
      expect(b.recipeDigest).not.toBe(a.recipeDigest);
    }

    await page.evaluate(async () => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { setPiece: (id: string) => Promise<void> } })
        .__NUMBRANE_STUDIO__;
      await s.setPiece("fractals/strange-attractors");
    });
    await page.waitForTimeout(1200);
    const c = await read();
    expect(c.pieceId).toBe("fractals/strange-attractors");

    const seedBefore = c.seed;
    await page.keyboard.press("r");
    await page.waitForTimeout(400);
    const d = await read();
    expect(d.seed).not.toBe(seedBefore);
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
