/**
 * Human-visible baseline — run with BASE_URL pointing at comparison worktree.
 */
import { test, expect } from "@playwright/test";
import { frameHasMeaningfulStructure } from "../../src/live/pixelMetrics";

async function uiGenerateAnimate(
  page: import("@playwright/test").Page,
  pieceId: string,
): Promise<{ gen: unknown; anim: unknown }> {
  await page.goto("/studio.html", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
        .__NUMBRANE_STUDIO__?.studioBootComplete === true,
    null,
    { timeout: 120_000 },
  );
  await page.selectOption("#cfg-piece", pieceId);
  await page.waitForFunction(
    (id) =>
      (window as unknown as { __NUMBRANE_STUDIO__?: { pieceId?: string } }).__NUMBRANE_STUDIO__
        ?.pieceId === id,
    pieceId,
    { timeout: 30_000 },
  );
  await page.locator('#create-subbar button[data-mode="generate"]').click();
  await page.waitForTimeout(3000);
  const gen = await page.evaluate(() => {
    const app = (
      window as unknown as {
        __NUMBRANE_STUDIO__?: {
          samplePresentedPixels?: () => import("../../src/live/pixelMetrics").PixelFrame | null;
          getAnimationDiagnostics?: () => Record<string, unknown>;
        };
      }
    ).__NUMBRANE_STUDIO__;
    return { px: app?.samplePresentedPixels?.(64, 36), diag: app?.getAnimationDiagnostics?.() };
  });
  await page.locator('#create-subbar button[data-mode="animate"]').click();
  await page.waitForTimeout(3000);
  const anim = await page.evaluate(() => {
    const app = (
      window as unknown as {
        __NUMBRANE_STUDIO__?: {
          samplePresentedPixels?: () => import("../../src/live/pixelMetrics").PixelFrame | null;
          getAnimationDiagnostics?: () => Record<string, unknown>;
        };
      }
    ).__NUMBRANE_STUDIO__;
    return { px: app?.samplePresentedPixels?.(64, 36), diag: app?.getAnimationDiagnostics?.() };
  });
  return { gen, anim };
}

test("baseline circle lattice + truchet", async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  for (const piece of ["reference/circle-lattice", "tiling/truchet-tiles"] as const) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
          .__NUMBRANE_STUDIO__?.studioBootComplete === true,
      null,
      { timeout: 120_000 },
    );
    const { gen, anim } = await uiGenerateAnimate(page, piece);
    console.log(`[${baseURL}] ${piece} GEN`, JSON.stringify(gen));
    console.log(`[${baseURL}] ${piece} ANIM`, JSON.stringify(anim));
    const gpx = (gen as { px?: { edgeEnergy?: number } }).px;
    const apx = (anim as { px?: { edgeEnergy?: number } }).px;
    expect(gpx && frameHasMeaningfulStructure(gpx as never), `${piece} generate`).toBe(true);
    expect(apx && frameHasMeaningfulStructure(apx as never), `${piece} animate`).toBe(true);
  }
});
