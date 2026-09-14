import { describe, expect, it } from "vitest";
import { KeyboardRegistry, type CommandContext } from "../src/studio/keyboard/registry";
import { moreLikeThis, applyMetaAxis } from "../src/studio/explore/variants";
import { ExploreHistory, loadPrefs } from "../src/studio/prefs";
import { matchesFilter, familyOf } from "../src/studio/catalog";
import { RESOLUTION_PRESETS } from "../src/studio/export/formats";
import { defaultMappingsForPiece } from "../src/studio/audio/mappings";

const baseCtx: CommandContext = {
  mode: "generate",
  controlsVisible: true,
  helpVisible: false,
  hudVisible: false,
  playing: false,
  fullscreen: false,
};

describe("studio keyboard registry", () => {
  it("help catalog stays aligned with registered commands", () => {
    const reg = new KeyboardRegistry();
    let help = false;
    let controls = true;
    reg.register({
      id: "help",
      keys: "?",
      match: ["?", "shift+/"],
      label: "help",
      group: "global",
      handler: () => {
        help = !help;
      },
    });
    reg.register({
      id: "tab",
      keys: "Tab",
      match: ["tab"],
      label: "controls",
      group: "global",
      handler: () => {
        controls = !controls;
      },
    });
    const catalog = reg.helpCatalog("generate");
    expect(catalog.global.map((c) => c.id).sort()).toEqual(["help", "tab"]);
    // Invoke handlers directly (node vitest has no DOM KeyboardEvent)
    for (const c of catalog.global) void c.handler(baseCtx);
    expect(help).toBe(true);
    expect(controls).toBe(false);
  });

  it("mode keys are listed for help", () => {
    const reg = new KeyboardRegistry();
    reg.register({
      id: "g",
      keys: "G",
      match: ["g"],
      label: "variants",
      group: "generate",
      handler: () => undefined,
    });
    expect(reg.helpCatalog("generate").mode.some((c) => c.id === "g")).toBe(true);
    expect(reg.helpCatalog("react").mode.some((c) => c.id === "g")).toBe(false);
  });
});

describe("studio explore", () => {
  it("moreLikeThis honors locks", () => {
    const base = { seed: 42, parameters: { density: 0.7, chaos: 0.2, hue: 0.5 } };
    const locked = new Set(["density", "seed"]);
    const vars = moreLikeThis(base, { count: 4, locked });
    expect(vars).toHaveLength(4);
    for (const v of vars) {
      expect(v.parameters.density).toBe(0.7);
      expect(v.seed).toBe(42);
    }
  });

  it("meta axes map to params", () => {
    const p = applyMetaAxis({ chaos: 0.1 }, "organic", 1);
    expect(p.chaos).toBeGreaterThan(0.5);
  });
});

describe("studio prefs history", () => {
  it("back/forward navigation", () => {
    const h = new ExploreHistory();
    h.push({ pieceId: "a", seed: 1, mode: "generate", at: 1 });
    h.push({ pieceId: "b", seed: 2, mode: "generate", at: 2 });
    expect(h.back()?.pieceId).toBe("a");
    expect(h.forward()?.pieceId).toBe("b");
  });

  it("loadPrefs never throws", () => {
    expect(loadPrefs().pieceId).toBeTruthy();
  });
});

describe("studio catalog filters", () => {
  it("filters by capability and family", () => {
    const p = {
      piece_id: "geometry/metatron",
      family: "geometry",
      capabilities: { still: true, animated: true, realtime: true, audio_reactive: true },
    };
    expect(matchesFilter(p, "geometry")).toBe(true);
    expect(matchesFilter(p, "still")).toBe(true);
    expect(familyOf(p.piece_id)).toBe("geometry");
  });
});

describe("studio export presets", () => {
  it("includes required resolutions", () => {
    const ids = RESOLUTION_PRESETS.map((r) => `${r.width}x${r.height}`);
    expect(ids).toContain("1920x1080");
    expect(ids).toContain("3840x2160");
    expect(ids).toContain("4096x4096");
    expect(ids).toContain("1080x1920");
    expect(ids).toContain("1080x1080");
  });
});

describe("studio audio mappings", () => {
  it("provides meaningful defaults per family", () => {
    expect(defaultMappingsForPiece("reaction-diffusion/reaction-diffusion").length).toBeGreaterThan(0);
    expect(defaultMappingsForPiece("growth/slime-mold").some((m) => m.target === "stepSize")).toBe(
      true,
    );
  });
});
