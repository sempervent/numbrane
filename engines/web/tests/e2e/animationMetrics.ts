/**
 * Studio ANIMATE liveness — actual decoded RGBA framebuffer metrics.
 * Never inspect compressed PNG file bytes as pixels.
 */

import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { PixelFrame } from "../../src/live/pixelMetrics";
import { isMeaningfulVisualChange } from "../../src/live/pixelMetrics";

export function frameIsVisible(px: PixelFrame): boolean {
  return (
    px.occupiedFraction > 0.00025 ||
    px.meanLuminance > 0.8 ||
    px.luminanceVariance > 1 ||
    (px.alphaOccupancy > 0.9 && px.luminanceVariance > 0.05) ||
    (px.alphaOccupancy > 0.9 && px.meanLuminance > 2)
  );
}

export type StudioDiag = {
  piece?: string;
  backend?: string;
  renderCount?: number;
  updateCount?: number;
  presentCount?: number;
  rafCount?: number;
  rafHz?: number;
  rafStalled?: boolean;
  logicalFrame?: number;
  simulationPaused?: boolean;
  transportPlaying?: boolean;
  presentedFrame?: PixelFrame | null;
};

export async function sampleStagePixels(page: Page): Promise<PixelFrame> {
  const sample = await page.evaluate(() => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: { samplePresentedPixels?: (w?: number, h?: number) => PixelFrame | null };
    }).__NUMBRANE_STUDIO__;
    const px = app?.samplePresentedPixels?.(64, 36);
    if (!px) throw new Error("samplePresentedPixels unavailable");
    return px;
  });
  return sample;
}

export async function studioDiag(page: Page): Promise<StudioDiag> {
  return page.evaluate(() => {
    const s = (window as unknown as { __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => StudioDiag } })
      .__NUMBRANE_STUDIO__;
    return s?.getAnimationDiagnostics?.() ?? {};
  });
}

export async function waitForLiveFrame(page: Page, timeoutMs = 25_000): Promise<StudioDiag> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await studioDiag(page);
    if ((d.presentCount ?? 0) > 0 && (d.renderCount ?? 0) > 0) {
      const px = await sampleStagePixels(page).catch(() => null);
      if (px && frameIsVisible(px)) return d;
    }
    await page.waitForTimeout(200);
  }
  throw new Error("Timed out waiting for first live presented frame");
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
  await page.waitForTimeout(600);
}

/** Sustained visual motion across multiple time windows (decoded pixels only). */
export function hasSustainedMotion(samples: PixelFrame[]): boolean {
  if (samples.length < 4) return false;
  const pairs: [number, number][] = [
    [0, 1],
    [1, 3],
    [3, 5],
  ];
  let hits = 0;
  for (const [a, b] of pairs) {
    if (b >= samples.length) continue;
    const later = { ...samples[b]!, changedPixelFraction: 0, rmsDifference: 0 };
    const stats = samples[b]!;
    if (
      isMeaningfulVisualChange(samples[a]!, stats) ||
      stats.changedPixelFraction >= 0.004 ||
      stats.rmsDifference >= 3.5
    ) {
      hits += 1;
    }
    void later;
  }
  return hits >= 2;
}

export async function saveFailureArtifacts(
  pieceId: string,
  page: Page,
  samples: PixelFrame[],
  consoleLines: string[],
  runtime: StudioDiag,
): Promise<void> {
  const dir = path.join(
    process.cwd(),
    "artifacts/animation-failures",
    pieceId.replace(/\//g, "_"),
  );
  fs.mkdirSync(dir, { recursive: true });
  await page.locator("#stage").screenshot({ path: path.join(dir, "after.png"), type: "png" });
  fs.writeFileSync(path.join(dir, "samples.json"), JSON.stringify(samples, null, 2));
  fs.writeFileSync(path.join(dir, "console.log"), consoleLines.join("\n"));
  fs.writeFileSync(path.join(dir, "runtime.json"), JSON.stringify(runtime, null, 2));
}
