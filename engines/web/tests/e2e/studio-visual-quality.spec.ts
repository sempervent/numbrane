/**
 * Rendered perceptual census — showcase/curated performance catalog (Docker).
 */

import { test, expect } from "@playwright/test";
import { PERFORMANCE_CATALOG } from "../../src/studio/performance/catalog";
import {
  assertPerceptuallyAlive,
  enterAnimate,
  frameIsVisible,
  sampleStagePixels,
  waitForAnimationTime,
  waitForLiveFrame,
} from "./animationMetrics";
import { classifyVisualQuality, snapshotFromFrame } from "../../src/live/visualQuality";

const CENSUS = PERFORMANCE_CATALOG.filter(
  (m) => m.tier === "showcase" || m.tier === "curated",
);

function censusWarmupSec(meta: (typeof CENSUS)[number]): number {
  if (meta.tags?.includes("stateful")) return 36;
  if (meta.tags?.includes("organic")) return 42;
  if (meta.motion === "intense") return 24;
  if (meta.motion === "calm") return 12;
  return 18;
}

test.describe("Rendered visual quality census", () => {
  for (const meta of CENSUS) {
    const { pieceId, density, motion } = meta;
    test(`${pieceId} stays structurally alive`, async ({ page }) => {
      test.setTimeout(180_000);
      await enterAnimate(page, pieceId, meta.previewSeed ?? 42);
      await waitForLiveFrame(page, 60_000);
      const warm = censusWarmupSec(meta);
      await waitForAnimationTime(page, warm, 90_000);
      let a = await sampleStagePixels(page);
      if (!frameIsVisible(a)) {
        await waitForAnimationTime(page, warm + 12, 90_000);
        a = await sampleStagePixels(page);
      }
      await waitForAnimationTime(page, warm + 8, 90_000);
      const b = await sampleStagePixels(page);
      expect(frameIsVisible(b), `${pieceId}: stage never became visibly structured`).toBe(true);
      const q = classifyVisualQuality(
        snapshotFromFrame(b),
        { density, motion },
        0,
        true,
        warm,
      );
      expect(
        q.status === "degenerate-dark" || q.status === "degenerate-flat",
        `${pieceId}: ${q.reason}`,
      ).toBe(false);
      assertPerceptuallyAlive(a, b, { density, motion }, pieceId);
    });
  }
});
