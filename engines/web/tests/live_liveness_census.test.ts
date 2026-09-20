import { describe, expect, it } from "vitest";
import { AnimationRuntime } from "../src/live/animationRuntime";
import { collectPieceManifests, studioVisibleManifests } from "../src/studio/catalog/manifestCollection";
import { defaultAnimationMethodId } from "../src/studio/animation/methods";
import { resolveLivePerformanceMethodSpec } from "../src/studio/animation/performance";
import { buildMashupSet, isMashupPiece } from "../src/studio/mashups";

const CHECK_TIMES = [7.9, 8.1, 16, 30, 60];

type CensusRow = { id: string; ok: boolean; reason: string };

function assertLivePhaseContract(pieceId: string): CensusRow {
  const spec = resolveLivePerformanceMethodSpec(
    pieceId,
    defaultAnimationMethodId(pieceId),
    "animate",
  );
  const rt = new AnimationRuntime(spec);
  rt.performanceMode = true;
  const phases = CHECK_TIMES.map((t) => {
    rt.seekTime(t);
    return rt.evaluate().phase;
  });
  const stuck =
    phases.every((p) => p >= 0.999) ||
    (phases[0] === phases[phases.length - 1] && phases[0]! >= 0.999);
  if (stuck) {
    return {
      id: pieceId,
      ok: false,
      reason: `phase stuck ${phases.map((p) => p.toFixed(3)).join(" -> ")}`,
    };
  }
  return { id: pieceId, ok: true, reason: "" };
}

describe("live animation phase contract (logical time only)", () => {
  it("Animate-capable catalog pieces avoid terminal performance phase", () => {
    const pieces = studioVisibleManifests(collectPieceManifests())
      .map((m) => m.piece_id)
      .sort();
    const failed: CensusRow[] = [];
    for (const id of pieces) {
      const row = assertLivePhaseContract(id);
      if (!row.ok) failed.push(row);
    }
    for (const id of pieces.filter(isMashupPiece)) {
      expect(buildMashupSet(id, 42, {})).not.toBeNull();
      const row = assertLivePhaseContract(id);
      if (!row.ok) failed.push(row);
    }
    if (failed.length) {
      const msg = failed.map((f) => `LIVE LIVENESS FAILURE\npiece: ${f.id}\n${f.reason}`).join("\n\n");
      expect.fail(msg);
    }
    expect(pieces.length).toBeGreaterThan(20);
  });
});
