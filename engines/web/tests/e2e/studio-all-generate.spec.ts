/**
 * Exhaustive Studio GENERATE — browser catalog + UI flow.
 */

import { test, expect } from "@playwright/test";
import {
  enterGenerateViaUi,
  failureBannerText,
} from "./studioUi";
import { frameIsVisible, sampleStagePixels } from "./animationMetrics";
import {
  collectPieceManifests,
  studioVisibleManifests,
} from "../../src/studio/catalog/manifestCollection";

const catalogPieces = studioVisibleManifests(collectPieceManifests())
  .map((m) => m.piece_id)
  .sort();

const SLOW_GENERATE = new Set([
  "mashups/attractor-calligraphy",
  "mashups/striped-worms-eating-boxes",
  "mashups/slime-on-sdf",
  "fractals/sdf-raymarch2d",
]);

async function waitForGenerateSurface(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as unknown as {
        __NUMBRANE_STUDIO__?: { mode?: string; generating?: boolean; renderDigest?: string };
      }).__NUMBRANE_STUDIO__;
      if (!app || app.mode !== "generate") return false;
      const banner = document.getElementById("unsupported-banner");
      if (banner?.classList.contains("visible")) return false;
      const preview = document.getElementById("generate-preview") as HTMLImageElement | null;
      const canvas = document.getElementById("stage") as HTMLCanvasElement | null;
      const previewReady =
        !!preview?.src &&
        preview.src.length > 8 &&
        (preview.classList.contains("visible") || preview.src.startsWith("blob:"));
      const liveReady = !!canvas && !canvas.classList.contains("hidden-live");
      return previewReady || liveReady;
    },
    null,
    { timeout: 180_000 },
  );
}

function parsePngDimensions(png: Uint8Array): { width: number; height: number } {
  const width = (png[16]! << 24) | (png[17]! << 16) | (png[18]! << 8) | png[19]!;
  const height = (png[20]! << 24) | (png[21]! << 16) | (png[22]! << 8) | png[23]!;
  return { width, height };
}

async function exerciseGenerate(page: import("@playwright/test").Page, piece: string): Promise<void> {
  await enterGenerateViaUi(page, piece);
  const banner = await failureBannerText(page);
  expect(banner, `${piece} generate banner`).toBeNull();

  await waitForGenerateSurface(page);
  await page.waitForFunction(
    () => {
      const preview = document.getElementById("generate-preview") as HTMLImageElement | null;
      const canvas = document.getElementById("stage") as HTMLCanvasElement | null;
      if (preview?.src && preview.complete && preview.naturalWidth > 0) return true;
      return !!canvas && !canvas.classList.contains("hidden-live") && canvas.width > 0;
    },
    null,
    { timeout: 180_000 },
  );
  const px = await sampleStagePixels(page);
  expect(frameIsVisible(px), `${piece} generate visible`).toBe(true);

  await page.keyboard.press("r");
  const surface = await page.evaluate(() => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => { surface?: string } };
    }).__NUMBRANE_STUDIO__;
    return app?.getAnimationDiagnostics?.().surface ?? "unknown";
  });
  if (surface === "api-preview") {
    await page.waitForFunction(
      () =>
        !(window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } }).__NUMBRANE_STUDIO__
          ?.generating,
      null,
      { timeout: SLOW_GENERATE.has(piece) ? 480_000 : 240_000 },
    );
  } else {
    await page.waitForTimeout(1200);
  }
  await waitForGenerateSurface(page);
  const px2 = await sampleStagePixels(page);
  expect(
    frameIsVisible(px2) || px2.digest !== px.digest,
    `${piece} reseed visible`,
  ).toBe(true);

  const exported = await page.evaluate(async () => {
    const app = (window as unknown as {
      __NUMBRANE_STUDIO__?: {
        captureGeneratePngBytes?: () => Promise<{
          ok: boolean;
          status?: number;
          error?: string;
          bytes?: Uint8Array;
        }>;
      };
    }).__NUMBRANE_STUDIO__;
    const res = await app?.captureGeneratePngBytes?.();
    if (!res) return { ok: false, error: "captureGeneratePngBytes unavailable" };
    if (!res.ok || !res.bytes) return { ok: false, status: res.status, error: res.error ?? "empty png" };
    return { ok: true, status: res.status, bytes: Array.from(res.bytes) };
  });
  expect(exported.ok, `${piece} png export ${JSON.stringify(exported)}`).toBe(true);

  const pngBytes = Uint8Array.from(exported.bytes ?? []);
  expect(pngBytes.length).toBeGreaterThan(64);
  expect(pngBytes[0]).toBe(0x89);
  expect(String.fromCharCode(pngBytes[1]!, pngBytes[2]!, pngBytes[3]!)).toBe("PNG");
  const { width, height } = parsePngDimensions(pngBytes);
  expect(width, `${piece} png width`).toBeGreaterThanOrEqual(64);
  expect(height, `${piece} png height`).toBeGreaterThanOrEqual(64);
}

test.describe("Studio exhaustive catalog generate", () => {
  for (const piece of catalogPieces) {
    test(`${piece} generates via UI`, async ({ page }) => {
      test.setTimeout(SLOW_GENERATE.has(piece) ? 900_000 : 360_000);
      await exerciseGenerate(page, piece);
    });
  }
});
