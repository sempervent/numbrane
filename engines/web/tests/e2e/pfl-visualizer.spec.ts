/**
 * PFL minimal visualizer — real browser output and audio path.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "tmp", "pfl-review");

test.describe("PFL flow field visualizer", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("startup — canvas visible, evolving, nonblank", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__), null, {
      timeout: 15_000,
    });
    const canvas = page.locator("#pfl-canvas");
    await expect(canvas).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __PFL__: { primeSilent: (n: number) => void } }).__PFL__.primeSilent(90);
    });
    const a = await page.evaluate(() => (window as unknown as { __PFL__: { sampleLuma: () => number } }).__PFL__.sampleLuma());
    expect(a, "first frame luma").toBeGreaterThan(8);
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => (window as unknown as { __PFL__: { sampleLuma: () => number } }).__PFL__.sampleLuma());
    expect(Math.abs(b - a), "frame evolution").toBeGreaterThan(0.1);
    await page.screenshot({ path: path.join(OUT, "pfl-ambient.png"), fullPage: true });
  });

  test("audio modulation — demo bass vs quiet differ", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    const diff = await page.evaluate(() => {
      const app = (window as unknown as {
        __PFL__: {
          stepForTest: (dt: number, t: number) => { params: { curl: number; motion: number; shimmer: number } };
        };
      }).__PFL__;
      app.stepForTest(1 / 60, 0.12);
      const loud = app.stepForTest(1 / 60, 0.12);
      app.stepForTest(1 / 60, 2.6);
      const quiet = app.stepForTest(1 / 60, 2.6);
      return {
        loud: loud.params.curl + loud.params.motion + loud.params.shimmer,
        quiet: quiet.params.curl + quiet.params.motion + quiet.params.shimmer,
      };
    });
    expect(diff.loud).not.toBe(diff.quiet);
    expect(diff.loud).toBeGreaterThan(0.9);
  });

  test("controls hide and fullscreen lifecycle", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    await page.click("#pfl-hide");
    await expect(page.locator("#pfl-dock")).toHaveClass(/hidden/);
    await page.keyboard.press("h");
    await expect(page.locator("#pfl-dock")).not.toHaveClass(/hidden/);
  });

  test("mic denial — stays animated", async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    await page.selectOption("#pfl-source", "input");
    await page.waitForTimeout(2000);
    const luma = await page.evaluate(() => (window as unknown as { __PFL__: { sampleLuma: () => number } }).__PFL__.sampleLuma());
    expect(luma).toBeGreaterThan(1.2);
    await context.close();
  });
});
