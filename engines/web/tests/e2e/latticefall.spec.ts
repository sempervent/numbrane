/**
 * Playwright browser tests for LATTICEFALL.
 *
 * Proves: app boot, WebGL2, shader compile/link, WASM load, deterministic replay digests.
 * Does NOT claim cross-GPU pixel identity.
 *
 * CI may use Chromium + SwiftShader / ANGLE software GL:
 *   PW_CHROMIUM_ARGS=--use-angle=swiftshader
 */

import { expect, test } from "@playwright/test";

test.describe("LATTICEFALL browser", () => {
  test("boots, compiles shaders, loads WASM, replay digests match", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/latticefall.html?headless=1&frames=0", {
      waitUntil: "networkidle",
    });

    await page.waitForFunction(
      () => Boolean((window as unknown as { __LATTICEFALL__?: unknown }).__LATTICEFALL__),
      null,
      { timeout: 60_000 },
    );

    const status = await page.evaluate(() => {
      const h = (window as unknown as { __LATTICEFALL__: { status: () => unknown } })
        .__LATTICEFALL__;
      return h.status();
    });

    expect(status, `page errors: ${errors.join("; ")}`).toMatchObject({
      wasmReady: true,
      shadersReady: true,
      webgl2: true,
    });
    expect(status.error).toBeNull();

    const session = {
      protocol_version: "0.1.0",
      seed: 42,
      fps: 60,
      events: [
        {
          type: "pointer.down",
          frame: 10,
          pointer: { x: 0.2, y: -0.1, space: "cartesian-2d" },
        },
        {
          type: "pointer.move",
          frame: 30,
          pointer: { x: -0.3, y: 0.4, space: "cartesian-2d" },
        },
        {
          type: "pointer.up",
          frame: 40,
          pointer: { x: -0.3, y: 0.4, space: "cartesian-2d" },
        },
        {
          type: "parameter.change",
          frame: 50,
          parameter: { path: "chaos", value: 0.55 },
        },
      ],
    };

    const digestsA = await page.evaluate(async (json) => {
      const h = (
        window as unknown as {
          __LATTICEFALL__: {
            resetAndReplay: (j: string) => Record<number, string>;
          };
        }
      ).__LATTICEFALL__;
      return h.resetAndReplay(json);
    }, JSON.stringify(session));

    // Reload and replay again
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __LATTICEFALL__?: unknown }).__LATTICEFALL__),
      null,
      { timeout: 60_000 },
    );

    const digestsB = await page.evaluate(async (json) => {
      const h = (
        window as unknown as {
          __LATTICEFALL__: {
            resetAndReplay: (j: string) => Record<number, string>;
          };
        }
      ).__LATTICEFALL__;
      return h.resetAndReplay(json);
    }, JSON.stringify(session));

    expect(digestsA).toEqual(digestsB);
    expect(Object.keys(digestsA).length).toBeGreaterThanOrEqual(3);

    // Advance live steps and confirm digest string shape
    const dig = await page.evaluate(() => {
      const h = (
        window as unknown as { __LATTICEFALL__: { step: (n?: number) => string } }
      ).__LATTICEFALL__;
      return h.step(5);
    });
    expect(dig).toMatch(/^[0-9a-f]{16}$/);
  });
});
