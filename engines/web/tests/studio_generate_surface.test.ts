import { describe, expect, it } from "vitest";
import { isMashupPiece } from "../src/studio/mashups";
import {
  effectiveGenerateKind,
  generatePreviewClassFor,
  getPieceRuntime,
  isBrowserNativeAnimate,
  PIECE_RUNTIMES,
  resolveGeneratePolicy,
} from "../src/studio/runtime/registry";
import { studioSurface } from "../src/studio/runtime/surface";

describe("GENERATE capability-driven routing", () => {
  it("browser-native ANIMATE pieces use live GENERATE (not python-api surface)", () => {
    for (const [pieceId, runtime] of Object.entries(PIECE_RUNTIMES)) {
      if (!isBrowserNativeAnimate(runtime.animate)) continue;
      expect(studioSurface(pieceId, "generate")).toBe("live");
      expect(generatePreviewClassFor(pieceId)).toBe("interactive");
      expect(effectiveGenerateKind(pieceId)).toBe(runtime.animate);
    }
  });

  it("differential growth uses warmup interactive policy", () => {
    const policy = resolveGeneratePolicy("growth/differential-growth");
    expect(policy.interactive).toBe("warmup");
    expect(policy.warmupSteps).toBeGreaterThan(50);
    expect(studioSurface("growth/differential-growth", "generate")).toBe("live");
  });

  it("mashups remain interactive live GENERATE", () => {
    for (const pieceId of Object.keys(PIECE_RUNTIMES).filter(isMashupPiece)) {
      expect(studioSurface(pieceId, "generate")).toBe("live");
      expect(resolveGeneratePolicy(pieceId).interactive).not.toBe("async");
    }
  });

  it("python-only animate pieces stay async GENERATE", () => {
    for (const [pieceId, runtime] of Object.entries(PIECE_RUNTIMES)) {
      if (isBrowserNativeAnimate(runtime.animate)) continue;
      if (runtime.generate !== "python-api") continue;
      expect(resolveGeneratePolicy(pieceId).interactive).toBe("async");
      expect(studioSurface(pieceId, "generate")).toBe("api-preview");
    }
  });
});
