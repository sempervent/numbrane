/**
 * Mandatory live liveness regressions — attractor mashup, construction, simulation, compositions.
 */

import { test, expect } from "@playwright/test";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";
import {
  assertPerceptuallyAlive,
  enterAnimate,
  sampleStagePixels,
  studioDiag,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";
import { classifyVisualQuality, snapshotFromFrame } from "../../src/live/visualQuality";

async function sampleAtTimes(
  page: import("@playwright/test").Page,
  seconds: number[],
): Promise<{ samples: PixelFrame[]; diags: Awaited<ReturnType<typeof studioDiag>>[] }> {
  const samples: PixelFrame[] = [];
  const diags: Awaited<ReturnType<typeof studioDiag>>[] = [];
  let lastT = 0;
  for (const target of seconds) {
    const waitMs = Math.max(0, (target - lastT) * 1000);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    lastT = target;
    diags.push(await studioDiag(page));
    samples.push(await sampleStagePixels(page));
  }
  return { samples, diags };
}

function assertMotionBetween(samples: PixelFrame[], a: number, b: number, label: string): void {
  expect(
    isMeaningfulVisualChange(samples[a]!, samples[b]!) ||
      samples[b]!.digest !== samples[a]!.digest,
    `${label}: no change between t=${a} and t=${b}`,
  ).toBe(true);
}

test.describe("Studio live liveness sentinels", () => {
  test("mashups/attractor-calligraphy stays alive through 60s", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "mashups/attractor-calligraphy", 42);
    await waitForLiveFrame(page);
    const times = [5, 8, 16, 30, 45, 50, 55, 60];
    const { samples, diags } = await sampleAtTimes(page, times);
    const d0 = diags[0]!;
    const dLast = diags[diags.length - 1]!;
    expect(dLast.animationTimeSec ?? 0).toBeGreaterThan(55);
    expect(dLast.transportPlaying).toBe(true);
    expect((dLast.presentCount ?? 0) - (d0.presentCount ?? 0)).toBeGreaterThan(100);
    assertMotionBetween(samples, 0, 1, "5→8s");
    assertMotionBetween(samples, 4, 5, "45→50s");
    assertMotionBetween(samples, 5, 6, "50→55s");
    assertMotionBetween(samples, 6, 7, "55→60s");
    assertPerceptuallyAlive(
      samples[5]!,
      samples[7]!,
      { density: "dense", motion: "intense" },
      "attractor 50→60s",
    );
    const q = classifyVisualQuality(
      snapshotFromFrame(samples[7]!),
      { density: "dense", motion: "intense" },
      0,
      true,
      60,
    );
    expect(q.status === "degenerate-dark" || q.status === "degenerate-flat").toBe(false);
    expect((dLast.animationPhase ?? 0)).toBeLessThan(0.999);
  });

  test("geometry/metatron breathes after construction", async ({ page }) => {
    test.setTimeout(90_000);
    await enterAnimate(page, "geometry/metatron", 42);
    await waitForLiveFrame(page);
    await waitForAnimationTime(page, 12);
    const a = await sampleStagePixels(page);
    await page.waitForTimeout(2000);
    const b = await sampleStagePixels(page);
    expect(isMeaningfulVisualChange(a, b) || b.digest !== a.digest).toBe(true);
  });

  test("geometry-sdf both layers alive past 16s", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "fractals/sdf-raymarch2d", 42);
    await waitForLiveFrame(page);
    await page.evaluate((id) => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { setPerformanceComposition?: (id: string | null) => Promise<void> };
      }).__NUMBRANE_STUDIO__;
      return app?.setPerformanceComposition?.(id || null);
    }, "geometry-sdf");
    await waitForLiveFrame(page, 90_000);
    const { samples } = await sampleAtTimes(page, [8, 16, 30]);
    assertMotionBetween(samples, 1, 2, "geometry-sdf 16→30s");
  });

  test("rd-geometry layered simulation and construction", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "reaction-diffusion/reaction-diffusion", 42);
    await waitForLiveFrame(page);
    await page.evaluate((id) => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { setPerformanceComposition?: (id: string | null) => Promise<void> };
      }).__NUMBRANE_STUDIO__;
      return app?.setPerformanceComposition?.(id || null);
    }, "rd-geometry");
    await waitForLiveFrame(page, 90_000);
    const { samples } = await sampleAtTimes(page, [8, 16, 30, 45]);
    assertMotionBetween(samples, 2, 3, "rd-geometry 30→45s");
  });

  test("reaction-diffusion continues past 60s window", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "reaction-diffusion/reaction-diffusion", 42);
    await waitForLiveFrame(page);
    const { samples } = await sampleAtTimes(page, [8, 16, 30, 60]);
    assertMotionBetween(samples, 2, 3, "30→60s");
  });
});
