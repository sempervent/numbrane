import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EventRecorder, EventReplayer, type NapEvent } from "../src/events";
import { NodesWorld } from "../src/nodesWorld";
import { expandSeed, Rng } from "../src/rng";
import { generate, normalizeGeometry } from "../src/pieces/circleLattice";
import { clamp01 } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const srcDir = resolve(here, "../src");

describe("rng vectors", () => {
  const data = JSON.parse(
    readFileSync(resolve(root, "spec/rng/vectors.json"), "utf8"),
  );

  for (const c of data.cases) {
    it(`seed ${c.seed}`, () => {
      expect(expandSeed(c.seed)).toEqual(c.state0);
      const rng = new Rng(c.seed);
      for (const expected of c.u32) {
        expect(rng.randomU32()).toBe(expected);
      }
      const rng2 = new Rng(c.seed);
      for (const expected of c.f64) {
        expect(Math.abs(rng2.randomF64() - expected)).toBeLessThan(1e-15);
      }
    });
  }
});

describe("circle lattice", () => {
  it("is deterministic", () => {
    const recipe = JSON.parse(
      readFileSync(
        resolve(root, "pieces/reference/circle-lattice/recipe.json"),
        "utf8",
      ),
    );
    const a = normalizeGeometry(generate(recipe));
    const b = normalizeGeometry(generate(recipe));
    expect(a).toEqual(b);
    expect(a.primitives).toHaveLength(7);
  });
});

describe("event replay", () => {
  it("produces the same node list for fixed seed+events", () => {
    const seed = 42;
    const fps = 60;
    const events: NapEvent[] = [
      { type: "node.create", frame: 0, node: { x: 0.25, y: 0.5 } },
      { type: "node.create", frame: 0, node: { x: 0.75, y: 0.5 } },
      {
        type: "parameter.change",
        frame: 5,
        parameter: { path: "mutation", value: 0.4 },
      },
      { type: "node.create", frame: 10, node: { x: 0.1, y: 0.9 } },
      { type: "node.delete", frame: 20, node: { x: 0.25, y: 0.5 } },
      modeChangeAsParam(30, "escape"),
    ];

    const a = new NodesWorld(seed).runReplay(events, 40, fps);
    const b = new NodesWorld(seed).runReplay(events, 40, fps);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);

    const recorder = new EventRecorder();
    for (const e of events) recorder.record(e);
    const json = recorder.exportJSON(seed, fps);
    const { stream, replayer } = EventReplayer.fromJSON(json);
    expect(stream.seed).toBe(seed);
    expect(replayer.eventsAt(0)).toHaveLength(2);

    const c = new NodesWorld(stream.seed).runReplay(stream.events, 40, stream.fps);
    expect(c).toEqual(a);
  });
});

function modeChangeAsParam(frame: number, mode: string): NapEvent {
  return {
    type: "parameter.change",
    frame,
    parameter: { path: "mode", value: mode },
  };
}

describe("determinism hygiene", () => {
  it("src has no Math.random", () => {
    const hits: string[] = [];
    walk(srcDir, (file, text) => {
      if (/\bMath\.random\s*\(/.test(text)) {
        hits.push(file);
      }
    });
    expect(hits).toEqual([]);
  });

  it("src has no performance.now in core paths", () => {
    const hits: string[] = [];
    walk(srcDir, (file, text) => {
      // Live-only wall-clock instrumentation (HUD / perf counters) — must not
      // feed deterministic digests, RNG, simulation, or shaders.
      if (file.includes(`${sep}latticefall${sep}`) && text.includes("LIVE_ONLY_WALL_CLOCK")) {
        return;
      }
      // NUMBRANE LIVE driver may use wall clock to advance transport / MIDI timing;
      // artwork still consumes logical frame/beat only.
      if (file.includes(`${sep}live${sep}`)) {
        return;
      }
      if (/\bperformance\.now\s*\(/.test(text)) {
        hits.push(file);
      }
    });
    expect(hits).toEqual([]);
  });
});

describe("telemetry clamp", () => {
  it("clamp01 bounds", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(1.5)).toBe(1);
  });
});

function walk(dir: string, visit: (file: string, text: string) => void) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, visit);
    } else if (/\.(ts|tsx|js|css)$/.test(name)) {
      visit(path, readFileSync(path, "utf8"));
    }
  }
}
