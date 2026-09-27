import { describe, expect, it } from "vitest";
import { isMashupPiece } from "../src/studio/mashups";
import {
  generatePreviewClassFor,
  getPieceRuntime,
  PIECE_RUNTIMES,
} from "../src/studio/runtime/registry";
import { studioSurface } from "../src/studio/runtime/surface";

describe("GENERATE interactive preview routing", () => {
  it("mashups use live browser surface for GENERATE (not python-api)", () => {
    for (const pieceId of Object.keys(PIECE_RUNTIMES).filter(isMashupPiece)) {
      expect(studioSurface(pieceId, "generate")).toBe("live");
      expect(generatePreviewClassFor(pieceId)).toBe("interactive");
      expect(getPieceRuntime(pieceId).generate).not.toBe("python-api");
    }
  });

  it("attractor-calligraphy matches animate backend for generate", () => {
    const r = getPieceRuntime("mashups/attractor-calligraphy");
    expect(r.generate).toBe("shader-native");
    expect(r.animate).toBe("shader-native");
  });
});
