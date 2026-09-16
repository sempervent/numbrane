/**
 * Animation lifecycle semantics — hold, loop, ping-pong, camera pan, construction.
 */

import { test, expect } from "@playwright/test";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";
import {
  enterAnimate,
  sampleStagePixels,
  studioDiag,
  comparePixelBaseline,
  pinPixelBaseline,
  waitForAnimationPhase,
  waitForAnimationPhaseNear,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";

type AnimConfig = {
  source: string;
  motion: string;
  durationSec: number;
  endBehavior: string;
  panPreset?: string;
};

async function setAnimation(page: import("@playwright/test").Page, cfg: AnimConfig): Promise<void> {
  await page.evaluate((cfg) => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: {
        animationSpec: Record<string, unknown>;
        anim: { durationSec: number; loop: boolean };
        syncAnimationSpecToSession?: (preview?: boolean) => void;
      };
    }).__NUMBRANE_STUDIO__;
    if (!app) throw new Error("studio missing");
    app.animationSpec = {
      ...app.animationSpec,
      source: cfg.source,
      motion: cfg.motion,
      durationSec: cfg.durationSec,
      endBehavior: cfg.endBehavior,
      components: [cfg.source],
      camera: {
        ...(app.animationSpec.camera as object),
        panPreset: cfg.panPreset ?? "left-right",
        motion: cfg.motion === "zoom" ? "zoom" : cfg.motion === "pan-zoom" ? "pan-zoom" : "pan",
        zoomMode: cfg.motion === "zoom" || cfg.motion === "pan-zoom" ? "in" : "none",
      },
    };
    app.anim.durationSec = cfg.durationSec;
    app.syncAnimationSpecToSession?.(true);
  }, cfg);
}

test.describe("Studio animation semantics (Docker)", () => {
  test("camera pan + hold — motion then stability", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/strange-attractors", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "camera",
      motion: "pan",
      durationSec: 2,
      endBehavior: "hold",
      panPreset: "left-right",
    });
    await waitForAnimationPhase(page, 0.45);
    const t0 = await sampleStagePixels(page);
    await waitForAnimationPhase(page, 0.85);
    const t1 = await sampleStagePixels(page);
    await waitForAnimationPhase(page, 1);
    await page.waitForTimeout(400);
    await pinPixelBaseline(page);
    await page.waitForTimeout(1000);
    expect(await comparePixelBaseline(page)).toBeLessThan(0.035);
    await page.waitForTimeout(800);
    expect(await comparePixelBaseline(page)).toBeLessThan(0.035);
    expect(isMeaningfulVisualChange(t0, t1) || t1.digest !== t0.digest).toBe(true);
  });

  test("camera pan + loop — recurring motion", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/strange-attractors", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "camera",
      motion: "pan",
      durationSec: 2,
      endBehavior: "loop",
    });
    await waitForAnimationPhaseNear(page, 0.1);
    const a = await sampleStagePixels(page);
    const baseTime = (await studioDiag(page)).animationTimeSec ?? 0;
    await pinPixelBaseline(page);
    await waitForAnimationPhaseNear(page, 0.55, 0.03, 90_000, baseTime + 0.4);
    const b = await sampleStagePixels(page);
    expect(isMeaningfulVisualChange(a, b) || b.digest !== a.digest).toBe(true);
    await waitForAnimationPhaseNear(page, 0.1, 0.03, 90_000, baseTime + 1.9);
    await page.waitForTimeout(200);
    expect(await comparePixelBaseline(page)).toBeLessThan(0.075);
  });

  test("camera pan + ping-pong — smooth return", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/strange-attractors", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "camera",
      motion: "pan",
      durationSec: 2,
      endBehavior: "ping-pong",
    });
    await waitForAnimationPhaseNear(page, 0.1);
    const start = await sampleStagePixels(page);
    const baseTime = (await studioDiag(page)).animationTimeSec ?? 0;
    await pinPixelBaseline(page);
    await waitForAnimationPhaseNear(page, 0.95, 0.03, 90_000, baseTime + 0.4);
    const end = await sampleStagePixels(page);
    expect(isMeaningfulVisualChange(start, end) || end.digest !== start.digest).toBe(true);
    await waitForAnimationPhaseNear(page, 0.1, 0.03, 90_000, baseTime + 1.9);
    await page.waitForTimeout(200);
    expect(await comparePixelBaseline(page)).toBeLessThan(0.12);
  });

  test("zoom + hold — motion then stability", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "fractals/strange-attractors", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "camera",
      motion: "zoom",
      durationSec: 2,
      endBehavior: "hold",
    });
    await waitForAnimationPhase(page, 0.5);
    const mid = await sampleStagePixels(page);
    await waitForAnimationPhase(page, 1);
    await page.waitForTimeout(400);
    const end = await sampleStagePixels(page);
    await page.waitForTimeout(800);
    const hold = await sampleStagePixels(page);
    expect(isMeaningfulVisualChange(mid, end) || end.digest !== mid.digest).toBe(true);
    expect(hold.changedPixelFraction).toBeLessThan(0.025);
  });

  test("construction + hold — Metatron completes then stable", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "geometry/metatron", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "construction",
      motion: "construction",
      durationSec: 6,
      endBehavior: "hold",
    });
    await waitForAnimationPhase(page, 1);
    await page.waitForTimeout(500);
    const a = await sampleStagePixels(page);
    await page.waitForTimeout(1200);
    const b = await sampleStagePixels(page);
    expect(b.changedPixelFraction).toBeLessThan(0.015);
  });

  test("construction + loop — intentional restart", async ({ page }) => {
    test.setTimeout(180_000);
    await enterAnimate(page, "geometry/metatron", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "construction",
      motion: "construction",
      durationSec: 4,
      endBehavior: "loop",
    });
    await waitForAnimationPhase(page, 0.95);
    const nearEnd = await sampleStagePixels(page);
    await waitForAnimationPhase(page, 0.15);
    const afterWrap = await sampleStagePixels(page);
    expect(afterWrap.changedPixelFraction).toBeGreaterThan(0.008);
    expect(nearEnd.digest).not.toBe(afterWrap.digest);
  });

  test("generative continuous — RD logical frame monotonic past duration", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimate(page, "reaction-diffusion/reaction-diffusion", 42);
    await waitForLiveFrame(page);
    await setAnimation(page, {
      source: "generative",
      motion: "continuous",
      durationSec: 2,
      endBehavior: "continuous",
    });
    await page.waitForTimeout(2500);
    const f0 = (await studioDiag(page)).logicalFrame ?? 0;
    await page.waitForTimeout(1500);
    const f1 = (await studioDiag(page)).logicalFrame ?? 0;
    expect(f1).toBeGreaterThan(f0);
    expect(f1).toBeGreaterThan(35);
  });
});
