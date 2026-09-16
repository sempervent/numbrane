import { describe, expect, it } from "vitest";
import { resolveAllStudioDescriptors } from "../src/studio/descriptor/catalogAudit";

describe("Studio catalog ANIMATE backends", () => {
  it("every visible catalog piece uses a browser-native animate backend", () => {
    const descriptors = resolveAllStudioDescriptors();
    expect(descriptors.length).toBe(31);
    for (const d of descriptors) {
      expect(d.animate.supported, `${d.pieceId} animate`).toBe(true);
      expect(d.animate.backend, `${d.pieceId} backend`).not.toBeNull();
      expect(d.animate.backend, `${d.pieceId} python-api`).not.toBe("python-api");
    }
  });
});
