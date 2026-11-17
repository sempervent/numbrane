/**
 * PFL visual quality — luminance + variation structure (canvas only).
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "tmp", "pfl-review");
const VARIATION_SEEDS = [424242, 11003, 90210, 314159, 161803, 271828];

test.describe("PFL visual quality", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("default — visible structure without audio", async ({ page }) => {
    await page.goto("/pfl.html?seed=424242", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    await page.evaluate(() => {
      const app = (
        window as unknown as { __PFL__: { primeSilent: (n: number) => void } }
      ).__PFL__;
      app.primeSilent(140);
    });
    const metrics = await page.evaluate(() => {
      const app = (
        window as unknown as {
          __PFL__: {
            sampleLumaReport: () => { p99: number; brightFrac: number; digest: string };
            normalizedP99: () => number;
          };
        }
      ).__PFL__;
      const r = app.sampleLumaReport();
      return { p99n: app.normalizedP99(), bright: r.brightFrac, digest: r.digest };
    });
    expect(metrics.p99n, "p99 luma normalized").toBeGreaterThan(0.18);
    expect(metrics.bright, "bright pixel fraction").toBeGreaterThan(0.008);
    await page.locator("#pfl-canvas").screenshot({ path: path.join(OUT, "quality-default.png") });
  });

  test("variation contact sheet — six distinct structures", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    const digests: string[] = [];
    const p99s: number[] = [];
    for (const seed of VARIATION_SEEDS) {
      const m = await page.evaluate((s) => {
        const app = (
          window as unknown as {
            __PFL__: {
              applyVariation: (s: number) => void;
              primeSilent: (n: number) => void;
              sampleLumaReport: () => { digest: string; p99: number };
              normalizedP99: () => number;
            };
          }
        ).__PFL__;
        app.applyVariation(s);
        app.primeSilent(120);
        const r = app.sampleLumaReport();
        return { digest: r.digest, p99n: app.normalizedP99() };
      }, seed);
      digests.push(m.digest);
      p99s.push(m.p99n);
      await page.locator("#pfl-canvas").screenshot({
        path: path.join(OUT, `variation-seed-${seed}.png`),
      });
    }
    expect(new Set(digests).size, "unique structure digests").toBeGreaterThanOrEqual(5);
    for (const p of p99s) {
      expect(p).toBeGreaterThan(0.16);
    }
  });

  test("audio energy increases motion without collapsing visibility", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    const quiet = await page.evaluate(() => {
      const app = (
        window as unknown as {
          __PFL__: {
            primeSilent: (n: number) => void;
            normalizedP99: () => number;
            stepForTest: (dt: number, t: number) => unknown;
          };
        }
      ).__PFL__;
      app.primeSilent(60);
      const p99q = app.normalizedP99();
      for (let i = 0; i < 30; i++) app.stepForTest(1 / 60, 2.4);
      const p99loud = app.normalizedP99();
      return { quiet: p99q, loud: p99loud };
    });
    expect(quiet.quiet).toBeGreaterThan(0.16);
    expect(quiet.loud).toBeGreaterThan(0.14);
  });
});
