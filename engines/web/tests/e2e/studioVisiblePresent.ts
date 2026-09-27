/**
 * User-visible Studio stage readiness — same surface humans see (#stage / #generate-preview).
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { frameHasMeaningfulStructure, type PixelFrame } from "../../src/live/pixelMetrics";
import { failureBannerText } from "./studioUi";

export type StagePresentSnapshot = {
  pieceId: string;
  mode: string;
  surface: string;
  sceneGeneration: number;
  committedSceneGeneration: number;
  presentSceneGeneration: number;
  presentEpoch: number;
  presentEpochAtCommit: number;
  sceneApplyPhase: string;
  generateFrozen: boolean;
  hiddenLive: boolean;
  previewVisible: boolean;
  px: PixelFrame | null;
  digest: string;
};

export async function readStagePresentSnapshot(page: Page): Promise<StagePresentSnapshot> {
  return page.evaluate(() => {
    const app = (
      window as unknown as {
        __NUMBRANE_STUDIO__?: {
          pieceId?: string;
          mode?: string;
          getAnimationDiagnostics?: () => Record<string, unknown>;
          getStudioConsistencySnapshot?: () => {
            sceneGeneration?: number;
            committedSceneGeneration?: number;
          };
          samplePresentedPixels?: () => PixelFrame | null;
        };
      }
    ).__NUMBRANE_STUDIO__;
    const diag = app?.getAnimationDiagnostics?.() ?? {};
    const snap = app?.getStudioConsistencySnapshot?.() ?? {};
    const canvas = document.getElementById("stage");
    const preview = document.getElementById("generate-preview");
    let px: PixelFrame | null = null;
    try {
      px = app?.samplePresentedPixels?.(64, 36) ?? null;
    } catch {
      px = null;
    }
    return {
      pieceId: app?.pieceId ?? "",
      mode: String(diag.mode ?? app?.mode ?? ""),
      surface: String(diag.surface ?? ""),
      sceneGeneration: snap.sceneGeneration ?? 0,
      committedSceneGeneration: snap.committedSceneGeneration ?? 0,
      presentSceneGeneration: Number(diag.presentSceneGeneration ?? 0),
      presentEpoch: Number(diag.presentEpoch ?? 0),
      presentEpochAtCommit: Number(diag.presentEpochAtCommit ?? 0),
      sceneApplyPhase: String(diag.sceneApplyPhase ?? ""),
      generateFrozen: Boolean(diag.generatePresentationFrozen),
      hiddenLive: canvas?.classList.contains("hidden-live") ?? false,
      previewVisible: preview?.classList.contains("visible") ?? false,
      px,
      digest: String(diag.pixelDigest ?? px?.digest ?? ""),
    };
  });
}

/** Stage shows meaningful structure for the requested piece and current scene generation. */
export async function assertStageMeaningfullyPresent(
  page: Page,
  opts: { pieceId: string; mode?: "generate" | "animate"; minPresentGeneration?: number },
): Promise<StagePresentSnapshot> {
  const banner = await failureBannerText(page);
  expect(banner, "failure banner visible").toBeNull();

  const snap = await readStagePresentSnapshot(page);
  expect(snap.pieceId, "piece id").toBe(opts.pieceId);
  if (opts.mode) expect(snap.mode, "mode").toBe(opts.mode);
  expect(snap.sceneGeneration, "scene generation active").toBeGreaterThan(0);
  expect(snap.committedSceneGeneration, "scene settled").toBe(snap.sceneGeneration);
  expect(snap.presentSceneGeneration, "present tied to scene generation").toBe(snap.sceneGeneration);
  expect(snap.presentSceneGeneration, "meaningful present recorded").toBeGreaterThan(0);
  if (snap.surface === "live") {
    expect(snap.presentEpochAtCommit, "present epoch").toBe(snap.presentEpoch);
  }

  if (snap.surface === "live") {
    expect(snap.hiddenLive, "live canvas visible").toBe(false);
  } else if (snap.surface === "api-preview") {
    expect(snap.previewVisible, "generate preview visible").toBe(true);
  }

  expect(snap.px, "pixel sample").not.toBeNull();
  expect(frameHasMeaningfulStructure(snap.px!), "meaningful structure on stage").toBe(true);
  return snap;
}

/** Human-visible frame must remain after delay (catches stopLoop / back-buffer loss). */
export async function assertStageStableForMs(
  page: Page,
  pieceId: string,
  holdMs: number,
): Promise<void> {
  const a = await assertStageMeaningfullyPresent(page, { pieceId });
  await page.waitForTimeout(holdMs);
  const b = await assertStageMeaningfullyPresent(page, { pieceId });
  expect(b.digest, "digest stable after hold").toBe(a.digest);
}
