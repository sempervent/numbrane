/**
 * Studio ANIMATE smoke — decoded #stage RGBA pixels (Docker :8080).
 */

import { test, expect, type Page } from "@playwright/test";
import {
  enterAnimate,
  frameIsVisible,
  sampleStagePixels,
  studioDiag,
  waitForLiveFrame,
} from "./animationMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";

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

test("harness smoke — studio boots", async ({ page }) => {
  test.setTimeout(30_000);
  await enterAnimate(page, "fractals/sdf-raymarch2d");
  await waitForLiveFrame(page);
  const px = await sampleStagePixels(page);
  expect(frameIsVisible(px)).toBe(true);
});

test.describe("Studio animation visual liveness (Docker)", () => {
  test.setTimeout(180_000);

  for (const piece of PIECES) {
    test(`${piece} animate first frame is visible`, async ({ page }) => {
      await enterAnimate(page, piece);
      await waitForLiveFrame(page);
      const px = await sampleStagePixels(page);
      expect(frameIsVisible(px), `${piece} visible`).toBe(true);
    });
  }

  test("latticefall evolves and pause freezes", async ({ page }) => {
    await enterAnimate(page, "flagship/latticefall");
    await waitForLiveFrame(page);
    const t0 = await sampleStagePixels(page);
    await page.waitForTimeout(900);
    const t1 = await sampleStagePixels(page);
    expect(isMeaningfulVisualChange(t0, t1) || t1.changedPixelFraction >= 0.003).toBe(true);

    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const f0 = await studioDiag(page);
    await page.waitForTimeout(700);
    const f1 = await studioDiag(page);
    expect(f1.logicalFrame).toBe(f0.logicalFrame);
    const p1 = await sampleStagePixels(page);
    expect(p1.changedPixelFraction).toBeLessThan(0.012);

    await page.keyboard.press("Space");
    await page.waitForTimeout(900);
    const r1 = await sampleStagePixels(page);
    expect(
      isMeaningfulVisualChange(p1, r1) || r1.changedPixelFraction >= 0.003,
    ).toBe(true);
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
        const s = (window as unknown as { __NUMBRANE_STUDIO__: { setPiece: (id: string) => Promise<void> } })
          .__NUMBRANE_STUDIO__;
        await s.setPiece(pieceId);
      }, piece);
      await page.waitForTimeout(2000);
      const px = await sampleStagePixels(page);
      expect(frameIsVisible(px), piece).toBe(true);
    }
  });

  test("seed change rebuilds while animating", async ({ page }) => {
    await enterAnimate(page, "fractals/sdf-raymarch2d");
    await waitForLiveFrame(page);
    const before = await sampleStagePixels(page);
    await page.keyboard.press("r");
    await page.waitForTimeout(1200);
    const after = await sampleStagePixels(page);
    expect(frameIsVisible(after)).toBe(true);
    expect(after.digest !== before.digest || isMeaningfulVisualChange(before, after)).toBe(true);
  });
});
