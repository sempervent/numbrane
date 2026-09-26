import { describe, expect, it } from "vitest";
import {
  addSceneToSet,
  moveSceneInSet,
  removeSceneFromSet,
  validateSetV2,
} from "../src/studio/setScore/edges";
import { emptySetV2 } from "../src/studio/setScore/controller";
import type { SceneDef } from "../src/live/types";

function scene(id: string, name: string): SceneDef {
  return {
    id,
    name,
    layers: [{ id: "L0", piece: "geometry/seed-of-life", seed: 1 }],
  };
}

describe("Set score edge alignment", () => {
  it("reorder preserves edge config by scene pair, not slot index", () => {
    let set = emptySetV2("s1", "Test");
    set = addSceneToSet(set, scene("A", "A"));
    set = addSceneToSet(set, scene("B", "B"));
    set = addSceneToSet(set, scene("C", "C"));
    set = {
      ...set,
      edges: [
        {
          to_scene_id: "B",
          advancement: { mode: "automatic", dwell_bars: 16 },
          morph: { type: "crossfade", duration_bars: 4 },
        },
        {
          to_scene_id: "C",
          advancement: { mode: "manual" },
          morph: { type: "crossfade", duration_beats: 8 },
        },
      ],
    };
    const moved = moveSceneInSet(set, 2, 0);
    expect(moved.sequence).toEqual(["C", "A", "B"]);
    expect(moved.edges![0]!.to_scene_id).toBe("A");
    expect(moved.edges![0]!.advancement).toEqual({ mode: "manual" });
    expect(moved.edges![1]!.to_scene_id).toBe("B");
    expect(moved.edges![1]!.advancement).toEqual({ mode: "automatic", dwell_bars: 16 });
    expect(moved.edges![1]!.morph?.duration_bars).toBe(4);
    expect(validateSetV2(moved)).toEqual([]);
  });

  it("remove scene drops orphan edges and validates", () => {
    let set = emptySetV2("s1", "Test");
    for (const id of ["A", "B", "C"]) set = addSceneToSet(set, scene(id, id));
    set = removeSceneFromSet(set, 1);
    expect(set.sequence).toEqual(["A", "C"]);
    expect(set.edges).toHaveLength(1);
    expect(set.edges![0]!.to_scene_id).toBe("C");
    expect(validateSetV2(set)).toEqual([]);
  });

  it("validation surfaces wrong to_scene_id", () => {
    let set = emptySetV2("s1", "Test");
    set = addSceneToSet(set, scene("A", "A"));
    set = addSceneToSet(set, scene("B", "B"));
    set = {
      ...set,
      edges: [{ to_scene_id: "WRONG", advancement: { mode: "manual" } }],
    };
    expect(validateSetV2(set).some((e) => e.includes("to_scene_id"))).toBe(true);
  });
});
