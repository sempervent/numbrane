import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test.describe("NUMBRANE LIVE e2e", () => {
  test("loads PFL set without MIDI/audio permissions", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));
    const scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).toBe("void");
    const digest1 = await page.evaluate(() => window.__NUMBRANE_LIVE__!.digest());
    expect(digest1).toMatch(/^[0-9a-f]{8}$/);
  });

  test("scene switch, blackout, panic, synthetic audio + MIDI", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));

    await page.evaluate(() => {
      window.__NUMBRANE_LIVE__!.injectFeatures({
        energy: 0.7,
        peak: 0.8,
        low: 0.6,
        mid: 0.4,
        high: 0.2,
        centroid: 0.3,
        flux: 0.5,
        onset: true,
        rolloff: 0.4,
        zcr: 0.1,
      });
    });

    await page.evaluate(() => window.__NUMBRANE_LIVE__!.gotoScene("signal"));
    await page.waitForTimeout(200);
    let scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).toBe("signal");

    // Note 60 → cue next (from set)
    await page.evaluate(() => window.__NUMBRANE_LIVE__!.injectMidi([0x90, 60, 100]));
    await page.waitForTimeout(300);
    scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).not.toBe("signal");

    await page.evaluate(() => window.__NUMBRANE_LIVE__!.blackout(true));
    expect(await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.isBlackout())).toBe(
      true,
    );
    await page.evaluate(() => window.__NUMBRANE_LIVE__!.panic());
    expect(await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.isBlackout())).toBe(
      false,
    );
  });

  test("record and replay performance digest", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));

    await page.evaluate(() => {
      const live = window.__NUMBRANE_LIVE__!;
      live.session.toggleRecord();
      for (let i = 0; i < 30; i++) {
        live.injectFeatures({
          energy: 0.3 + (i % 10) * 0.05,
          peak: 0.4,
          low: 0.5,
          mid: 0.3,
          high: 0.2,
          centroid: 0.35,
          flux: i % 8 === 0 ? 0.9 : 0.1,
          onset: i % 8 === 0,
          rolloff: 0.4,
          zcr: 0.1,
        });
        live.session.frame(performance.now() + i * 16);
      }
      live.gotoScene("bloom");
      live.session.frame(performance.now() + 500);
    });

    const json = await page.evaluate(() => window.__NUMBRANE_LIVE__!.exportRecording());
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed.features.length).toBeGreaterThan(0);

    await page.evaluate((raw) => {
      window.__NUMBRANE_LIVE__!.loadRecording(raw);
    }, json!);
    await page.waitForTimeout(100);
    const digest = await page.evaluate(() => window.__NUMBRANE_LIVE__!.digest());
    expect(digest).toMatch(/^[0-9a-f]{8}$/);
  });

  test("OBS output route has no chrome", async ({ page }) => {
    await page.goto("/live-output.html?set=pfl-default&alpha=1");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));
    const hudDisplay = await page.locator("#hud").evaluate((n) => getComputedStyle(n).display);
    expect(hudDisplay).toBe("none");
    await expect(page.locator("#stage")).toBeVisible();
  });

  test("live shaders reachable", async ({ page }) => {
    for (const name of ["live_piece.frag", "live_blend.frag", "live_post.frag", "live_quad.vert"]) {
      const res = await page.request.get(`/shaders/${name}`);
      expect(res.ok()).toBeTruthy();
    }
    const setRes = await page.request.get("/sets/pfl-default.json");
    expect(setRes.ok()).toBeTruthy();
    const set = JSON.parse(readFileSync(resolve(root, "pieces/live/pfl-default/set.json"), "utf8"));
    expect(set.set_id).toBe("pfl-default");
  });
});
