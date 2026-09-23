/**
 * Studio runtime must match UI desired state after interactive configuration.
 */

import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInBrowser,
  studioConsistency,
  waitForStudioSceneSettled,
  failureBannerText,
} from "./studioUi";
import { sampleStagePixels, frameIsVisible, studioDiag } from "./animationMetrics";
import { BUILD_SHA } from "../../src/studio/buildInfo";

test("build sha in browser matches bundle", async ({ page }) => {
  await openStudioHome(page);
  const diag = await page.evaluate(() => {
    const app = (
      window as unknown as { __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => Record<string, unknown> } }
    ).__NUMBRANE_STUDIO__;
    return app?.getAnimationDiagnostics?.() ?? {};
  });
  expect(diag.buildSha).toBe(BUILD_SHA);
});

test("human rehearsal sequence stays consistent", async ({ page }) => {
  test.setTimeout(240_000);
  await openStudioHome(page);
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
  });
  await clickStudioMode(page, "animate");

  const steps: Array<() => Promise<void>> = [
    () => selectPieceInBrowser(page, "geometry/metatron"),
    async () => {
      await page.selectOption("#cfg-anim-method", { label: "Construction" });
      await page.waitForTimeout(200);
    },
    () => page.click("#cfg-rand"),
    () => selectPieceInBrowser(page, "audiovisual/nodes"),
    () => page.click("#cfg-rand"),
    () => selectPieceInBrowser(page, "fields/nebula"),
    () => selectPieceInBrowser(page, "audiovisual/nodes"),
    async () => {
      await page.click("#cfg-browser");
      await page.waitForSelector("#browser.visible");
      const cards = page.locator("#browser .piece");
      const n = Math.min(await cards.count(), 4);
      for (let i = 0; i < n; i++) {
        await cards.nth(i).hover();
        await page.waitForTimeout(120);
      }
      await page.click("#cfg-browser");
    },
    () => selectPieceInBrowser(page, "fractals/sdf-raymarch2d"),
    async () => {
      await page.selectOption("#cfg-anim-method", { label: "Parameter Drift" });
      await page.waitForTimeout(150);
    },
    () => selectPieceInBrowser(page, "fractals/escape-time"),
    () => selectPieceInBrowser(page, "audiovisual/nodes"),
  ];

  for (const step of steps) {
    await step();
    await waitForStudioSceneSettled(page);
    const snap = await studioConsistency(page);
    expect(snap.consistency, JSON.stringify(snap)).toEqual(expect.objectContaining({ ok: true }));
    expect(await failureBannerText(page)).toBeNull();
  }

  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(false);
  });
  const raf0 = (await studioDiag(page)).rafCount ?? 0;
  const present0 = (await studioDiag(page)).presentCount ?? 0;
  await page.waitForTimeout(5000);
  const d1 = await studioDiag(page);
  expect((d1.rafCount ?? 0) - raf0).toBeGreaterThan(10);
  expect((d1.presentCount ?? 0) - present0).toBeGreaterThan(10);
  expect(d1.rafStalled).not.toBe(true);
  const px = await sampleStagePixels(page);
  expect(frameIsVisible(px)).toBe(true);
});
