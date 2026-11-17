/**
 * Multi-artwork selector, switching, and visual separation.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "tmp", "pfl-review");
const TYPES = ["flow-field", "fractal-morph", "block-lattice"] as const;
const SEEDS = [424242, 90210, 314159];

test.describe("PFL artwork types", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("each type renders visible artwork without audio", async ({ page }) => {
    for (const type of TYPES) {
      await page.goto(`/pfl.html?type=${type}&seed=424242`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
      const m = await page.evaluate(() => {
        const app = (
          window as unknown as {
            __PFL__: { primeSilent: (n: number) => void; normalizedP99: () => number };
          }
        ).__PFL__;
        app.primeSilent(45);
        return app.normalizedP99();
      });
      expect(m, `p99 for ${type}`).toBeGreaterThan(0.12);
      await page.locator("#pfl-canvas").screenshot({
        path: path.join(OUT, `type-${type}-default.png`),
      });
    }
  });

  test("switching types preserves seed and shows distinct digests", async ({ page }) => {
    await page.goto("/pfl.html?seed=424242", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    const digests: string[] = [];
    for (const type of TYPES) {
      const d = await page.evaluate((t) => {
        const app = (
          window as unknown as {
            __PFL__: {
              setArtworkType: (t: string) => void;
              primeSilent: (n: number) => void;
              sampleLumaReport: () => { digest: string };
              getArtworkType: () => string;
            };
          }
        ).__PFL__;
        app.setArtworkType(t);
        app.primeSilent(40);
        return { digest: app.sampleLumaReport().digest, type: app.getArtworkType() };
      }, type);
      expect(d.type).toBe(type);
      digests.push(d.digest);
    }
    expect(new Set(digests).size).toBe(TYPES.length);
  });

  test("variation stays within type; selector changes type only", async ({ page }) => {
    await page.goto("/pfl.html?type=fractal-morph&seed=424242", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    await page.click("#pfl-seed");
    const afterVar = await page.evaluate(() => {
      const app = (
        window as unknown as { __PFL__: { getArtworkType: () => string; getSeed: () => number } }
      ).__PFL__;
      return { type: app.getArtworkType(), seed: app.getSeed() };
    });
    expect(afterVar.type).toBe("fractal-morph");
    expect(afterVar.seed).not.toBe(424242);

    await page.selectOption("#pfl-artwork-type", "block-lattice");
    const afterSwitch = await page.evaluate(() => {
      const app = (
        window as unknown as { __PFL__: { getArtworkType: () => string; getSeed: () => number } }
      ).__PFL__;
      return { type: app.getArtworkType(), seed: app.getSeed() };
    });
    expect(afterSwitch.type).toBe("block-lattice");
    expect(afterSwitch.seed).toBe(afterVar.seed);
  });

  test("multi-type variation contact sheet", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    for (const type of TYPES) {
      await page.selectOption("#pfl-artwork-type", type);
      for (const seed of SEEDS) {
        await page.evaluate(
          ({ t, s }) => {
            const app = (
              window as unknown as {
                __PFL__: {
                  setArtworkType: (t: string) => void;
                  applyVariation: (s: number) => void;
                  primeSilent: (n: number) => void;
                };
              }
            ).__PFL__;
            app.setArtworkType(t);
            app.applyVariation(s);
            app.primeSilent(35);
          },
          { t: type, s: seed },
        );
        await page.locator("#pfl-canvas").screenshot({
          path: path.join(OUT, `contact-${type}-seed-${seed}.png`),
        });
      }
    }
  });

  test("rapid switching does not break animation loop", async ({ page }) => {
    await page.goto("/pfl.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PFL__?: unknown }).__PFL__));
    for (let i = 0; i < 8; i++) {
      await page.selectOption("#pfl-artwork-type", TYPES[i % TYPES.length]!);
      await page.waitForTimeout(80);
    }
    const frame = await page.evaluate(() => {
      const app = (
        window as unknown as { __PFL__: { getLogicalFrame: () => number; normalizedP99: () => number } }
      ).__PFL__;
      app;
      const a = (window as unknown as { __PFL__: { getLogicalFrame: () => number } }).__PFL__;
      return a.getLogicalFrame();
    });
    expect(frame).toBeGreaterThan(5);
  });
});
