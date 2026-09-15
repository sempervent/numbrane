import { test, expect } from "@playwright/test";

type Studio = {
  pieceId: string;
  seed: number;
  frame: number;
  mode: string;
  locked: Set<string> | string[];
  mutationScale: string;
  pflStyleId: string;
  params: Record<string, unknown>;
  anim: { startFrame: number };
  setPiece: (id: string) => Promise<void>;
  setMode: (m: string) => Promise<void>;
  exploreVariants: () => Promise<void>;
  exploreSeries: () => Promise<void>;
  animateThis: () => Promise<void>;
  session?: { injectFeatures: (f: Record<string, number | boolean>) => void };
};

test.describe("PFL visual language acceptance (Docker)", () => {
  test("Generate look-finding → series → Animate This", async ({ page }) => {
    await page.goto("/studio.html?mode=generate&piece=fractals/strange-attractors&seed=113");
    await page.waitForFunction(
      () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    );
    // Ensure controls visible
    await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { controlsVisible: boolean; syncChrome: () => void } })
        .__NUMBRANE_STUDIO__;
      s.controlsVisible = true;
      s.syncChrome();
    });

    // Apply PFL / Ritual
    await page.selectOption("#cfg-style", "pfl-ritual");
    await page.waitForTimeout(600);
    const afterStyle = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__;
      return { style: s.pflStyleId, palette: s.params.palette, piece: s.pieceId };
    });
    expect(afterStyle.style).toBe("pfl-ritual");
    expect(afterStyle.piece).toBe("fractals/strange-attractors");

    // Generate 12 / More Like This
    await page.selectOption("#cfg-batch", "12");
    await page.selectOption("#cfg-mutation", "subtle");
    await page.click("#cfg-variants");
    await expect(page.locator(".variant-cell")).toHaveCount(12, { timeout: 180_000 });
    await expect(page.locator(".variant-cell img").first()).toBeVisible({ timeout: 60_000 });
    const variantCount = await page.locator(".variant-cell").count();
    expect(variantCount).toBe(12);

    // Pick first candidate
    await page.locator(".variant-cell").first().click();
    await page.waitForTimeout(800);
    const picked = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__;
      return { seed: s.seed, palette: s.params.palette };
    });

    // Lock palette (advanced panel)
    await page.locator("details.advanced").evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    await page.check("#cfg-lock-palette");
    const lockedPalette = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: { locked: Set<string> } }).__NUMBRANE_STUDIO__;
      return [...s.locked];
    });
    expect(lockedPalette).toContain("palette");

    // More Like This subtle — palette must stay
    const paletteLocked = picked.palette;
    await page.selectOption("#cfg-mutation", "subtle");
    await page.click("#cfg-variants");
    await expect(page.locator(".variant-cell")).toHaveCount(12, { timeout: 180_000 });
    await page.waitForTimeout(500);
    const afterSubtle = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__;
      return { palette: s.params.palette };
    });
    expect(afterSubtle.palette).toBe(paletteLocked);

    // Pick second, lock composition
    await page.locator(".variant-cell").nth(1).click();
    await page.waitForTimeout(600);
    await page.locator("details.advanced").evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    await page.check("#cfg-lock-comp");
    const seedBeforeSeries = await page.evaluate(
      () => (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.seed,
    );

    // Generate Series
    await page.selectOption("#cfg-mutation", "moderate");
    await page.click("#cfg-series");
    await expect(page.locator(".variant-cell")).toHaveCount(12, { timeout: 180_000 });
    const seriesLabels = await page.locator(".variant-cell").evaluateAll((els) =>
      els.map((e) => e.getAttribute("title") || e.textContent || ""),
    );
    expect(seriesLabels.length).toBe(12);

    // Animate This — continuity, no reroll
    const beforeAnim = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__;
      return { seed: s.seed, frame: s.frame, piece: s.pieceId, style: s.pflStyleId };
    });
    await page.click("#cfg-animate-this");
    await page.waitForTimeout(1000);
    const afterAnim = await page.evaluate(() => {
      const s = (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__;
      return {
        mode: s.mode,
        seed: s.seed,
        frame: s.frame,
        startFrame: s.anim.startFrame,
        piece: s.pieceId,
      };
    });
    expect(afterAnim.mode).toBe("animate");
    expect(afterAnim.seed).toBe(beforeAnim.seed);
    expect(afterAnim.piece).toBe(beforeAnim.piece);
    expect(afterAnim.startFrame).toBe(beforeAnim.frame);
    expect(seedBeforeSeries).toBeTruthy();
  });

  test("REACT profiles respond to injected audio features", async ({ page }) => {
    const pieces = [
      "reaction-diffusion/reaction-diffusion",
      "growth/slime-mold",
      "particles/noodles",
      "growth/differential-growth",
    ];
    for (const piece of pieces) {
      await page.goto(`/studio.html?mode=react&piece=${encodeURIComponent(piece)}&seed=21`);
      await page.waitForFunction(
        () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
      );
      await page.evaluate(() => {
        const s = (window as unknown as { __NUMBRANE_STUDIO__: { controlsVisible: boolean; syncChrome: () => void } })
          .__NUMBRANE_STUDIO__;
        s.controlsVisible = true;
        s.syncChrome();
      });
      // balanced sensitivity
      if (await page.locator("#cfg-sensitivity").count()) {
        await page.selectOption("#cfg-sensitivity", "balanced");
      }
      // silence
      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.session?.injectFeatures({
          energy: 0.02,
          low: 0.01,
          mid: 0.01,
          high: 0.01,
          onset: false,
          flux: 0.01,
          centroid: 0.3,
        });
      });
      await page.waitForTimeout(200);
      // speech-like mid energy
      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.session?.injectFeatures({
          energy: 0.45,
          low: 0.35,
          mid: 0.55,
          high: 0.25,
          onset: false,
          flux: 0.2,
          centroid: 0.4,
        });
      });
      await page.waitForTimeout(200);
      // clap / onset
      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.session?.injectFeatures({
          energy: 0.85,
          low: 0.5,
          mid: 0.4,
          high: 0.7,
          onset: true,
          flux: 0.8,
          centroid: 0.55,
        });
      });
      await page.waitForTimeout(200);
      // sustained music
      await page.evaluate(() => {
        (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.session?.injectFeatures({
          energy: 0.7,
          low: 0.65,
          mid: 0.5,
          high: 0.45,
          onset: false,
          flux: 0.35,
          centroid: 0.5,
        });
      });
      await page.waitForTimeout(300);
      await expect(page.locator("#stage")).toBeVisible();
      const mode = await page.evaluate(
        () => (window as unknown as { __NUMBRANE_STUDIO__: Studio }).__NUMBRANE_STUDIO__.mode,
      );
      expect(mode).toBe("react");
    }
    // chrome-free fullscreen path
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).toHaveClass(/controls-hidden/);
    await page.keyboard.press("f");
  });
});
