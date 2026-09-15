#!/usr/bin/env bash
# Generate a gitignored art review corpus under artifacts/art-smoke/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts/art-smoke"
mkdir -p "$OUT"
CLI=(uv run --directory "$ROOT/engines/python" python "$ROOT/tools/numbrane_cli.py")

render() {
  local piece="$1" seed="$2" w="${3:-1280}" h="${4:-720}" frame="${5:-0}"
  local name
  name="$(echo "$piece" | tr '/' '_')-s${seed}-f${frame}.png"
  echo "==> $piece seed=$seed"
  "${CLI[@]}" render "$piece" --seed "$seed" --width "$w" --height "$h" --frame "$frame" --format png \
    -o "$OUT/$name"
}

echo "Art smoke → $OUT"

# Stills (3+ seeds each major family)
for s in 1 42 137; do
  render geometry/metatron "$s" 1280 1280
  render geometry/sri-yantra "$s" 1280 1280
  render fractals/strange-attractors "$s"
  render fields/flow-hatching "$s"
  render particles/noodles "$s"
  render reaction-diffusion/reaction-diffusion "$s" 960 540 400
  render growth/slime-mold "$s" 640 640 200
  render growth/differential-growth "$s" 640 640 120
  render tiling/truchet-tiles "$s"
  render tiling/voronoi-stained-glass "$s"
  render fractals/escape-time "$s"
  render mashups/slime-on-sdf "$s" 640 640
done

# Short deterministic animations via render service if curl+stack up, else frame strips
if command -v ffmpeg >/dev/null 2>&1; then
  for piece_seed in "fractals/strange-attractors:42" "reaction-diffusion/reaction-diffusion:42" "fields/flow-hatching:137"; do
    piece="${piece_seed%%:*}"
    seed="${piece_seed##*:}"
    frames="$OUT/frames-$(echo "$piece" | tr '/' '_')"
    mkdir -p "$frames"
    for i in $(seq 0 23); do
      f=$((i * 8))
      "${CLI[@]}" render "$piece" --seed "$seed" --width 640 --height 360 --frame "$f" --format png \
        -o "$frames/frame_$(printf '%05d' "$i").png"
    done
    ffmpeg -y -framerate 12 -i "$frames/frame_%05d.png" -c:v libwebp -loop 0 -an \
      "$OUT/anim-$(echo "$piece" | tr '/' '_')-s${seed}.webp" 2>/dev/null || true
  done
fi

echo "ok: $(find "$OUT" -type f | wc -l | tr -d ' ') files"
find "$OUT" -type f | sort | head -40
