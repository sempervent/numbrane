import { describe, expect, it } from "vitest";
import { orderedScenes } from "../src/live/setModel";
import {
  buildStudioSetDef,
  normalizeAnimationMethodForPiece,
  type StudioDesiredState,
} from "../src/studio/desiredState";
import { collectStudioConsistency } from "../src/studio/consistency";
import { defaultColorConfig } from "../src/studio/color/model";

function baseDesired(pieceId: string): StudioDesiredState {
  return {
    mode: "animate",
    pieceId,
    seed: 42,
    compositionId: null,
    params: { chaos: 0.3, density: 0.7, zoom: 1, hue: 0.08 },
    color: defaultColorConfig(),
    animationMethodId: "construction",
    activeAnimationMethodId: "construction",
    playing: true,
    reactSensitivity: "balanced",
  };
}

describe("studio scene desired state", () => {
  it("rejects incompatible animation methods for audiovisual/nodes", () => {
    const norm = normalizeAnimationMethodForPiece(
      "audiovisual/nodes",
      "construction",
      "construction",
    );
    expect(norm.animationMethodId).not.toBe("construction");
    expect(norm.animationMethodId).toBe("plasma-evolution");
  });

  it("builds a single-layer set for catalog piece", () => {
    const set = buildStudioSetDef(baseDesired("fractals/sdf-raymarch2d"));
    expect(orderedScenes(set)[0]?.layers[0]?.piece).toBe("fractals/sdf-raymarch2d");
  });

  it("flags selector/runtime mismatch in consistency snapshot", () => {
    const snap = collectStudioConsistency({
      pieceId: "audiovisual/nodes",
      mode: "animate",
      compositionId: null,
      animationMethodId: "plasma-evolution",
      activeAnimationMethodId: "plasma-evolution",
      sceneGeneration: 3,
      committedSceneGeneration: 2,
      session: null,
      document: {
        querySelector: (sel: string) => {
          if (sel === "#cfg-piece") return { value: "fields/nebula" } as HTMLSelectElement;
          if (sel === "#modebar button.active")
            return { getAttribute: () => "animate" } as unknown as Element;
          return null;
        },
        getElementById: (id: string) => {
          if (id === "perf-piece") return { textContent: "nodes" } as HTMLElement;
          if (id === "meta-strip")
            return { textContent: "ANIMATE · audiovisual/nodes · shader-native · seed 1" } as HTMLElement;
          return null;
        },
      } as unknown as Document,
      locationSearch: "?piece=audiovisual/nodes",
    });
    expect(snap.consistency.ok).toBe(false);
    expect(snap.consistency.mismatches.some((m) => m.includes("pieceSelector"))).toBe(true);
    expect(snap.consistency.mismatches.some((m) => m.includes("sceneGen"))).toBe(true);
  });
});
