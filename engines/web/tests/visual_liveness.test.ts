import { describe, expect, it } from "vitest";
import { VisualLivenessWatchdog } from "../src/live/visualLiveness";

describe("VisualLivenessWatchdog", () => {
  it("treats advancing animation time as activity when digest is flat", () => {
    const w = new VisualLivenessWatchdog();
    w.reset("digest-a", 1000);
    w.noteDigest("digest-a", 5000, true, false);
    w.noteAnimationAdvance(2.5, 6000, true);
    const snap = w.snapshot(7000, true, false, 3.0, 1000);
    expect(snap.status).not.toBe("stalled");
  });
});
