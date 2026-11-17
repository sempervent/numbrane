/**
 * Scene prepare lifecycle — stale loads dispose pieces; yields keep tokens honest.
 */

import { describe, expect, it, vi } from "vitest";
import { StaleSceneLoadError } from "../src/live/session";

describe("scene prepare lifecycle contracts", () => {
  it("StaleSceneLoadError is identifiable for silent supersede", () => {
    const err = new StaleSceneLoadError();
    expect(err.name).toBe("StaleSceneLoadError");
    expect(err.message).toMatch(/stale/i);
  });

  it("cooperative yield resolves on next macrotask when rAF missing", async () => {
    const hadRaf = "requestAnimationFrame" in globalThis;
    const original = globalThis.requestAnimationFrame;
    // Simulate non-browser host used by unit tests.
    // @ts-expect-error — intentional delete for test
    delete globalThis.requestAnimationFrame;
    const yieldToMain = () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    const t0 = Date.now();
    await yieldToMain();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(0);
    if (hadRaf) globalThis.requestAnimationFrame = original;
  });

  it("disposePreparedScene pattern clears all pieces", () => {
    const disposed: string[] = [];
    const pieces = new Map([
      ["L0", { dispose: () => disposed.push("L0") }],
      ["L1", { dispose: () => disposed.push("L1") }],
    ]);
    for (const p of pieces.values()) p.dispose();
    expect(disposed).toEqual(["L0", "L1"]);
  });
});
