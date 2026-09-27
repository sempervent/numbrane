/**
 * Playwright webServer lifecycle — studio boot must be reachable before suites run.
 */

import { test, expect } from "@playwright/test";
import { waitForStudioBoot } from "./studioUi";

test.describe("Studio dev server health", () => {
  test("studio.html boots __NUMBRANE_STUDIO__", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    expect(baseURL).toBeTruthy();
    const res = await page.goto("/studio.html", { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(res?.ok()).toBe(true);
    await waitForStudioBoot(page, 90_000);
    const hasApp = await page.evaluate(
      () => typeof (window as unknown as { __NUMBRANE_STUDIO__?: unknown }).__NUMBRANE_STUDIO__ !== "undefined",
    );
    expect(hasApp).toBe(true);
  });
});
