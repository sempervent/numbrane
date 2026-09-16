import { describe, expect, it } from "vitest";
import {
  catalogPieceIds,
  getPieceRuntime,
  isBrowserNativeAnimate,
} from "../src/studio/runtime/registry";

describe("Studio catalog ANIMATE backends", () => {
  it("every maintained catalog piece uses a browser-native animate backend", () => {
    const ids = catalogPieceIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const pieceId of ids) {
      const rt = getPieceRuntime(pieceId);
      expect(rt.animate, `${pieceId} animate`).not.toBeNull();
      expect(rt.animate, `${pieceId} animate`).not.toBe("python-api");
      expect(isBrowserNativeAnimate(rt.animate), `${pieceId} backend ${rt.animate}`).toBe(true);
    }
  });
});
