/**
 * Quick-switch stress — cycle catalog every 3s for 2 minutes without black stage.
 */

import { test, expect } from "@playwright/test";
import { openStudioHome, clickStudioMode } from "./studioUi";
import { frameIsVisible, sampleStagePixels } from "./animationMetrics";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

test("quick-switch catalog 3s for 2 minutes", async ({ page }) => {
  test.setTimeout(240_000);
  await openStudioHome(page);
  await clickStudioMode(page, "animate");

  const switchMs = 3000;
  const endAt = Date.now() + 120_000;
  let idx = 0;
  let blackStreakMs = 0;
  let lastVisibleMs = Date.now();

  while (Date.now() < endAt) {
    const piece = catalogPieces[idx % catalogPieces.length]!;
    idx += 1;
    await page.evaluate((id) => {
      const app = (window as unknown as { __NUMBRANE_STUDIO__?: { setPiece?: (p: string) => Promise<void> } })
        .__NUMBRANE_STUDIO__;
      return app?.setPiece?.(id);
    }, piece);
    await page.waitForTimeout(switchMs);

    const px = await sampleStagePixels(page);
    if (frameIsVisible(px)) {
      lastVisibleMs = Date.now();
      blackStreakMs = 0;
    } else {
      blackStreakMs += switchMs;
      expect(blackStreakMs, `black streak after ${piece}`).toBeLessThanOrEqual(750);
    }
  }

  expect(Date.now() - lastVisibleMs, "stage visible within last switch window").toBeLessThanOrEqual(
    switchMs * 2,
  );
});
