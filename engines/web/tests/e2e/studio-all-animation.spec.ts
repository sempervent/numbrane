/**
 * Exhaustive Studio ANIMATE liveness — every maintained catalog piece.
 * Requires Docker Studio on :8080.
 */

import { test, expect, type Page } from "@playwright/test";
import { catalogPieceIds } from "../../src/studio/runtime/registry";
import {
  enterAnimate,
  hasMeaningfulMotion,
  sampleCanvas,
  sampleDifference,
  saveFailureArtifacts,
  studioDiag,
  waitForLiveFrame,
} from "./animationMetrics";

const catalogPieces = catalogPieceIds().sort();

async function screenshotBuffer(page: Page): Promise<Buffer> {
  return page.locator("#stage").screenshot({ type: "png", timeout: 20_000 });
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
    await waitForLiveFrame(page, 25_000);

    const banner = await page
      .locator("#unsupported-banner.visible")
      .textContent({ timeout: 500 })
      .catch(() => null);
    expect(banner ?? "", `${piece} unsupported banner`).not.toMatch(/failed|stalled/i);

    const aSample = await sampleCanvas(page);
    expect(aSample.nonBlack, `${piece} visible`).toBeGreaterThan(0.002);
    expect(aSample.occupancy + aSample.variance, `${piece} structure`).toBeGreaterThan(0.003);

    const diagA = await studioDiag(page);
    const aShot = await screenshotBuffer(page);
    const digestA = diagA.pixelDigest ?? "";

    await page.waitForTimeout(500);
    const bSample = await sampleCanvas(page);
    const digestB = (await studioDiag(page)).pixelDigest ?? "";

    await page.waitForTimeout(1000);
    const cSample = await sampleCanvas(page);
    const cShot = await screenshotBuffer(page);
    const diagC = await studioDiag(page);
    const digestC = diagC.pixelDigest ?? "";

    const diagMid = diagC;
    expect((diagMid.renderCount ?? 0) > 0, `${piece} render count`).toBe(true);
    expect((diagMid.logicalFrame ?? 0) > 3, `${piece} logical frame`).toBe(true);

    const frameAdvance = (diagC.logicalFrame ?? 0) - (diagA.logicalFrame ?? 0);
    const motionOk =
      hasMeaningfulMotion(aSample, bSample, cSample) ||
      (digestA !== digestB && digestB !== digestC) ||
      sampleDifference(aSample, cSample) > 0.006 ||
      frameAdvance > 12;

    if (!motionOk) {
      await saveFailureArtifacts(piece, page, aShot, cShot, consoleLines, diagMid);
    }
    expect(motionOk, `${piece} A/B/C visual motion`).toBe(true);

    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const dSample = await sampleCanvas(page);
    await page.waitForTimeout(700);
    const eSample = await sampleCanvas(page);
    expect(sampleDifference(dSample, eSample), `${piece} pause freeze`).toBeLessThan(0.012);

    await page.keyboard.press("Space");
    await page.waitForTimeout(900);
    const fSample = await sampleCanvas(page);
    const digestE = (await studioDiag(page)).pixelDigest ?? "";
    await page.waitForTimeout(400);
    const digestF = (await studioDiag(page)).pixelDigest ?? "";
    const resumed =
      sampleDifference(eSample, fSample) > 0.003 || digestE !== digestF;
    expect(resumed, `${piece} resume`).toBe(true);

    await page.keyboard.press("r");
    await page.waitForTimeout(1200);
    const afterSeed = await sampleCanvas(page);
    expect(afterSeed.nonBlack, `${piece} seed restart visible`).toBeGreaterThan(0.002);
    expect(
      sampleDifference(cSample, afterSeed) > 0.003 || afterSeed.variance > 0.001,
      `${piece} seed restart motion`,
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
        piece === "audiovisual/nodes" ||
        piece === "reference/audiovisual-nodes" ||
        piece === "growth/slime-mold" ||
        piece === "flagship/latticefall";
      test.setTimeout(heavy ? 240_000 : 150_000);
      await exercisePiece(page, piece);
    });
  }
});
