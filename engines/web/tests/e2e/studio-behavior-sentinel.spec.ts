/**
 * Autonomous behavior selection — live motion must change without scene restart.
 */

import { test, expect } from "@playwright/test";
import { waitForStudioSceneSettled } from "./studioUi";
import { sampleStagePixels, studioDiag, waitForLiveFrame } from "./animationMetrics";

const CASES = [
  { piece: "tiling/truchet-tiles", a: "drift", b: "pulse" },
  { piece: "fractals/strange-attractors", a: "drift", b: "orbit" },
  { piece: "growth/differential-growth", a: "drift", b: "turbulence" },
  { piece: "fields/nebula", a: "flow", b: "pulse" },
  { piece: "particles/noodles", a: "flow", b: "turbulence" },
  { piece: "flagship/latticefall", a: "drift", b: "turbulence" },
  { piece: "mashups/attractor-calligraphy", a: "drift", b: "pulse" },
] as const;

test.describe.configure({ mode: "serial" });

test.describe("behavior sentinel", () => {
  for (const { piece, a, b } of CASES) {
    test(`${piece} — ${a} vs ${b} live`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto(
        `/studio.html?mode=animate&piece=${encodeURIComponent(piece)}&seed=42`,
        { waitUntil: "domcontentloaded", timeout: 30_000 },
      );
      await page.waitForFunction(
        () =>
          (window as unknown as { __NUMBRANE_STUDIO__?: { studioBootComplete?: boolean } })
            .__NUMBRANE_STUDIO__?.studioBootComplete === true,
        null,
        { timeout: 120_000 },
      );
      await waitForLiveFrame(page, 90_000);
      await waitForStudioSceneSettled(page, 120_000);

      const gen0 = await page.evaluate(() => {
        const app = window.__NUMBRANE_STUDIO__ as {
          sceneGeneration?: number;
          getAnimationDiagnostics?: () => { animationTimeSec?: number };
        };
        return {
          gen: app.sceneGeneration ?? 0,
          time: app.getAnimationDiagnostics?.().animationTimeSec ?? 0,
        };
      });

      await page.selectOption("#scene-behavior", a);
      await waitForStudioSceneSettled(page);
      await page.waitForTimeout(2000);
      const pxA = await sampleStagePixels(page);
      const metaA = await page.evaluate(() => {
        const app = window.__NUMBRANE_STUDIO__ as {
          sceneAuthoringSemantics?: { behaviorPresetId?: string };
          animationMethodId?: string;
          animationSpec?: { source?: string; components?: string[]; motion?: string };
        };
        return {
          behavior: app.sceneAuthoringSemantics?.behaviorPresetId,
          method: app.animationMethodId,
          spec: JSON.stringify(app.animationSpec ?? {}),
        };
      });
      expect(metaA.behavior).toBe(a);

      await page.selectOption("#scene-behavior", b);
      await waitForStudioSceneSettled(page);
      await page.waitForTimeout(2000);
      const pxB = await sampleStagePixels(page);
      const metaB = await page.evaluate(() => {
        const app = window.__NUMBRANE_STUDIO__ as {
          sceneAuthoringSemantics?: { behaviorPresetId?: string };
          animationMethodId?: string;
          sceneGeneration?: number;
          seed?: number;
          animationSpec?: { source?: string; components?: string[]; motion?: string };
          getAnimationDiagnostics?: () => { animationTimeSec?: number };
        };
        return {
          behavior: app.sceneAuthoringSemantics?.behaviorPresetId,
          method: app.animationMethodId,
          gen: app.sceneGeneration,
          seed: app.seed,
          spec: JSON.stringify(app.animationSpec ?? {}),
          time: app.getAnimationDiagnostics?.().animationTimeSec ?? 0,
        };
      });
      expect(metaB.behavior).toBe(b);
      expect(metaB.method).not.toBe(metaA.method);
      expect(metaB.spec).not.toBe(metaA.spec);
      expect(metaB.gen).toBe(gen0.gen);
      expect(metaB.time).toBeGreaterThan(0.5);

      const diag = await studioDiag(page);
      expect((diag.presentCount ?? 0) > 0).toBe(true);
      expect((diag.animationTimeSec ?? 0) > 0.8).toBe(true);
    });
  }
});
