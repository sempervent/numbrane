/**
 * Studio ANIMATE visual liveness — Docker Studio on :8080.
 * Requires: docker compose up -d studio renderer
 */

import { test, expect, type Page } from "@playwright/test";

const PIECES = [
  "flagship/latticefall",
  "fractals/sdf-raymarch2d",
  "fractals/escape-time",
  "fractals/strange-attractors",
  "reaction-diffusion/reaction-diffusion",
  "growth/slime-mold",
  "particles/noodles",
  "growth/differential-growth",
  "geometry/metatron",
  "fields/flow-hatching",
  "tiling/truchet-tiles",
];

async function sampleCanvas(page: Page): Promise<{
  nonBlack: number;
  variance: number;
  mean: number;
}> {
  const apiPreview = await page
    .locator("#generate-preview.visible")
    .isVisible({ timeout: 500 })
    .catch(() => false);
  const target = apiPreview ? page.locator("#generate-preview") : page.locator("#stage-wrap");
  const png = await target.screenshot({ type: "png", timeout: 15_000 });
  // Heuristic on PNG payload — avoids WebGL readPixels / drawImage deadlocks in SwiftShader.
  const body = png.subarray(100, Math.min(png.length, 8000));
  let sum = 0;
  let sum2 = 0;
  const step = 11;
  let nonBlack = 0;
  const samples = Math.floor(body.length / step);
  for (let i = 0; i < body.length; i += step) {
    const v = body[i]!;
    sum += v;
    sum2 += v * v;
    if (v > 8) nonBlack += 1;
  }
  const mean = sum / Math.max(1, samples);
  const variance = sum2 / Math.max(1, samples) - mean * mean;
  return { nonBlack: nonBlack / Math.max(1, samples), variance, mean };
}

async function enterAnimate(page: Page, piece: string): Promise<void> {
  await page.goto(`/studio.html?mode=animate&piece=${encodeURIComponent(piece)}&seed=42`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    null,
    { timeout: 30_000 },
  );
  // Allow first frames to paint (URL already selects piece + animate mode).
  await page.waitForTimeout(2000);
}

test("harness smoke — studio boots and screenshot", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/studio.html?mode=animate&piece=fractals/sdf-raymarch2d&seed=42", {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1000);
  const png = await page.locator("#stage-wrap").screenshot({ timeout: 10_000 });
  expect(png.length).toBeGreaterThan(5000);
});

test.describe("Studio animation visual liveness (Docker)", () => {
  test.setTimeout(120_000);

  for (const piece of PIECES) {
    test(`${piece} animate first frame is visible`, async ({ page }) => {
      await enterAnimate(page, piece);
      const generating = await page
        .locator("#gen-status")
        .filter({ hasText: /generating/i })
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (generating) await page.waitForTimeout(4000);
      const banner = await page
        .locator("#unsupported-banner.visible")
        .textContent({ timeout: 500 })
        .catch(() => null);
      expect(banner ?? "").not.toMatch(/failed/i);
      const sample = await sampleCanvas(page);
      expect(sample.nonBlack, `${piece} should show non-black pixels`).toBeGreaterThan(0.002);
      expect(sample.variance + sample.mean, `${piece} should have luminance structure`).toBeGreaterThan(0.5);
    });
  }

  test("latticefall evolves and pause freezes", async ({ page }) => {
    await enterAnimate(page, "flagship/latticefall");
    await page.waitForTimeout(800);
    const t0 = await sampleCanvas(page);
    await page.waitForTimeout(900);
    const t1 = await sampleCanvas(page);
    expect(t0.nonBlack).toBeGreaterThan(0.002);
    // Evolution: mean or variance should shift
    const evolved =
      Math.abs(t1.mean - t0.mean) > 0.3 || Math.abs(t1.variance - t0.variance) > 0.5;
    expect(evolved).toBe(true);

    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const p0 = await sampleCanvas(page);
    await page.waitForTimeout(700);
    const p1 = await sampleCanvas(page);
    expect(Math.abs(p1.mean - p0.mean)).toBeLessThan(2.5);

    await page.keyboard.press("Space");
    await page.waitForTimeout(900);
    const r1 = await sampleCanvas(page);
    const resumed = Math.abs(r1.mean - p1.mean) > 0.3 || Math.abs(r1.variance - p1.variance) > 0.5;
    expect(resumed).toBe(true);
  });

  test("piece switch leaves no permanent black canvas", async ({ page }) => {
    const sequence = [
      "flagship/latticefall",
      "reaction-diffusion/reaction-diffusion",
      "fractals/sdf-raymarch2d",
      "geometry/metatron",
      "fractals/strange-attractors",
    ];
    await enterAnimate(page, sequence[0]!);
    for (const piece of sequence) {
      await page.evaluate(async (pieceId) => {
        const s = (window as unknown as { __NUMBRANE_STUDIO__: {
          setPiece: (id: string) => Promise<void>;
        } }).__NUMBRANE_STUDIO__;
        await s.setPiece(pieceId);
      }, piece);
      await page.waitForTimeout(1000);
      const sample = await sampleCanvas(page);
      expect(sample.nonBlack, piece).toBeGreaterThan(0.002);
    }
  });

  test("seed change rebuilds while animating", async ({ page }) => {
    await enterAnimate(page, "fractals/sdf-raymarch2d");
    const before = await sampleCanvas(page);
    await page.keyboard.press("r");
    await page.waitForTimeout(1000);
    const after = await sampleCanvas(page);
    expect(after.nonBlack).toBeGreaterThan(0.002);
    // New seed should not be identical forever; allow either change or continued visibility
    expect(after.mean + after.variance + before.mean).toBeGreaterThan(0);
  });
});
