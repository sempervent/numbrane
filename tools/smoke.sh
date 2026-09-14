#!/usr/bin/env bash
# Artifact smoke suite — proves generation succeeds for representative pieces.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts/smoke"
mkdir -p "$OUT"
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
cd "$ROOT"

cli() {
  (cd "$ROOT/engines/python" && uv run python ../../tools/numbrane_cli.py "$@")
}

cli render reference/circle-lattice --seed 42 -o "$OUT/circle-lattice.json"
cli render geometry/seed-of-life --seed 1 -o "$OUT/seed-of-life.json"
cli render geometry/metatron --seed 1 -o "$OUT/metatron.json"
cli render landscape/noise-landscape --seed 42 -o "$OUT/noise-landscape.png"
cli render fractals/strange-attractors --seed 42 -o "$OUT/strange-attractors.png"

(cd engines/web && npx tsx -e '
import { EventRecorder } from "./src/events.ts";
import { NodesWorld } from "./src/nodesWorld.ts";
const rec = new EventRecorder();
rec.record({ type: "node.create", frame: 0, node: { x: 0.2, y: 0.3 } });
rec.record({ type: "parameter.change", frame: 1, parameter: { path: "mode", value: "escape" } });
const json = rec.exportJSON(42, 60);
const world = new NodesWorld(42);
const nodes = world.runReplay(JSON.parse(json).events, 10, 60);
if (nodes.length < 1) throw new Error("replay failed");
console.log("web event replay smoke ok", nodes.length);
')

test -f "$OUT/circle-lattice.json"
test -f "$OUT/noise-landscape.png"
test -f "$OUT/strange-attractors.png"
echo "smoke ok -> $OUT"
