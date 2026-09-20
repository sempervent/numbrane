/**
 * Human screenshot regressions — seed 2212454373, perceptual structure not flat fields.
 */

import { test, expect } from "@playwright/test";
import {
  assertPerceptuallyAlive,
  enterAnimate,
  sampleStagePixels,
  studioDiag,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";
import { classifyVisualQuality, snapshotFromFrame } from "../../src/live/visualQuality";

async function showControls(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: { controlsVisible?: boolean; syncChrome?: () => void; renderConfig?: () => void };
    }).__NUMBRANE_STUDIO__;
    if (app) {
      app.controlsVisible = true;
      app.syncChrome?.();
      app.renderConfig?.();
    }
  });
}

async function assertNotDegenerate(
  page: import("@playwright/test").Page,
  profile: { density: "dense" | "medium"; motion: "intense" | "moderate" },
  label: string,
): Promise<void> {
  const px = await sampleStagePixels(page);
  const q = classifyVisualQuality(snapshotFromFrame(px), profile, 0, true, 30);
  expect(
    q.status === "degenerate-dark" || q.status === "degenerate-flat",
    `${label}: ${q.reason || q.status}`,
  ).toBe(false);
  expect(px.luminanceVariance, `${label} variance`).toBeGreaterThan(profile.density === "dense" ? 25 : 12);
}

test.describe("Human visual regressions", () => {
  test("fractals/sdf-raymarch2d seed 2212454373 parameter drift red ember", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 2212454373);
    await waitForLiveFrame(page);
    await showControls(page);
    await page.selectOption("#cfg-anim-method", "parameter-drift");
    await page.waitForTimeout(300);
    await page.selectOption("#cfg-ramp-preset", "red-ember");
    await page.selectOption("#cfg-ramp-mapping", "intensity");
    await page.waitForTimeout(800);
    await waitForLiveFrame(page);
    const samples = [];
    for (const t of [5, 10, 30, 45, 60]) {
      await waitForAnimationTime(page, t, 90_000);
      samples.push(await sampleStagePixels(page));
      await assertNotDegenerate(
        page,
        { density: "dense", motion: "intense" },
        `sdf @ ${t}s`,
      );
    }
    assertPerceptuallyAlive(
      samples[3]!,
      samples[4]!,
      { density: "dense", motion: "intense" },
      "sdf 45→60s",
    );
    const d = await studioDiag(page);
    expect(d.transportPlaying).toBe(true);
  });

  test("fractals/escape-time seed 2212454373 parameter drift", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/escape-time", 2212454373);
    await waitForLiveFrame(page);
    await showControls(page);
    await page.selectOption("#cfg-anim-method", "parameter-drift");
    await page.waitForTimeout(800);
    for (const t of [5, 10, 30, 45, 60]) {
      await waitForAnimationTime(page, t, 90_000);
      await assertNotDegenerate(
        page,
        { density: "dense", motion: "intense" },
        `escape @ ${t}s`,
      );
    }
    const a = await sampleStagePixels(page);
    await page.waitForTimeout(3000);
    const b = await sampleStagePixels(page);
    assertPerceptuallyAlive(a, b, { density: "dense", motion: "intense" }, "escape 60→63s");
  });
});
