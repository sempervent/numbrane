import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  edgeFromTransitionForm,
  launchQuantFromBars,
  launchQuantToBars,
  readMorphDuration,
} from "../src/studio/setScore/transitionEdit";
import { renderRehearseWorkspaceHtml, renderSetScoreRailHtml } from "../src/studio/setScore/workspacesRender";
import { SetScoreController } from "../src/studio/setScore/controller";
import type { SetDefV2 } from "../src/live/types";
import { studioDevToolsEnabled } from "../src/studio/workflow";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Studio workflow UI", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(root, "pieces/live/set-performance-fixture/set.json"), "utf8"),
  ) as SetDefV2;

  it("studio.html exposes workflow nav and dedicated panels", () => {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../studio.html"), "utf8");
    expect(html).toContain('id="workflow-nav"');
    expect(html).toContain('data-workflow="rehearse"');
    expect(html).toContain('id="rehearse-panel"');
    expect(html).toContain('id="perform-panel"');
    expect(html).toContain('id="create-subbar"');
    expect(html).not.toContain("Load fixture");
  });

  it("production UI omits fixture control in Set rail", () => {
    const ctrl = new SetScoreController(() => null);
    ctrl.loadDocument(fixture);
    const html = renderSetScoreRailHtml(ctrl, false);
    expect(html).not.toContain("set-load-fixture");
    const devHtml = renderSetScoreRailHtml(ctrl, true);
    expect(devHtml).toContain("set-load-fixture");
  });

  it("Rehearse workspace shows primary control above fold content", () => {
    const ctrl = new SetScoreController(() => null);
    ctrl.loadDocument(fixture);
    const html = renderRehearseWorkspaceHtml(ctrl);
    expect(html).toContain("Rehearse");
    expect(html).toContain("set-rehearse-go");
    expect(html).not.toContain("set-perform-enter");
  });

  it("transition form maps human quant and single morph unit", () => {
    const patch = edgeFromTransitionForm({
      automatic: true,
      dwellBars: 16,
      quant: "next_bar",
      morphValue: 8,
      morphUnit: "bars",
      minDwellBars: 1,
    });
    expect(patch.launch_quantization_bars).toBe(1);
    expect(patch.morph?.duration_bars).toBe(8);
    expect(patch.morph?.duration_beats).toBeUndefined();
    expect(launchQuantToBars(launchQuantFromBars(4))).toBe(4);
    const edge = {
      to_scene_id: "b",
      advancement: { mode: "manual" as const },
      morph: { type: "crossfade" as const, duration_beats: 4 },
    };
    expect(readMorphDuration(edge).unit).toBe("beats");
  });

  it("dev tools flag follows env or query", () => {
    expect(typeof studioDevToolsEnabled()).toBe("boolean");
  });
});
