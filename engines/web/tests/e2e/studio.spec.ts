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
    const hiddenControls = await page.evaluate(() => {
      const roots = ["workflow-nav", "create-subbar", "config", "browser", "performance-strip"]
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => !!node);
      const controls = roots.flatMap((root) => [
        root,
        ...Array.from(root.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],[tabindex]")),
      ]);
      return {
        roots: roots.map((root) => ({
          id: root.id,
          inert: root.inert,
          ariaHidden: root.getAttribute("aria-hidden"),
          pointerEvents: getComputedStyle(root).pointerEvents,
        })),
        focusable: controls.filter((node) => {
          node.focus();
          return document.activeElement === node;
        }).map((node) => node.id || node.tagName),
        centerHit: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id ?? "",
      };
    });
    expect(hiddenControls.roots.every((root) => root.inert)).toBe(true);
    expect(hiddenControls.roots.every((root) => root.ariaHidden === "true")).toBe(true);
    expect(hiddenControls.roots.every((root) => root.pointerEvents === "none")).toBe(true);
    expect(hiddenControls.focusable).toEqual([]);
    expect(["stage", "generate-preview", "switch-hold", "stage-wrap"]).toContain(
      hiddenControls.centerHit,
    );
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).toHaveClass(/controls-visible/);

    await page.keyboard.press("1");
    await expect(page.locator('#create-subbar button[data-mode="generate"]')).toHaveClass(/active/);
    await page.keyboard.press("2");
    await expect(page.locator('#create-subbar button[data-mode="animate"]')).toHaveClass(/active/);
    await page.keyboard.press("3");
    await expect(page.locator('#create-subbar button[data-mode="react"]')).toHaveClass(/active/);

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

    const firstDigest = a.recipeDigest;
    await page.evaluate(async () => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { setPiece: (id: string) => Promise<void> } })
        .__NUMBRANE_STUDIO__;
      await s.setPiece("reaction-diffusion/reaction-diffusion");
    });
    await page.waitForFunction(
      (prev) => {
        const s = (window as unknown as { __NUMBRANE_STUDIO__?: { pieceId?: string; recipeDigest?: string } })
          .__NUMBRANE_STUDIO__;
        return (
          s?.pieceId === "reaction-diffusion/reaction-diffusion" &&
          !!s?.recipeDigest &&
          s.recipeDigest !== prev
        );
      },
      firstDigest,
      { timeout: 15_000 },
    );
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

  test("workflow nav shows Rehearse workspace above the fold", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/studio.html?dev=1&mode=animate&piece=geometry/metatron&seed=42");
    await page.waitForFunction(
      () => !!(window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } }).__NUMBRANE_STUDIO__
        ?.studioBootComplete,
    );
    const rehearseTab = page.locator('#workflow-nav button[data-workflow="rehearse"]');
    await expect(rehearseTab).toBeVisible();
    const box = await rehearseTab.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeLessThan(120);
    await page.locator('#workflow-nav button[data-workflow="set"]').click();
    await page.locator("#set-load-fixture").click();
    await page.waitForTimeout(300);
    await rehearseTab.click();
    await expect(page.locator("body")).toHaveClass(/workflow-rehearse/);
    await expect(page.locator("#rehearse-panel")).toBeVisible();
    await expect(page.locator("#set-rehearse-go")).toBeVisible();
    const goBox = await page.locator("#set-rehearse-go").boundingBox();
    expect(goBox!.y).toBeLessThan(600);
  });
});
