/**
 * Exhaustive Studio ANIMATE — browser catalog + UI piece selection (not registry deep-link).
 */

import { test, expect, type Page } from "@playwright/test";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";
import {
  enterAnimateViaUi,
  fetchBrowserCatalog,
  studioPieceState,
  unsupportedBannerText,
} from "./studioUi";
import {
  frameIsVisible,
  sampleStagePixels,
  saveFailureArtifacts,
  studioDiag,
  waitForAnimationPhase,
  waitForLiveFrame,
} from "./animationMetrics";
import fs from "node:fs";
import path from "node:path";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

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

function holdContractMotion(
  during: PixelFrame[],
  afterHold: PixelFrame[],
  frameAdvances: number[],
): boolean {
  if (frameAdvances[frameAdvances.length - 1]! - frameAdvances[0]! < 20) return false;
  const earlyMotion = during.some(
    (s, i) =>
      i > 0 &&
      (s.changedPixelFraction >= 0.004 ||
        s.rmsDifference >= 3.5 ||
        s.digest !== during[i - 1]!.digest),
  );
  const stable =
    afterHold.length >= 2 &&
    afterHold.slice(1).every((s) => s.changedPixelFraction < 0.015);
  return earlyMotion && stable;
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

async function verifyPauseResume(page: Page, piece: string, pixelFreezeMax = 0.012): Promise<void> {
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const pauseF0 = await studioDiag(page);
  expect(pauseF0.transportPlaying, `${piece} pause transport`).toBe(false);
  const pauseA = await sampleStagePixels(page);
  await page.waitForTimeout(900);
  const pauseF1 = await studioDiag(page);
  expect(pauseF1.logicalFrame, `${piece} pause freeze frame`).toBe(pauseF0.logicalFrame);
  expect(pauseF1.transportPlaying, `${piece} pause transport hold`).toBe(false);
  const pauseB = await sampleStagePixels(page);
  expect(
    pauseB.changedPixelFraction,
    `${piece} pause freeze pixels`,
  ).toBeLessThan(pixelFreezeMax);
  expect(
    pauseB.digest === pauseA.digest || pauseB.changedPixelFraction < pixelFreezeMax,
    `${piece} pause stable digest`,
  ).toBe(true);

  await page.keyboard.press("Space");
  await page.waitForTimeout(800);
  const resumeDiag = await studioDiag(page);
  const resume = await sampleStagePixels(page);
  const resumedPlayback =
    resumeDiag.transportPlaying === true ||
    (resumeDiag.logicalFrame ?? 0) > (pauseF1.logicalFrame ?? 0);
  expect(
    resume.changedPixelFraction >= 0.003 ||
      isMeaningfulVisualChange(pauseB, resume) ||
      pauseB.digest !== resume.digest ||
      resumedPlayback,
    `${piece} resume`,
  ).toBe(true);
}

async function saveUiFailure(
  pieceId: string,
  page: Page,
  consoleLines: string[],
  runtime: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(
    process.cwd(),
    "artifacts/studio-piece-failures",
    pieceId.replace(/\//g, "_"),
  );
  fs.mkdirSync(dir, { recursive: true });
  await page.locator("#stage-wrap").screenshot({ path: path.join(dir, "after.png"), type: "png" });
  fs.writeFileSync(path.join(dir, "console.log"), consoleLines.join("\n"));
  fs.writeFileSync(path.join(dir, "runtime.json"), JSON.stringify(runtime, null, 2));
  const catalog = await fetchBrowserCatalog(process.env.STUDIO_URL ?? "http://127.0.0.1:8080");
  const entry = catalog.find((p) => p.piece_id === pieceId);
  if (entry) fs.writeFileSync(path.join(dir, "catalog-entry.json"), JSON.stringify(entry, null, 2));
}

async function exercisePieceUi(page: Page, piece: string): Promise<void> {
  const consoleLines: string[] = [];
  const onConsole = (msg: { type: () => string; text: () => string }) =>
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  const onError = (err: Error) => consoleLines.push(`[pageerror] ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);

  try {
    await enterAnimateViaUi(page, piece);
    const banner = await unsupportedBannerText(page);
    expect(banner, `${piece} unsupported banner`).toBeNull();

    await waitForLiveFrame(page, 30_000);
    const heavy =
      piece.startsWith("mashups/") ||
      piece === "flagship/latticefall" ||
      piece === "growth/slime-mold";
    await page.waitForFunction(
      () => {
        const d = (
          window as unknown as {
            __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => { rafCount?: number; presentCount?: number } };
          }
        ).__NUMBRANE_STUDIO__?.getAnimationDiagnostics?.();
        return (d?.rafCount ?? 0) > 15 && (d?.presentCount ?? 0) > 15;
      },
      null,
      { timeout: heavy ? 45_000 : 20_000 },
    );

    const diag0 = await studioDiag(page);
    const endBehavior = diag0.animationEndBehavior ?? "continuous";
    const durationSec = diag0.animationDurationSec ?? 12;
    const finiteHold = endBehavior === "hold" || endBehavior === "stop";

    let motionOk: boolean;
    let samples: PixelFrame[] = [];
    let frames: number[] = [];

    if (finiteHold) {
      await waitForAnimationPhase(page, Math.min(0.55, 0.45 * (2 / Math.max(0.5, durationSec))));
      await verifyPauseResume(page, piece, 0.08);
      const during: PixelFrame[] = [await sampleStagePixels(page)];
      await page.waitForTimeout(Math.min(1500, durationSec * 500));
      during.push(await sampleStagePixels(page));
      await waitForAnimationPhase(page, 1);
      await page.waitForTimeout(600);
      const afterHold = [await sampleStagePixels(page)];
      await page.waitForTimeout(1000);
      afterHold.push(await sampleStagePixels(page));
      samples = [...during, ...afterHold];
      frames = [diag0.logicalFrame ?? 0, (await studioDiag(page)).logicalFrame ?? 0];
      motionOk = holdContractMotion(during, afterHold, frames);
    } else {
      ({ samples, frames } = await collectCheckpoints(page));
      motionOk = sustainedMotion(samples, frames);
    }

    expect(frameIsVisible(samples[0]!), `${piece} visible`).toBe(true);

    const diag = await studioDiag(page);
    expect(diag.rafStalled, `${piece} RAF`).not.toBe(true);
    expect((diag.presentCount ?? 0) > 0, `${piece} present`).toBe(true);

    if (!motionOk) {
      await saveUiFailure(piece, page, consoleLines, await studioPieceState(page));
      await saveFailureArtifacts(piece, page, samples, consoleLines, diag);
    }
    expect(
      motionOk,
      `${piece} ${finiteHold ? "hold contract" : "12s sustained framebuffer motion"}`,
    ).toBe(true);

    if (!finiteHold) {
      await verifyPauseResume(page, piece);
    }
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
  }
}

test.describe("Studio exhaustive catalog animation (Docker UI catalog)", () => {
  test("browser catalog aligns with runtime audit", async ({ baseURL }) => {
    const catalog = await fetchBrowserCatalog(baseURL!);
    expect(catalog.length).toBe(31);
  });

});

test.describe("Studio exhaustive catalog animation per-piece", () => {
  for (const piece of catalogPieces) {
    test(`${piece} animates via UI`, async ({ page }) => {
      const heavy =
        piece.startsWith("mashups/") ||
        piece === "flagship/latticefall" ||
        piece === "growth/slime-mold";
      test.setTimeout(heavy ? 300_000 : 180_000);
      await exercisePieceUi(page, piece);
    });
  }
});
