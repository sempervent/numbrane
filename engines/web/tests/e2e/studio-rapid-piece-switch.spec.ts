import { test, expect } from "@playwright/test";
import { clickStudioMode, openStudioHome, studioConsistency, waitForStudioSceneSettled } from "./studioUi";

const RAPID_PIECES = [
  "geometry/metatron",
  "fields/nebula",
  "audiovisual/nodes",
  "fractals/sdf-raymarch2d",
  "fractals/escape-time",
  "reaction-diffusion/gray-scott",
  "fractals/strange-attractors",
  "geometry/metatron",
  "fields/nebula",
  "audiovisual/nodes",
];

test("rapid piece select — final piece wins", async ({ page }) => {
  test.setTimeout(120_000);
  await openStudioHome(page);
  await page.evaluate(() => {
    (
      window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
    ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
  });
  await clickStudioMode(page, "animate");
  const finalPiece = RAPID_PIECES[RAPID_PIECES.length - 1]!;

  for (const pieceId of RAPID_PIECES) {
    await page.selectOption("#cfg-piece", pieceId);
    await page.waitForTimeout(80);
  }

  await waitForStudioSceneSettled(page, 60_000);
  const snap = await studioConsistency(page);
  expect(snap.desiredPieceId).toBe(finalPiece);
  expect(snap.consistency?.ok).toBe(true);
  expect(snap.pieceSelector).toBe(finalPiece);
  const layers = snap.runtimeLayers as Array<{ piece: string }>;
  expect(layers[0]?.piece).toBe(finalPiece);
});
