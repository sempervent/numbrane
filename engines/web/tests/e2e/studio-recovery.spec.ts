/**
 * Human-visible Studio recovery gates — must fail when golden path false-positives.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInConfig,
  waitForStudioBoot,
  waitForStudioSceneSettled,
} from "./studioUi";
import { frameHasMeaningfulStructure, waitForLiveFrame } from "./animationMetrics";
import {
  assertStageMeaningfullyPresent,
  assertStageStableForMs,
  readStagePresentSnapshot,
} from "./studioVisiblePresent";

const OUT = path.join(process.cwd(), "tmp", "studio-recovery-manual");

const RENDERER_MATRIX: Array<{
  label: string;
  piece: string;
  liveGenerate: boolean;
}> = [
  { label: "geometry-ir", piece: "reference/circle-lattice", liveGenerate: false },
  { label: "shader-native", piece: "tiling/truchet-tiles", liveGenerate: true },
  { label: "webgl-stateful", piece: "growth/differential-growth", liveGenerate: true },
  { label: "wasm", piece: "flagship/latticefall", liveGenerate: true },
  { label: "mashup", piece: "mashups/attractor-calligraphy", liveGenerate: true },
];

test.describe.configure({ mode: "serial" });

test.describe("Studio recovery (human-visible)", () => {
  test.beforeAll(() => {
    test.setTimeout(900_000);
  });

  test("1 — Generate frozen presentation (Truchet, UI path)", async ({ page }) => {
    await openStudioHome(page);
    await selectPieceInConfig(page, "tiling/truchet-tiles");
    await clickStudioMode(page, "generate");
    await waitForStudioSceneSettled(page, 120_000);
    await page.waitForFunction(
      () =>
        !(window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } }).__NUMBRANE_STUDIO__
          ?.generating,
      null,
      { timeout: 120_000 },
    );
    const snap = await assertStageMeaningfullyPresent(page, {
      pieceId: "tiling/truchet-tiles",
      mode: "generate",
    });
    expect(snap.generateFrozen, "GENERATE_FROZEN loop").toBe(true);
    await assertStageStableForMs(page, "tiling/truchet-tiles", 5_000);
    await page.screenshot({ path: path.join(OUT, "01-truchet-generate.png"), fullPage: true });
  });

  test("2 — Animate live presentation (Truchet)", async ({ page }) => {
    await openStudioHome(page);
    await selectPieceInConfig(page, "tiling/truchet-tiles");
    await clickStudioMode(page, "animate");
    await waitForStudioSceneSettled(page, 120_000);
    await waitForLiveFrame(page, 60_000);
    await assertStageMeaningfullyPresent(page, {
      pieceId: "tiling/truchet-tiles",
      mode: "animate",
    });
    const snap = await readStagePresentSnapshot(page);
    expect(snap.generateFrozen, "not frozen in animate").toBe(false);
    await page.screenshot({ path: path.join(OUT, "02-truchet-animate.png"), fullPage: true });
  });

  test("3 — renderer-class matrix Generate + Animate", async ({ page }) => {
    for (const { label, piece, liveGenerate } of RENDERER_MATRIX) {
      await openStudioHome(page);
      await selectPieceInConfig(page, piece);
      await clickStudioMode(page, "generate");
      await waitForStudioSceneSettled(page, 180_000);
      await page.waitForFunction(
        () =>
          !(window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } })
            .__NUMBRANE_STUDIO__?.generating,
        null,
        { timeout: 180_000 },
      );
      await assertStageMeaningfullyPresent(page, { pieceId: piece, mode: "generate" });
      if (liveGenerate) {
        const s = await readStagePresentSnapshot(page);
        expect(s.generateFrozen).toBe(true);
      }
      await page.screenshot({
        path: path.join(OUT, `03-gen-${label.replace(/\W+/g, "-")}.png`),
        fullPage: true,
      });

      await clickStudioMode(page, "animate");
      await waitForStudioSceneSettled(page, 180_000);
      await waitForLiveFrame(page, 90_000);
      await assertStageMeaningfullyPresent(page, { pieceId: piece, mode: "animate" });
      await page.screenshot({
        path: path.join(OUT, `03-anim-${label.replace(/\W+/g, "-")}.png`),
        fullPage: true,
      });
    }
  });

  test("4 — stale frame rejection on piece switch", async ({ page }) => {
    await openStudioHome(page);
    await selectPieceInConfig(page, "tiling/truchet-tiles");
    await clickStudioMode(page, "generate");
    await waitForStudioSceneSettled(page, 120_000);
    const a = await assertStageMeaningfullyPresent(page, { pieceId: "tiling/truchet-tiles" });

    await selectPieceInConfig(page, "growth/differential-growth");
    await waitForStudioSceneSettled(page, 180_000);
    await page.waitForFunction(
      () =>
        !(window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } })
          .__NUMBRANE_STUDIO__?.generating,
      null,
      { timeout: 180_000 },
    );
    const b = await assertStageMeaningfullyPresent(page, {
      pieceId: "growth/differential-growth",
    });
    expect(b.sceneGeneration).toBeGreaterThan(a.sceneGeneration);
    expect(b.presentEpoch).toBeGreaterThanOrEqual(a.presentEpoch);
    expect(b.digest).not.toBe(a.digest);
  });

  test("5 — chrome toggle does not blank generate", async ({ page }) => {
    await openStudioHome(page);
    await selectPieceInConfig(page, "tiling/truchet-tiles");
    await clickStudioMode(page, "generate");
    await waitForStudioSceneSettled(page, 120_000);
    await assertStageMeaningfullyPresent(page, { pieceId: "tiling/truchet-tiles" });
    await page.evaluate(() => {
      (
        window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
      ).__NUMBRANE_STUDIO__?.showChromeForTest?.(false);
    });
    await page.waitForTimeout(400);
    await assertStageMeaningfullyPresent(page, { pieceId: "tiling/truchet-tiles" });
    await page.evaluate(() => {
      (
        window as unknown as { __NUMBRANE_STUDIO__?: { showChromeForTest?: (b?: boolean) => void } }
      ).__NUMBRANE_STUDIO__?.showChromeForTest?.(true);
    });
    await page.waitForTimeout(400);
    await assertStageMeaningfullyPresent(page, { pieceId: "tiling/truchet-tiles" });
  });

  test("6 — behavior selector does not suppress base render", async ({ page }) => {
    await openStudioHome(page);
    await selectPieceInConfig(page, "fractals/strange-attractors");
    await clickStudioMode(page, "animate");
    await waitForStudioSceneSettled(page, 180_000);
    await waitForLiveFrame(page, 90_000);
    const px = await page.evaluate(() => {
      const app = (
        window as unknown as {
          __NUMBRANE_STUDIO__?: { samplePresentedPixels?: () => { occupiedFraction: number } | null };
        }
      ).__NUMBRANE_STUDIO__;
      return app?.samplePresentedPixels?.(64, 36);
    });
    expect(px && frameHasMeaningfulStructure(px)).toBe(true);
    const behaviorCount = await page.locator("#scene-behavior option:not([value=''])").count();
    expect(behaviorCount).toBeGreaterThan(0);
  });
});
