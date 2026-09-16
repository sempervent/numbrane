/**
 * Robust visual metrics for Studio ANIMATE liveness tests.
 */

import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export type CanvasSample = {
  nonBlack: number;
  variance: number;
  mean: number;
  occupancy: number;
};

export type StudioDiag = {
  piece?: string;
  backend?: string;
  renderCount?: number;
  updateCount?: number;
  pixelDigest?: string;
  logicalFrame?: number;
  simulationPaused?: boolean;
  transportPlaying?: boolean;
};

export async function sampleCanvas(page: Page): Promise<CanvasSample> {
  const apiPreview = await page
    .locator("#generate-preview.visible")
    .isVisible({ timeout: 500 })
    .catch(() => false);
  const target = apiPreview ? page.locator("#generate-preview") : page.locator("#stage");
  const png = await target.screenshot({ type: "png", timeout: 20_000, animations: "disabled" });
  const body = png.subarray(100, Math.min(png.length, 12_000));
  let sum = 0;
  let sum2 = 0;
  let nonBlack = 0;
  let occupied = 0;
  const step = 11;
  const samples = Math.floor(body.length / step);
  for (let i = 0; i < body.length; i += step) {
    const v = body[i]!;
    sum += v;
    sum2 += v * v;
    if (v > 8) nonBlack += 1;
    if (v > 20) occupied += 1;
  }
  const mean = sum / Math.max(1, samples);
  const variance = sum2 / Math.max(1, samples) - mean * mean;
  return {
    nonBlack: nonBlack / Math.max(1, samples),
    occupancy: occupied / Math.max(1, samples),
    variance,
    mean,
  };
}

export function sampleDifference(a: CanvasSample, b: CanvasSample): number {
  const meanDelta = Math.abs(a.mean - b.mean) / 255;
  const varDelta = Math.abs(a.variance - b.variance) / Math.max(1, a.variance + b.variance + 1);
  const occDelta = Math.abs(a.occupancy - b.occupancy);
  return meanDelta * 0.45 + varDelta * 0.35 + occDelta * 0.2;
}

/** Require ~0.5–1% equivalent visual change between samples. */
export function hasMeaningfulMotion(a: CanvasSample, b: CanvasSample, c: CanvasSample): boolean {
  const ab = sampleDifference(a, b);
  const bc = sampleDifference(b, c);
  const ac = sampleDifference(a, c);
  return ab > 0.003 && bc > 0.003 && ac > 0.006;
}

export async function studioDiag(page: Page): Promise<StudioDiag> {
  return page.evaluate(() => {
    const s = (window as unknown as { __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => StudioDiag } })
      .__NUMBRANE_STUDIO__;
    return s?.getAnimationDiagnostics?.() ?? {};
  });
}

export async function waitForLiveFrame(page: Page, timeoutMs = 20_000): Promise<StudioDiag> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await studioDiag(page);
    if ((d.renderCount ?? 0) > 0 && d.pixelDigest) {
      return d;
    }
    await page.waitForTimeout(200);
  }
  throw new Error("Timed out waiting for first live frame");
}

export async function enterAnimate(page: Page, piece: string, seed = 42): Promise<void> {
  await page.goto(`/studio.html?mode=animate&piece=${encodeURIComponent(piece)}&seed=${seed}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => !!(window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__,
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(800);
}

export async function saveFailureArtifacts(
  pieceId: string,
  page: Page,
  before: Buffer,
  after: Buffer,
  consoleLines: string[],
  runtime: StudioDiag,
): Promise<void> {
  const dir = path.join(
    process.cwd(),
    "artifacts/animation-failures",
    pieceId.replace(/\//g, "_"),
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "before.png"), before);
  fs.writeFileSync(path.join(dir, "after.png"), after);
  fs.writeFileSync(path.join(dir, "console.log"), consoleLines.join("\n"));
  fs.writeFileSync(path.join(dir, "runtime.json"), JSON.stringify(runtime, null, 2));
}
