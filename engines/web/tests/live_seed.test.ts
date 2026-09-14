import { describe, expect, it } from "vitest";
import { pieceMode, pieceSubmode } from "../src/live/pieces/pieceModes";
import { applySeedToParams, seedArtifactBaseUrl } from "../src/live/seedLoad";
import { parseNpyFloat32 } from "../src/live/npy";

describe("live piece routing", () => {
  it("assigns distinct submodes within families", () => {
    expect(pieceMode("geometry/metatron")).toBe(0);
    expect(pieceSubmode("geometry/metatron")).toBe(1);
    expect(pieceSubmode("geometry/seed-of-life")).toBe(0);
    expect(pieceSubmode("geometry/circle-packing")).toBe(2);
    expect(pieceSubmode("growth/slime-mold")).toBe(2);
    expect(pieceSubmode("mashups/slime-on-sdf")).toBe(4);
  });
});

describe("seed load helpers", () => {
  it("maps recipe params and base url", () => {
    const mapped = applySeedToParams({
      piece_id: "reaction-diffusion/reaction-diffusion",
      seed: 42,
      frame: 10,
      recipe: { parameters: { f: 0.04, density: 0.8 } },
    });
    expect(mapped.seed).toBe(42);
    expect(mapped.f).toBe(0.04);
    expect(seedArtifactBaseUrl("http://x/seeds/a/manifest.json")).toBe("http://x/seeds/a/");
  });
});

describe("npy float32", () => {
  it("parses a minimal float32 vector", () => {
    // Build a tiny npy v1 buffer for shape (2,) float32 little-endian
    const magic = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
    const header =
      "{'descr': '<f4', 'fortran_order': False, 'shape': (2,), }";
    const pad = " ".repeat((16 - ((10 + header.length) % 16)) % 16) + "\n";
    const headerBytes = new TextEncoder().encode(header + pad);
    const headerLen = new Uint8Array(2);
    new DataView(headerLen.buffer).setUint16(0, headerBytes.length, true);
    const data = new Float32Array([1.5, 2.5]);
    const buf = new Uint8Array(10 + headerBytes.length + data.byteLength);
    buf.set(magic, 0);
    buf.set(headerLen, 8);
    buf.set(headerBytes, 10);
    buf.set(new Uint8Array(data.buffer), 10 + headerBytes.length);
    const parsed = parseNpyFloat32(buf.buffer);
    expect(parsed.shape).toEqual([2]);
    expect([...parsed.data.slice(0, 2)]).toEqual([1.5, 2.5]);
  });
});
