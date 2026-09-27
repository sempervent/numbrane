/**
 * Set morph — monotonic progress, visible frames, animation clock through advance.
 */

import { test, expect } from "@playwright/test";
import { openStudioHome, clickStudioMode } from "./studioUi";
import { frameIsVisible, sampleStagePixels, studioDiag, waitForLiveFrame } from "./animationMetrics";

type StudioWin = {
  __NUMBRANE_STUDIO__: {
    setScore: {
      loadDocument: (set: unknown) => void;
      startPerform: () => Promise<void>;
    };
    setScoreAdvance: () => Promise<void>;
    session?: {
      getSetOrchestratorSnapshot: () => {
        transition: { progress: number; fromSceneId: string; toSceneId: string } | null;
        activeSceneId: string;
      } | null;
    };
  };
};

test.describe("Set transition continuity", () => {
  test("performance fixture advances with monotonic morph progress", async ({ page }) => {
    test.setTimeout(240_000);
    await openStudioHome(page);
    await clickStudioMode(page, "animate");
    await page.evaluate(async () => {
      const app = (window as unknown as StudioWin).__NUMBRANE_STUDIO__;
      const res = await fetch("/sets/set-performance-fixture.json");
      if (!res.ok) throw new Error(`fixture fetch ${res.status}`);
      const set = await res.json();
      app.setScore.loadDocument(set);
      await app.setScore.startPerform();
    });
    await waitForLiveFrame(page, 60_000);

    const lastProgressByMorph = new Map<string, number>();
    let lastAnim = 0;
    for (let step = 0; step < 24; step++) {
      await page.evaluate(async () => {
        await (window as unknown as StudioWin).__NUMBRANE_STUDIO__.setScoreAdvance();
      });
      await page.waitForTimeout(400);
      const snap = await page.evaluate(() => {
        const app = (window as unknown as StudioWin).__NUMBRANE_STUDIO__;
        return app.session?.getSetOrchestratorSnapshot?.() ?? null;
      });
      const d = await studioDiag(page);
      expect((d.animationTimeSec ?? 0) >= lastAnim - 0.01, "animation clock regresses").toBe(true);
      lastAnim = d.animationTimeSec ?? lastAnim;
      if (snap?.transition) {
        const morphKey = `${snap.transition.fromSceneId}->${snap.transition.toSceneId}`;
        const p = snap.transition.progress;
        const prev = lastProgressByMorph.get(morphKey);
        if (prev !== undefined) {
          expect(p + 0.001, `morph ${morphKey} regresses at step ${step}`).toBeGreaterThanOrEqual(prev);
        }
        lastProgressByMorph.set(morphKey, p);
      }
      const px = await sampleStagePixels(page);
      expect(frameIsVisible(px), `visible during step ${step}`).toBe(true);
    }

    expect(lastProgressByMorph.size, "at least one morph edge sampled").toBeGreaterThan(0);
  });
});
