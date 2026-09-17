import { describe, expect, it } from "vitest";
import { frameBlobDigest } from "../src/studio/export/runtimeExport";

function pngBlob(r: number, g: number, b: number): Blob {
  // Minimal valid 1×1 PNG (precomputed structure with variable IDAT would be heavy).
  // Use synthetic bytes — digest must differ for distinct payloads.
  const buf = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, r, g, b, 0]);
  return new Blob([buf], { type: "image/png" });
}

describe("animation export frame variation", () => {
  it("frame digests differ for distinct PNG payloads", async () => {
    const d0 = await frameBlobDigest(pngBlob(10, 10, 10));
    const d5 = await frameBlobDigest(pngBlob(40, 20, 80));
    const d10 = await frameBlobDigest(pngBlob(200, 30, 30));
    expect(d0).not.toBe(d5);
    expect(d5).not.toBe(d10);
  });

  it("identical payloads produce identical digests (regression guard)", async () => {
    const a = pngBlob(1, 2, 3);
    const b = pngBlob(1, 2, 3);
    expect(await frameBlobDigest(a)).toBe(await frameBlobDigest(b));
  });
});
