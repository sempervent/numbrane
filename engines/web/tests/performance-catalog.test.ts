import { describe, expect, it } from "vitest";
import {
  filterPerformanceCatalog,
  MIDNIGHT_ROLES,
  PFL_EPISODE_1_FLOW,
  PERFORMANCE_CATALOG,
  performanceMeta,
} from "../src/studio/performance/catalog";
import type { PieceInfo } from "../src/studio/catalog";

function mockPieces(): PieceInfo[] {
  return PERFORMANCE_CATALOG.map((m) => ({
    piece_id: m.pieceId,
    capabilities: { animated: true, still: true, realtime: true },
  }));
}

describe("performance catalog", () => {
  it("curated filter returns showcase and curated tiers only", () => {
    const list = filterPerformanceCatalog(mockPieces(), "curated", []);
    expect(list.length).toBeGreaterThanOrEqual(10);
    expect(list.every((p) => p.piece_id.includes("/"))).toBe(true);
  });

  it("midnight filter lists midnight-role pieces", () => {
    const list = filterPerformanceCatalog(mockPieces(), "midnight", []);
    const ids = list.map((p) => p.piece_id);
    expect(ids).toContain("fractals/sdf-raymarch2d");
    expect(ids).toContain("geometry/metatron");
  });

  it("episode 1 flow and midnight roles are populated", () => {
    expect(PFL_EPISODE_1_FLOW.length).toBeGreaterThanOrEqual(10);
    expect(MIDNIGHT_ROLES.length).toBeGreaterThanOrEqual(5);
    for (const step of PFL_EPISODE_1_FLOW) {
      expect(performanceMeta(step.pieceId), step.pieceId).toBeDefined();
    }
  });
});
