/**
 * Reproducible LIVE runtime benchmarks — writes JSON under artifacts/performance/.
 * Absolute FPS targets depend on GPU; relative regressions and stall counters are CI-stable.
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { enterAnimateViaUi } from "./studioUi";
import { frameIsVisible, sampleStagePixels, studioDiag, waitForLiveFrame } from "./animationMetrics";

type BenchCase = {
  id: string;
  piece: string;
  settleMs: number;
  sampleMs: number;
  mashup?: boolean;
};

const CASES: BenchCase[] = [
  { id: "simple-shader", piece: "fractals/escape-time", settleMs: 1000, sampleMs: 3000 },
  { id: "geometry-ir", piece: "geometry/metatron", settleMs: 1000, sampleMs: 3000 },
  { id: "stateful-rd", piece: "reaction-diffusion/reaction-diffusion", settleMs: 1200, sampleMs: 3000 },
  { id: "mashup-cosmic", piece: "mashups/cosmic-venation-tiles", settleMs: 1500, sampleMs: 3500, mashup: true },
  { id: "mashup-ritual", piece: "mashups/ritual-diagrams", settleMs: 1500, sampleMs: 3500, mashup: true },
];

const outDir = path.resolve(process.cwd(), "../../artifacts/performance");

async function collectPacing(page: import("@playwright/test").Page, sampleMs: number) {
  await page.waitForTimeout(sampleMs);
  return page.evaluate(() => {
    const app = window as unknown as {
      __NUMBRANE_STUDIO__?: {
        exportPerformanceReport?: () => Record<string, unknown>;
        getAnimationDiagnostics?: () => Record<string, unknown>;
      };
    };
    const report = app.__NUMBRANE_STUDIO__?.exportPerformanceReport?.() ?? {};
    const diag = app.__NUMBRANE_STUDIO__?.getAnimationDiagnostics?.() ?? {};
    return { report, diag };
  });
}

test.describe("Studio runtime benchmarks", () => {
  test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
  });

  for (const c of CASES) {
    test(`${c.id} frame pacing`, async ({ page }) => {
      test.setTimeout(180_000);
      const tLoad0 = Date.now();
      await enterAnimateViaUi(page, c.piece);
      await waitForLiveFrame(page, 60_000);
      const timeToFirstFrameMs = Date.now() - tLoad0;
      await page.waitForTimeout(c.settleMs);
      // Drop load/transition stalls from the measurement window.
      await page.evaluate(() => {
        (
          window as unknown as { __NUMBRANE_STUDIO__?: { resetFramePacing?: () => void } }
        ).__NUMBRANE_STUDIO__?.resetFramePacing?.();
      });

      const px0 = await sampleStagePixels(page);
      expect(frameIsVisible(px0), `${c.id} visible`).toBe(true);

      const { report, diag } = await collectPacing(page, c.sampleMs);
      const pacing = (report.framePacing ?? {}) as {
        visualFps?: number;
        p50Ms?: number;
        p95Ms?: number;
        p99Ms?: number;
        maxMs?: number;
        over100Ms?: number;
        over500Ms?: number;
        sampleCount?: number;
      };
      const timing = (report.sessionTiming ?? {}) as {
        lastScenePrepareMs?: number;
        longestMainThreadBlockMs?: number;
        recentLongTaskCount?: number;
      };

      const row = {
        id: c.id,
        piece: c.piece,
        mashup: Boolean(c.mashup),
        timeToFirstFrameMs,
        pacing,
        timing,
        presentationMode: diag.presentationMode,
        presentCount: diag.presentCount,
        capturedAt: new Date().toISOString(),
        env: {
          baseURL: test.info().project.use.baseURL,
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

      fs.writeFileSync(
        path.join(outDir, `${c.id}.json`),
        JSON.stringify(row, null, 2),
      );

      // Soft CI gates (SwiftShader absolute FPS is not a target). Scene must stay alive
      // without unexplained multi-second stalls in the settled measurement window.
      expect((pacing.sampleCount ?? 0) > 20, `${c.id} enough samples`).toBe(true);
      expect(pacing.over500Ms ?? 0, `${c.id} no >500ms frames in settled window`).toBe(0);
      expect(pacing.maxMs ?? 0, `${c.id} max frame < 1s settled`).toBeLessThan(1000);
      if (c.mashup) {
        expect(
          timing.lastScenePrepareMs ?? 0,
          `${c.id} prepare recorded`,
        ).toBeGreaterThan(0);
      }

      const d = await studioDiag(page);
      expect((d.rafCount ?? 0) > 0).toBe(true);
      expect((d.presentCount ?? 0) > 0).toBe(true);
    });
  }

  test("rapid switch prepare stays cancellable", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimateViaUi(page, "geometry/metatron");
    await waitForLiveFrame(page, 45_000);

    const pieces = [
      "mashups/cosmic-venation-tiles",
      "geometry/metatron",
      "mashups/ritual-diagrams",
      "fractals/escape-time",
      "mashups/slime-on-sdf",
    ];
    for (const piece of pieces) {
      await page.evaluate((id) => {
        const app = (window as unknown as {
          __NUMBRANE_STUDIO__?: { setPiece?: (p: string) => Promise<void> };
        }).__NUMBRANE_STUDIO__;
        void app?.setPiece?.(id);
      }, piece);
      await page.waitForTimeout(120);
    }
    await waitForLiveFrame(page, 45_000);
    const px = await sampleStagePixels(page);
    expect(frameIsVisible(px)).toBe(true);
    const report = await page.evaluate(() => {
      return (
        window as unknown as {
          __NUMBRANE_STUDIO__?: { exportPerformanceReport?: () => Record<string, unknown> };
        }
      ).__NUMBRANE_STUDIO__?.exportPerformanceReport?.();
    });
    fs.writeFileSync(
      path.join(outDir, "rapid-switch.json"),
      JSON.stringify(report, null, 2),
    );
    expect(report).toBeTruthy();
  });

  test("pan continuity during 8s sample", async ({ page }) => {
    test.setTimeout(120_000);
    await enterAnimateViaUi(page, "geometry/metatron");
    await waitForLiveFrame(page, 45_000);
    await page.evaluate(() => {
      (
        window as unknown as {
          __NUMBRANE_STUDIO__?: { applyAnimationMethodId?: (id: string) => void };
        }
      ).__NUMBRANE_STUDIO__?.applyAnimationMethodId?.("pan-left-right");
    });
    const samples: number[] = [];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      const x = await page.evaluate(() => {
        const d = (
          window as unknown as {
            __NUMBRANE_STUDIO__?: { getAnimationDiagnostics?: () => { cameraCenterX?: number } };
          }
        ).__NUMBRANE_STUDIO__?.getAnimationDiagnostics?.();
        return d?.cameraCenterX ?? 0;
      });
      samples.push(x);
    }
    // Continuous left→right pan should keep advancing (allow tiny float noise / wrap edges).
    let advances = 0;
    let wraps = 0;
    for (let i = 1; i < samples.length; i++) {
      const d = samples[i]! - samples[i - 1]!;
      if (d > 1e-5) advances += 1;
      if (d < -0.05) wraps += 1;
    }
    fs.writeFileSync(
      path.join(outDir, "pan-continuity.json"),
      JSON.stringify({ samples, advances, wraps }, null, 2),
    );
    expect(advances + wraps, "pan should keep moving").toBeGreaterThanOrEqual(10);
  });
});
