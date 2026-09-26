import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SetOrchestrator } from "../src/live/setOrchestrator";
import { resolveSetModel } from "../src/live/setModel";
import type { SetDef, SetDefV2 } from "../src/live/types";
import { SetScoreController } from "../src/studio/setScore/controller";
import { renderPerformWorkspaceHtml, renderSetScoreRailHtml } from "../src/studio/setScore/workspacesRender";
import { buildSetStatusView } from "../src/studio/setScore/statusView";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Set score UI", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(root, "pieces/live/set-performance-fixture/set.json"), "utf8"),
  ) as SetDefV2;

  it("studio.html keeps perform chrome outside stage-wrap", () => {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../studio.html"), "utf8");
    const body = html.slice(html.indexOf("<body"));
    const stageClose = body.indexOf('id="stage-wrap"');
    const stageWrapEnd = body.indexOf("</div>", body.indexOf('id="performance-strip"'));
    const chromeIdx = body.indexOf('id="set-score-chrome"');
    expect(chromeIdx).toBeGreaterThan(stageWrapEnd);
    expect(chromeIdx).toBeGreaterThan(stageClose);
    expect(html).toContain("controls-hidden #set-score-chrome");
    expect(body.slice(stageClose, chromeIdx)).not.toContain("set-score-chrome");
  });

  it("Set rail render includes ordered score chain from fixture", () => {
    const ctrl = new SetScoreController(() => null);
    ctrl.loadDocument(fixture);
    const html = renderSetScoreRailHtml(ctrl, false);
    expect(html).toContain("A — automatic dwell");
    expect(html).toContain("B — manual advance");
    expect(html).toContain("set-score-chain");
    expect(html).toContain("Rehearse this Set");
    expect(html).not.toContain("set-load-fixture");
  });

  it("perform chrome reflects queued replacement from runtime", () => {
    const or = new SetOrchestrator();
    const set = structuredClone(fixture) as SetDefV2;
    set.edges![0]!.launch_quantization_bars = 1;
    or.loadSet(set);
    const model = resolveSetModel(set);
    const b = model.scenes[1]!.id;
    const c = model.scenes[2]!.id;
    or.requestAdvance(b);
    expect(or.snapshot()?.queuedSceneId).toBe(b);
    or.requestAdvance(c);
    expect(or.snapshot()?.queuedSceneId).toBe(c);

    const sessionStub = {
      getSetOrchestratorSnapshot: () => or.snapshot(),
      runtime: { transport: { getSnapshot: () => ({ beat: 0, source: "internal" }) } },
      getSetExecutionMode: () => "perform" as const,
    } as import("../src/live/session").LiveSession;
    const ctrl = new SetScoreController(() => sessionStub);
    ctrl.loadDocument(fixture);
    ctrl.surface = "perform";
    expect(ctrl.status().queuedSceneName).toContain("C");
    const html = renderPerformWorkspaceHtml(ctrl);
    expect(html).toContain("Advance");
    expect(html).toContain("C");
    expect(html).not.toContain("set-score-chain");
  });

  it("controller save/load round-trips fixture via localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    });
    const ctrl = new SetScoreController(() => null);
    ctrl.loadFixtureJson(fixture);
    ctrl.updateEdge(1, {
      advancement: { mode: "automatic", dwell_bars: 12 },
    });
    ctrl.save();
    const ctrl2 = new SetScoreController(() => null);
    ctrl2.loadPersisted();
    expect(ctrl2.getDocument().edges![1]!.advancement).toEqual({
      mode: "automatic",
      dwell_bars: 12,
    });
    expect(ctrl2.getDocument().sequence).toEqual((fixture as SetDefV2).sequence);
    vi.unstubAllGlobals();
  });
});
