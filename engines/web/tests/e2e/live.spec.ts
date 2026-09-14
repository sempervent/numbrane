import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test.describe("NUMBRANE LIVE e2e", () => {
  test("audio-first: boots with no MIDI and no audio permission", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));
    const scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).toBe("void");
    const audioStatus = await page.evaluate(
      () => window.__NUMBRANE_LIVE__!.session.audio.statusMessage,
    );
    expect(audioStatus).toBe("No audio input");
    // MIDI must not be required — enableMidi is never auto-called
    const midiDevices = await page.evaluate(() =>
      window.__NUMBRANE_LIVE__!.session.midi.listDevices(),
    );
    expect(Array.isArray(midiDevices)).toBe(true);
    // UI prioritizes Audio section
    await expect(page.getByRole("heading", { name: "Audio" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enable microphone/i })).toBeVisible();
    await expect(page.getByText("Optional external control (MIDI)")).toBeVisible();
    const digest1 = await page.evaluate(() => window.__NUMBRANE_LIVE__!.digest());
    expect(digest1).toMatch(/^[0-9a-f]{8}$/);
  });

  test("synthetic mic features modulate and scenes navigate without MIDI", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));

    const before = await page.evaluate(() => window.__NUMBRANE_LIVE__!.digest());
    await page.evaluate(() => {
      window.__NUMBRANE_LIVE__!.injectFeatures({
        energy: 0.85,
        peak: 0.9,
        low: 0.7,
        mid: 0.4,
        high: 0.2,
        centroid: 0.35,
        flux: 0.6,
        onset: true,
        rolloff: 0.4,
        zcr: 0.1,
      });
      for (let i = 0; i < 10; i++) {
        window.__NUMBRANE_LIVE__!.session.frame(performance.now() + i * 16);
      }
    });
    const after = await page.evaluate(() => window.__NUMBRANE_LIVE__!.digest());
    expect(after).not.toBe(before);

    await page.evaluate(() => window.__NUMBRANE_LIVE__!.gotoScene("signal"));
    await page.waitForTimeout(150);
    let scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).toBe("signal");

    await page.evaluate(() => window.__NUMBRANE_LIVE__!.gotoScene("bloom"));
    scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).toBe("bloom");

    await page.evaluate(() => window.__NUMBRANE_LIVE__!.blackout(true));
    expect(await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.isBlackout())).toBe(
      true,
    );
    await page.evaluate(() => window.__NUMBRANE_LIVE__!.panic());
    expect(await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.isBlackout())).toBe(
      false,
    );
  });

  test("optional MIDI still works when injected", async ({ page }) => {
    await page.goto("/live.html?set=pfl-default");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));
    await page.evaluate(() => window.__NUMBRANE_LIVE__!.gotoScene("signal"));
    // Set cue notes are bound at boot; no Web MIDI device required for injectMidi
    await page.evaluate(() => window.__NUMBRANE_LIVE__!.injectMidi([0x90, 60, 100]));
    await page.waitForTimeout(300);
    const scene = await page.evaluate(() => window.__NUMBRANE_LIVE__!.session.runtime.getScene()?.id);
    expect(scene).not.toBe("signal");
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

  test("OBS output has no chrome and no MIDI/audio UI dependency", async ({ page }) => {
    await page.goto("/live-output.html?set=pfl-default&alpha=1&output=1");
    await page.waitForFunction(() => Boolean(window.__NUMBRANE_LIVE__));
    const hudDisplay = await page
      .locator("body > #hud")
      .evaluate((n) => getComputedStyle(n).display);
    expect(hudDisplay).toBe("none");
    await expect(page.locator("#stage")).toBeVisible();
    const hasChrome = await page.evaluate(() =>
      Boolean(document.body.innerText.includes("Enable microphone")),
    );
    expect(hasChrome).toBe(false);
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
