/**
 * Docker :8080 sentinel matrix — blank detection via presented pixels.
 */

import { test, expect } from "@playwright/test";
import {
  enterAnimate,
  frameIsVisible,
  sampleStagePixels,
  studioDiag,
  waitForLiveFrame,
} from "./animationMetrics";
import { rendererKindFor, studioSurface } from "../../src/studio/runtime/surface";

const SENTINELS: string[] = [
  "geometry/metatron",
  "fractals/sdf-raymarch2d",
  "reaction-diffusion/reaction-diffusion",
  "growth/slime-mold",
  "flagship/latticefall",
  "particles/noodles",
  "fields/flow-hatching",
  "tiling/truchet-tiles",
  "audiovisual/nodes",
];

test.describe("Docker piece sentinel matrix", () => {
  test.setTimeout(150_000);

  for (const piece of SENTINELS) {
    test(`${piece} animate presents non-blank frame`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedReqs: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        failedReqs.push(`${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`);
      });

      await enterAnimate(page, piece, 42);
      const diag0 = await waitForLiveFrame(page, 75_000);
      await page.waitForTimeout(1500);
      const diag1 = await studioDiag(page);
      const px0 = await sampleStagePixels(page);
      await page.waitForTimeout(800);
      const px1 = await sampleStagePixels(page);

      const backend = rendererKindFor(piece, "animate") ?? "unknown";
      const surface = studioSurface(piece, "animate");
      const visible = frameIsVisible(px1);
      const changed =
        px1.digest !== px0.digest ||
        px1.changedPixelFraction >= 0.002 ||
        px1.rmsDifference >= 2;

      const info = {
        piece,
        backend,
        surface,
        update0: diag0.updateCount,
        update1: diag1.updateCount,
        render1: diag1.renderCount,
        present1: diag1.presentCount,
        webglError: (diag1 as { webglError?: string }).webglError,
        visible,
        changed,
        meanLum: px1.meanLuminance,
        occupied: px1.occupiedFraction,
        consoleErrors: consoleErrors.slice(0, 5),
        failedReqs: failedReqs.slice(0, 8),
      };

      if (!visible) {
        throw new Error(`BLANK/INVISIBLE: ${JSON.stringify(info, null, 2)}`);
      }
      expect(diag1.renderCount ?? 0, JSON.stringify(info)).toBeGreaterThan(0);
      expect(diag1.updateCount ?? 0, JSON.stringify(info)).toBeGreaterThan(0);
    });
  }
});
