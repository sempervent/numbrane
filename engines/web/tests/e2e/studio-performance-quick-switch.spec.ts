/**
 * Quick-switch audit — cycle every 2s for 60s, retaining every transition frame.
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openStudioHome, clickStudioMode } from "./studioUi";
import { frameIsVisible, sampleStagePixels } from "./animationMetrics";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

test("quick-switch catalog every 2s for 60 seconds", async ({ page }) => {
  test.setTimeout(180_000);
  await openStudioHome(page);
  await clickStudioMode(page, "animate");

  const outputDir = path.resolve(process.cwd(), "../../artifacts/visual-audit/quick-switch");
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const switchMs = 2000;
  const startedAt = Date.now();
  const endAt = startedAt + 60_000;
  let idx = 0;
  let blackFrameCount = 0;
  const transitions: Array<{ index: number; piece: string; black: boolean; metrics: unknown }> = [];

  while (Date.now() < endAt) {
    const piece = catalogPieces[idx % catalogPieces.length]!;
    const transitionIndex = idx++;
    await page.evaluate((id) => {
      const app = (window as unknown as { __NUMBRANE_STUDIO__?: { setPiece?: (p: string) => Promise<void> } })
        .__NUMBRANE_STUDIO__;
      void app?.setPiece?.(id);
    }, piece);
    await page.waitForTimeout(50);
    const transitionFrame = await sampleStagePixels(page);
    const black = !frameIsVisible(transitionFrame);
    if (black) blackFrameCount += 1;
    await page.locator("#stage-wrap").screenshot({
      path: path.join(outputDir, `transition-${String(transitionIndex).padStart(3, "0")}.png`),
      type: "png",
    });
    transitions.push({ index: transitionIndex, piece, black, metrics: transitionFrame });
    const untilNextSwitch = startedAt + idx * switchMs - Date.now();
    if (untilNextSwitch > 0) await page.waitForTimeout(untilNextSwitch);

    const px = await sampleStagePixels(page);
    if (!frameIsVisible(px)) blackFrameCount += 1;
  }

  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify({
    durationSec: 60,
    intervalSec: 2,
    transitionCount: transitions.length,
    blackFrameCount,
    transitions,
  }, null, 2));
  expect(blackFrameCount, "substantially black visible frames").toBe(0);
});
