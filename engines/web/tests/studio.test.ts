import { describe, expect, it } from "vitest";
import { orderedScenes } from "../src/live/setModel";
import {
  KeyboardRegistry,
  keyboardChordFromEvent,
  type CommandContext,
} from "../src/studio/keyboard/registry";
import { moreLikeThis, applyMetaAxis } from "../src/studio/explore/variants";
import { ExploreHistory, loadPrefs } from "../src/studio/prefs";
import { matchesFilter, familyOf } from "../src/studio/catalog";
import { RESOLUTION_PRESETS } from "../src/studio/export/formats";
import { defaultMappingsForPiece } from "../src/studio/audio/mappings";
import { presetsForPiece, ANIM_ARCS } from "../src/studio/presets";
import { COMPOSITIONS } from "../src/studio/compositions";
import { webpIsAnimated } from "../src/studio/export/api";
import { normalizeSpecForLivePerformance } from "../src/studio/animation/performance";
import { applyAnimationMethod } from "../src/studio/animation/methods";

function keyEv(init: KeyboardEventInit): KeyboardEvent {
  return {
    ...init,
    preventDefault: () => undefined,
  } as KeyboardEvent;
}

const baseCtx: CommandContext = {
  mode: "generate",
  controlsVisible: true,
  helpVisible: false,
  hudVisible: false,
  playing: false,
  fullscreen: false,
};

describe("studio keyboard registry", () => {
  it("normalizes physical ? and Shift+/ to the same chord", () => {
    expect(keyboardChordFromEvent(keyEv({ key: "?", shiftKey: true }))).toBe("shift+/");
    expect(keyboardChordFromEvent(keyEv({ key: "/", shiftKey: true }))).toBe("shift+/");
  });

  it("handle opens help when user presses ? (Shift+/ chord)", () => {
    const reg = new KeyboardRegistry();
    let help = false;
    reg.register({
      id: "help",
      keys: "?",
      match: ["?", "shift+/"],
      label: "Show/hide keyboard commands",
      group: "global",
      handler: () => {
        help = !help;
      },
    });
    expect(reg.handle(keyEv({ key: "?", shiftKey: true }), baseCtx)).toBe(true);
    expect(help).toBe(true);
    expect(reg.handle(keyEv({ key: "/", shiftKey: true }), baseCtx)).toBe(true);
    expect(help).toBe(false);
  });

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

  it("lists performance visualization shortcuts under animate help", () => {
    const reg = new KeyboardRegistry();
    reg.register({
      id: "next",
      keys: "]",
      match: ["]", "arrowright"],
      label: "Next visualization",
      group: "animate",
      modes: ["animate", "react"],
      handler: () => undefined,
    });
    const animateHelp = reg.helpCatalog("animate").mode;
    expect(animateHelp.some((c) => c.id === "next" && c.keys === "]")).toBe(true);
    const reactHelp = reg.helpCatalog("react").mode;
    expect(reactHelp.some((c) => c.id === "next")).toBe(true);
    expect(reg.helpCatalog("generate").mode.some((c) => c.id === "next")).toBe(false);
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

describe("live performance normalization", () => {
  it("generative live pieces use continuous unbounded clock", () => {
    const spec = normalizeSpecForLivePerformance(
      "reaction-diffusion/reaction-diffusion",
      applyAnimationMethod("reaction-diffusion/reaction-diffusion", "continuous-evolution"),
      "animate",
    );
    expect(spec.endBehavior).toBe("continuous");
    expect(spec.durationSec).toBe(0);
  });

  it("geometry-ir camera-only methods composite generative on live surface", () => {
    const spec = normalizeSpecForLivePerformance(
      "reference/circle-lattice",
      applyAnimationMethod("reference/circle-lattice", "pan-left-right"),
      "animate",
    );
    expect(spec.source).toBe("composite");
    expect(spec.components).toContain("generative");
    expect(spec.endBehavior).toBe("continuous");
    expect(spec.durationSec).toBeGreaterThan(0);
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

describe("studio presets and compositions", () => {
  it("ships named algorithmic presets", () => {
    expect(presetsForPiece("fields/flow-hatching").map((p) => p.id)).toContain("turbulent");
    expect(presetsForPiece("fractals/strange-attractors").length).toBeGreaterThanOrEqual(5);
    expect(presetsForPiece("reaction-diffusion/reaction-diffusion").map((p) => p.id)).toContain(
      "coral",
    );
  });

  it("animation arcs mutate params over time", () => {
    const arc = ANIM_ARCS.find((a) => a.id === "emergence")!;
    const a = arc.apply({ density: 1 }, 0);
    const b = arc.apply({ density: 1 }, 1);
    expect(b.density!).toBeGreaterThan(a.density!);
  });

  it("composition recipes expose multi-layer sets", () => {
    const set = COMPOSITIONS.find((c) => c.id === "slime-sdf")!.build(42, { density: 0.7 });
    expect(orderedScenes(set)[0]!.layers.length).toBe(2);
    expect(orderedScenes(set)[0]!.layers[0]!.piece).toBe("growth/slime-mold");
  });

  it("variant promotion keeps exact seed/params (no regen)", () => {
    const cached = moreLikeThis(
      { seed: 99, parameters: { density: 0.55, chaos: 0.2 } },
      { count: 4, locked: new Set(["density"]) },
    )[0]!;
    // Selecting a variant assigns cached values verbatim
    const promoted = { seed: cached.seed, parameters: { ...cached.parameters } };
    expect(promoted.seed).toBe(cached.seed);
    expect(promoted.parameters.density).toBe(0.55);
  });
});

describe("animated webp detection", () => {
  it("detects ANMF chunk", async () => {
    // Minimal RIFF/WEBP with ANMF marker bytes
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x41, 0x4e, 0x4d,
      0x46, 0x00, 0x00, 0x00, 0x00,
    ]);
    const blob = new Blob([bytes], { type: "image/webp" });
    expect(await webpIsAnimated(blob)).toBe(true);
    const still = new Blob(
      [new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
      { type: "image/webp" },
    );
    expect(await webpIsAnimated(still)).toBe(false);
  });
});
