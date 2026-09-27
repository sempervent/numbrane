/**
 * STUDIO_VISIBLE_RENDER_RECOVERY — run after every product change.
 * Human-visible Generate/Animate on representative renderer classes.
 */

import { test } from "@playwright/test";
import {
  clickStudioMode,
  openStudioHome,
  selectPieceInConfig,
  waitForStudioSceneSettled,
} from "./studioUi";
import { assertStageMeaningfullyPresent } from "./studioVisiblePresent";

const GATE: Array<{ piece: string; mode?: "generate" | "animate" }> = [
  { piece: "tiling/truchet-tiles", mode: "generate" },
  { piece: "tiling/truchet-tiles", mode: "animate" },
  { piece: "growth/differential-growth", mode: "generate" },
  { piece: "growth/differential-growth", mode: "animate" },
  { piece: "fractals/escape-time", mode: "generate" },
  { piece: "fractals/escape-time", mode: "animate" },
  { piece: "mashups/attractor-calligraphy", mode: "generate" },
  { piece: "mashups/attractor-calligraphy", mode: "animate" },
  { piece: "flagship/latticefall", mode: "generate" },
  { piece: "flagship/latticefall", mode: "animate" },
];

test.describe.configure({ mode: "serial" });

test.describe("STUDIO_VISIBLE_RENDER_RECOVERY gate", () => {
  for (const { piece, mode } of GATE) {
    test(`${mode ?? "generate"} · ${piece}`, async ({ page }) => {
      test.setTimeout(240_000);
      await openStudioHome(page);
      await selectPieceInConfig(page, piece);
      await clickStudioMode(page, mode ?? "generate");
      await waitForStudioSceneSettled(page, 180_000);
      if ((mode ?? "generate") === "generate") {
        await page.waitForFunction(
          () =>
            !(window as unknown as { __NUMBRANE_STUDIO__?: { generating?: boolean } })
              .__NUMBRANE_STUDIO__?.generating,
          null,
          { timeout: 180_000 },
        );
      }
      await assertStageMeaningfullyPresent(page, {
        pieceId: piece,
        mode: mode ?? "generate",
      });
    });
  }
});
