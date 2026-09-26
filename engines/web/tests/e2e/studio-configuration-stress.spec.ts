import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInBrowser,
  studioConsistency,
  waitForStudioSceneSettled,
  failureBannerText,
} from "./studioUi";
import { frameIsVisible, sampleStagePixels, studioDiag } from "./animationMetrics";

test("configuration mutation stress while animate", async ({ page }) => {
  test.setTimeout(300_000);
  await openStudioHome(page);
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
  });
  await clickStudioMode(page, "animate");

  const actions: Array<() => Promise<void>> = [
    () => selectPieceInBrowser(page, "fractals/sdf-raymarch2d"),
    () => page.click("#cfg-rand"),
    () => page.selectOption("#cfg-anim-method", { label: "Parameter Drift" }),
    () => selectPieceInBrowser(page, "fractals/escape-time"),
    () => page.click("#cfg-rand"),
    () => selectPieceInBrowser(page, "geometry/metatron"),
    () => page.selectOption("#cfg-anim-method", { label: "Construction" }),
    () => selectPieceInBrowser(page, "audiovisual/nodes"),
    () => page.click("#cfg-rand"),
    () => selectPieceInBrowser(page, "reaction-diffusion/reaction-diffusion"),
    () => selectPieceInBrowser(page, "audiovisual/nodes"),
  ];

  for (const act of actions) {
    await act();
    await page.waitForTimeout(100);
    await waitForStudioSceneSettled(page, 45_000);
    const snap = await studioConsistency(page);
    expect(snap.consistency?.ok, JSON.stringify(snap)).toBe(true);
    expect(await failureBannerText(page)).toBeNull();
    const d = await studioDiag(page);
    expect(d.rafStalled).not.toBe(true);
  }

  await page.waitForTimeout(5000);
  expect(frameIsVisible(await sampleStagePixels(page))).toBe(true);
});
