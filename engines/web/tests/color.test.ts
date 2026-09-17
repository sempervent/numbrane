import { describe, expect, it } from "vitest";
import { defaultColorConfig, normalizeColorConfig, parseHexColor } from "../src/studio/color/model";
import { buildLutRGBA8 } from "../src/studio/color/lut";
import { colorToRecipeParams } from "../src/studio/color/serialize";

describe("color model", () => {
  it("round-trips solid color config", () => {
    const c = defaultColorConfig();
    c.primary.value = "#e32636";
    c.background.value = "#050508";
    c.transparentBackground = true;
    const back = normalizeColorConfig(c);
    expect(back.primary.value).toBe("#e32636");
    expect(back.transparentBackground).toBe(true);
  });

  it("serializes ramp into recipe params", () => {
    const c = defaultColorConfig();
    c.mode = "ramp";
    const p = colorToRecipeParams(c);
    expect(p.color).toBeTruthy();
    expect(Array.isArray(p.color_stops)).toBe(true);
    expect((p.color_stops as unknown[]).length).toBe(256);
  });

  it("interpolates ramp midpoint in linear RGB space", () => {
    const c = defaultColorConfig();
    c.ramp.stops = [
      { t: 0, color: { space: "srgb", value: "#000000" } },
      { t: 1, color: { space: "srgb", value: "#ffffff" } },
    ];
    const lut = buildLutRGBA8(c.ramp);
    const mid = lut[128 * 4]! + lut[128 * 4 + 1]! + lut[128 * 4 + 2]!;
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(800);
  });

  it("parses hex colors", () => {
    const { r, g, b } = parseHexColor("#e32636");
    expect(r).toBeCloseTo(0.89, 1);
    expect(g).toBeCloseTo(0.15, 1);
    expect(b).toBeCloseTo(0.21, 1);
  });
});
