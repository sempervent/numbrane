import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  enterAnimateViaUi,
  openPieceBrowser,
  studioConsistency,
  waitForStudioSceneSettled,
} from "./studioUi";
import { studioDiag } from "./animationMetrics";

test("browser preview hover does not corrupt primary stage", async ({ page }) => {
  test.setTimeout(180_000);
  await enterAnimateViaUi(page, "audiovisual/nodes");
  await waitForStudioSceneSettled(page);
  const before = await studioDiag(page);
  await openPieceBrowser(page);
  const cards = page.locator("#browser .piece");
  const n = Math.min(await cards.count(), 8);
  for (let i = 0; i < n; i++) {
    await cards.nth(i).hover();
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { setBrowserVisible?: (v: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.setBrowserVisible?.(false);
  });
  await waitForStudioSceneSettled(page);
  const snap = await studioConsistency(page);
  expect(snap.desiredPieceId).toBe("audiovisual/nodes");
  expect(snap.consistency?.ok).toBe(true);
  const after = await studioDiag(page);
  expect((after.presentCount ?? 0) - (before.presentCount ?? 0)).toBeGreaterThan(5);
});
