import { test, expect } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInBrowser,
  studioConsistency,
  waitForStudioSceneSettled,
} from "./studioUi";

test("overlapping piece/method/seed changes commit once", async ({ page }) => {
  test.setTimeout(120_000);
  await openStudioHome(page);
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
  });
  await clickStudioMode(page, "animate");
  await selectPieceInBrowser(page, "geometry/metatron");

  void page.selectOption("#cfg-anim-method", { label: "Construction" });
  void page.click("#cfg-rand");
  void selectPieceInBrowser(page, "audiovisual/nodes");
  void page.click("#cfg-rand");
  void selectPieceInBrowser(page, "fields/nebula");
  void selectPieceInBrowser(page, "audiovisual/nodes");

  await waitForStudioSceneSettled(page, 90_000);
  const snap = await studioConsistency(page);
  expect(snap.desiredPieceId).toBe("audiovisual/nodes");
  expect(snap.consistency?.ok).toBe(true);
  expect(snap.animationMethodValid).toBe(true);
});
