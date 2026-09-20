import { test, expect } from "@playwright/test";
import { waitForStudioBoot } from "./studioUi";

test.describe("Studio boot consistency", () => {
  for (const mode of ["generate", "animate", "react"] as const) {
    test(`modebar matches ${mode} at boot`, async ({ page }) => {
      await page.goto(`/studio.html?mode=${mode}&piece=fractals/strange-attractors&seed=42`, {
        waitUntil: "domcontentloaded",
      });
      await waitForStudioBoot(page);
      const active = page.locator(`#modebar button[data-mode="${mode}"]`);
      await expect(active).toHaveClass(/active/);
      for (const other of ["generate", "animate", "react"].filter((m) => m !== mode)) {
        await expect(page.locator(`#modebar button[data-mode="${other}"]`)).not.toHaveClass(/active/);
      }
      const diag = await page.evaluate(() => {
        const app = (window as unknown as {
          __NUMBRANE_STUDIO__?: { mode?: string; getAnimationDiagnostics?: () => Record<string, unknown> };
        }).__NUMBRANE_STUDIO__;
        return {
          mode: app?.mode,
          diagMode: app?.getAnimationDiagnostics?.().mode,
        };
      });
      expect(diag.mode).toBe(mode);
      expect(diag.diagMode).toBe(mode);
    });
  }
});
