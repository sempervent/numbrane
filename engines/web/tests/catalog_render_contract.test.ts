/**
 * Fast catalog render contract — registry, aliases, mashup dependencies (no WebGL).
 */

import { describe, expect, it } from "vitest";
import { classifyPixelFrame } from "../src/studio/catalog/renderHealth";
import { collectPieceManifests, studioVisibleManifests } from "../src/studio/catalog/manifestCollection";
import { buildMashupSet, isMashupPiece } from "../src/studio/mashups";
import {
  defaultsForPiece,
  getPieceRuntime,
  PIECE_RUNTIMES,
  resolveGeneratePolicy,
  supportsMode,
} from "../src/studio/runtime/registry";
import { studioSurface } from "../src/studio/runtime/surface";
import { analyzeRgbaGrid } from "../src/live/pixelMetrics";
import { HUMAN_FAILED_SENTINELS } from "../src/studio/catalog/sentinels";

describe("catalog render contract", () => {
  it("every human-failed sentinel is in runtime registry and studio-visible catalog", () => {
    const visible = new Set(studioVisibleManifests(collectPieceManifests()).map((m) => m.piece_id));
    for (const id of HUMAN_FAILED_SENTINELS) {
      expect(PIECE_RUNTIMES[id], id).toBeDefined();
      expect(visible.has(id), `${id} visible in catalog`).toBe(true);
    }
  });

  it("noise landscape canonical and reference alias share shader-native animate backend", () => {
    const canon = getPieceRuntime("landscape/noise-landscape");
    const alias = getPieceRuntime("reference/noise-landscape");
    expect(canon.animate).toBe("shader-native");
    expect(alias.animate).toBe("shader-native");
    expect(studioSurface("landscape/noise-landscape", "generate")).toBe("live");
    expect(studioSurface("reference/noise-landscape", "generate")).toBe("live");
  });

  it("mashups declare child pieces that exist in registry", () => {
    for (const mashupId of Object.keys(PIECE_RUNTIMES).filter(isMashupPiece)) {
      const set = buildMashupSet(mashupId, 42, defaultsForPiece(mashupId));
      expect(set, mashupId).not.toBeNull();
      for (const layer of set!.scenes[0]!.layers) {
        expect(getPieceRuntime(layer.piece).generate, `${mashupId} child ${layer.piece}`).not.toBe(
          "unsupported",
        );
      }
    }
  });

  it("human sentinels advertise live GENERATE where browser-native animate exists", () => {
    for (const id of HUMAN_FAILED_SENTINELS) {
      const rt = getPieceRuntime(id);
      if (rt.animate && rt.animate !== "unsupported" && rt.animate !== "python-api") {
        expect(studioSurface(id, "generate"), id).toBe("live");
        expect(resolveGeneratePolicy(id).interactive).not.toBe("async");
      }
    }
  });

  it("classifyPixelFrame flags flat high-coverage fields as WRONG_OUTPUT", () => {
    const w = 32;
    const h = 32;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      px[o] = 80;
      px[o + 1] = 10;
      px[o + 2] = 10;
      px[o + 3] = 255;
    }
    const frame = analyzeRgbaGrid(px, w, h);
    expect(classifyPixelFrame(frame)).toBe("WRONG_OUTPUT");
  });

  it("supportsMode requires non-unsupported effective backend", () => {
    for (const id of Object.keys(PIECE_RUNTIMES)) {
      if (supportsMode(id, "animate")) {
        expect(getPieceRuntime(id).animate).not.toBeNull();
      }
      if (supportsMode(id, "generate")) {
        expect(studioSurface(id, "generate")).not.toBe("unsupported");
      }
    }
  });
});
