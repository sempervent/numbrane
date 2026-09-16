/**
 * Exhaustive Studio ANIMATE — sustained motion via decoded #stage RGBA pixels.
 */

import { test, expect, type Page } from "@playwright/test";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";
import { catalogPieceIds } from "../../src/studio/runtime/registry";
import {
  enterAnimate,
  frameIsVisible,
  sampleStagePixels,
  saveFailureArtifacts,
  studioDiag,
  waitForLiveFrame,
} from "./animationMetrics";

const catalogPieces = catalogPieceIds().sort();
const CHECKPOINT_MS = [0, 500, 1000, 2000, 4000, 8000, 12000];

function sustainedMotion(samples: PixelFrame[], frameAdvances: number[]): boolean {
  if (frameAdvances[frameAdvances.length - 1]! - frameAdvances[0]! < 30) return false;
  let hits = 0;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.changedPixelFraction >= 0.004 || s.rmsDifference >= 3.5 || s.digest !== samples[i - 1]!.digest) {
      hits += 1;
    }
  }
  return hits >= 4;
}

async function collectCheckpoints(page: Page): Promise<{
  samples: PixelFrame[];
  frames: number[];
}> {
  const samples: PixelFrame[] = [];
  const frames: number[] = [];
  let elapsed = 0;
  for (const target of CHECKPOINT_MS) {
    const wait = target - elapsed;
    if (wait > 0) await page.waitForTimeout(wait);
    elapsed = target;
    samples.push(await sampleStagePixels(page));
    frames.push((await studioDiag(page)).logicalFrame ?? 0);
  }
  return { samples, frames };
}

async function exercisePiece(page: Page, piece: string): Promise<void> {
  const consoleLines: string[] = [];
  const onConsole = (msg: { type: () => string; text: () => string }) =>
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  const onError = (err: Error) => consoleLines.push(`[pageerror] ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);

  try {
    await enterAnimate(page, piece, 42);
    await waitForLiveFrame(page, 30_000);
    const heavy =
      piece.startsWith("mashups/") ||
      piece === "flagship/latticefall" ||
      piece === "growth/slime-mold";
    await page.waitForFunction(
      () => {
        const d = (
          window as unknown as {
            __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => { rafCount?: number; rafStalled?: boolean } };
          }
        ).__NUMBRANE_STUDIO__?.getAnimationDiagnostics?.();
        return (d?.rafCount ?? 0) > 15 && (d?.presentCount ?? 0) > 15;
      },
      null,
      { timeout: heavy ? 45_000 : 20_000 },
    );

    const banner = await page
      .locator("#unsupported-banner.visible")
      .textContent({ timeout: 500 })
      .catch(() => null);
    expect(banner ?? "", `${piece} banner`).not.toMatch(/failed|stalled|RAF STALLED/i);

    const { samples, frames } = await collectCheckpoints(page);
    expect(frameIsVisible(samples[0]!), `${piece} visible`).toBe(true);

    const diag = await studioDiag(page);
    expect(diag.rafStalled, `${piece} RAF`).not.toBe(true);
    expect((diag.presentCount ?? 0) > 0, `${piece} present`).toBe(true);

    const motionOk = sustainedMotion(samples, frames);
    if (!motionOk) {
      await saveFailureArtifacts(piece, page, samples, consoleLines, diag);
    }
    expect(motionOk, `${piece} 12s sustained framebuffer motion`).toBe(true);

    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    const pauseF0 = await studioDiag(page);
    const pauseStart = await sampleStagePixels(page);
    await page.waitForTimeout(800);
    const pauseF1 = await studioDiag(page);
    expect(pauseF1.logicalFrame, `${piece} pause freeze frame`).toBe(pauseF0.logicalFrame);
    const pauseB = await sampleStagePixels(page);
    expect(
      pauseB.changedPixelFraction,
      `${piece} pause freeze pixels`,
    ).toBeLessThan(0.012);
    expect(pauseStart.digest, `${piece} pause stable digest`).toBe(pauseB.digest);

    await page.keyboard.press("Space");
    await page.waitForTimeout(800);
    const resume = await sampleStagePixels(page);
    expect(
      resume.changedPixelFraction >= 0.003 ||
        isMeaningfulVisualChange(pauseB, resume) ||
        pauseB.digest !== resume.digest,
      `${piece} resume`,
    ).toBe(true);

    await page.evaluate(() => {
      (window as unknown as { __NUMBRANE_STUDIO__?: { setSolidColor?: (h: string) => void } })
        .__NUMBRANE_STUDIO__?.setSolidColor?.("#00ffff");
    });
    await page.waitForTimeout(400);
    const afterColor = await sampleStagePixels(page);
    const afterColorDiag = await studioDiag(page);
    expect(afterColorDiag.simulationPaused, `${piece} color pause`).not.toBe(true);
    expect(afterColorDiag.rafStalled, `${piece} color RAF`).not.toBe(true);

    await page.keyboard.press("r");
    await page.waitForTimeout(1200);
    const afterSeed = await sampleStagePixels(page);
    expect(frameIsVisible(afterSeed), `${piece} seed visible`).toBe(true);
    expect(
      afterSeed.changedPixelFraction >= 0.003 || afterSeed.digest !== afterColor.digest,
      `${piece} seed motion`,
    ).toBe(true);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
  }
}

test.describe("Studio exhaustive catalog animation (Docker)", () => {
  test("catalog matches registry", () => {
    expect(catalogPieces.length).toBe(31);
  });

  for (const piece of catalogPieces) {
    test(`${piece} animates in browser`, async ({ page }) => {
      const heavy =
        piece.startsWith("mashups/") ||
        piece === "flagship/latticefall" ||
        piece === "growth/slime-mold";
      test.setTimeout(heavy ? 300_000 : 180_000);
      await exercisePiece(page, piece);
    });
  }
});
