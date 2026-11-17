import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearShaderSourceCache,
  loadShader,
  shaderSourceCacheSize,
} from "../src/gl";

describe("loadShader source cache", () => {
  afterEach(() => {
    clearShaderSourceCache();
    vi.unstubAllGlobals();
  });

  it("fetches once per filename and reuses the promise", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "precision mediump float;",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      loadShader("live_blend.frag"),
      loadShader("live_blend.frag"),
    ]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shaderSourceCacheSize()).toBe(1);

    const c = await loadShader("live_blend.frag");
    expect(c).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts failed fetches so retries can succeed", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      if (n === 1) return { ok: false, text: async () => "" };
      return { ok: true, text: async () => "ok" };
    }));

    await expect(loadShader("missing.frag")).rejects.toThrow(/Failed to load shader/);
    expect(shaderSourceCacheSize()).toBe(0);
    await expect(loadShader("missing.frag")).resolves.toBe("ok");
    expect(shaderSourceCacheSize()).toBe(1);
  });
});
