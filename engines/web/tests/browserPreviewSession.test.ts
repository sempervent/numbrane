import { describe, expect, it } from "vitest";
import {
  singlePieceAnimateSet,
  usesLiveBrowserPreview,
} from "../src/studio/performance/browserPreviewSession";
import { PERFORMANCE_CATALOG } from "../src/studio/performance/catalog";
import { supportsMode } from "../src/studio/runtime/registry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("browser preview session helpers", () => {
  it("live preview path for geometry and shader pieces", () => {
    expect(usesLiveBrowserPreview("geometry/metatron")).toBe(true);
    expect(usesLiveBrowserPreview("fractals/sdf-raymarch2d")).toBe(true);
  });

  it("singlePieceAnimateSet builds mashup or simple layer", () => {
    const set = singlePieceAnimateSet("geometry/metatron", 42, { density: 0.7 });
    expect(set.scenes[0]?.layers[0]?.piece).toBe("geometry/metatron");
  });
});

describe("PFL pack fixtures", () => {
  const root = resolve(import.meta.dirname, "../../..");

  it("episode 1 pack references animate-capable pieces", () => {
    const raw = readFileSync(
      resolve(root, "pieces/pfl/episode-1-visual-set/pack.json"),
      "utf8",
    );
    const pack = JSON.parse(raw) as { items: { pieceId: string }[] };
    for (const item of pack.items) {
      expect(supportsMode(item.pieceId, "animate"), item.pieceId).toBe(true);
    }
  });

  it("midnight pack references animate-capable pieces", () => {
    const raw = readFileSync(resolve(root, "pieces/pfl/midnight-pfl-pack/pack.json"), "utf8");
    const pack = JSON.parse(raw) as { items: { pieceId: string }[] };
    for (const item of pack.items) {
      expect(supportsMode(item.pieceId, "animate"), item.pieceId).toBe(true);
    }
  });

  it("curated catalog entries have preview metadata", () => {
    const curated = PERFORMANCE_CATALOG.filter((m) => m.tier === "showcase" || m.tier === "curated");
    expect(curated.length).toBeGreaterThanOrEqual(10);
    for (const m of curated) {
      expect(m.previewSeed).toBeGreaterThan(0);
      expect(m.character.length).toBeGreaterThan(4);
    }
  });
});
