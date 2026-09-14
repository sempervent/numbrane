import { describe, expect, it } from "vitest";
import { runSmoke } from "./live_smoke";
import { pieceMode, LIVE_PIECE_IDS } from "../src/live/pieces/pieceModes";

describe("live smoke performance", () => {
  it("runs 45s deterministic smoke across PFL scenes", () => {
    const r = runSmoke(45);
    expect(r.scenesVisited.length).toBeGreaterThan(1);
    expect(r.digest).toMatch(/^[0-9a-f]{8}$/);
    expect(r.scenesVisited).toContain("void");
  });

  it("maps required live piece families", () => {
    const required = [
      "geometry/seed-of-life",
      "geometry/metatron",
      "geometry/circle-packing",
      "fields/flow-hatching",
      "particles/noodles",
      "growth/differential-growth",
      "reaction-diffusion/reaction-diffusion",
      "fractals/escape-time",
      "fractals/strange-attractors",
      "tiling/truchet-tiles",
      "flagship/latticefall",
    ];
    for (const id of required) {
      expect(LIVE_PIECE_IDS).toContain(id);
      expect(typeof pieceMode(id)).toBe("number");
    }
  });
});
