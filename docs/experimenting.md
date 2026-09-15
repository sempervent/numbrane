# Experimenting with NUMBRANE

Copy/paste-tested workflows for stills, Seed Artifacts, and **NUMBRANE Studio**
(Generate / Animate / React). No MIDI, Ableton, or OBS required.

## Native setup

```bash
git fetch origin
git switch main
git pull --ff-only

just bootstrap
just ci-lite
```

See what NUMBRANE exposes:

```bash
numbrane --help
numbrane pieces
numbrane render --help
numbrane seed --help
```

## Launch NUMBRANE Studio

```bash
just studio
```

Open the printed URL (default `http://127.0.0.1:5173/studio.html`).

Studio modes:

| Key | Mode |
|-----|------|
| `1` | GENERATE |
| `2` | ANIMATE |
| `3` | REACT |
| `Tab` | show/hide controls |
| `?` | keyboard help |
| `F` | fullscreen |
| `` ` `` | performance HUD |

The visualization fills the viewport when controls are hidden.

## Docker Studio

```bash
docker buildx bake --print
docker buildx bake studio render
just docker-studio
```

Or:

```bash
docker buildx bake -f docker-bake.hcl studio render
docker compose up studio renderer
```

Then open `http://127.0.0.1:8080/studio.html`.

**Microphone:** the browser uses `getUserMedia()` directly. Audio devices are **not**
passed into the Docker container — the container only serves the app and proxies
`/api/*` to the `renderer` service.

**Exports:** server-side PNG/SVG/animated WebP/APNG/WebM land in `./artifacts/`
(bind-mounted). Browser downloads may also go to your Downloads folder.

No host Python/Node/Rust install is required for the Docker workflow.

## Generate first image (CLI)

```bash
mkdir -p artifacts/experiments

numbrane render geometry/metatron \
  --seed 42 \
  --width 1920 \
  --height 1080 \
  --format png \
  --output artifacts/experiments/metatron-42.png
```

Large square:

```bash
numbrane render geometry/metatron \
  --seed 137 \
  --width 4096 \
  --height 4096 \
  --format png \
  --output artifacts/experiments/metatron-137-4k.png
```

Sacred geometry SVG:

```bash
numbrane render geometry/sri-yantra \
  --seed 42 \
  --width 2048 \
  --height 2048 \
  --format svg \
  --output artifacts/experiments/sri-yantra.svg
```

## Exact temporal frame

```bash
numbrane render reaction-diffusion/reaction-diffusion \
  --seed 42 \
  --frame 800 \
  --width 1920 \
  --height 1080 \
  --format png \
  --output artifacts/experiments/rd-42-f800.png
```

## Fractals

```bash
numbrane render fractals/escape-time \
  --seed 2026 \
  --width 1920 \
  --height 1080 \
  --format png \
  --output artifacts/experiments/escape-2026.png

numbrane render fractals/strange-attractors \
  --seed 137 \
  --width 1920 \
  --height 1080 \
  --format png \
  --output artifacts/experiments/attractor-137.png
```

## Gallery & explore

```bash
just gallery
numbrane explore fractals/strange-attractors --seeds 1,42,137,2026
```

In Studio GENERATE: press `G` for **More Like This** variants (deterministic mutation; lock density under Advanced).

## Seed Artifacts

```bash
numbrane seed create reaction-diffusion/reaction-diffusion \
  --seed 42 --frame 800 --width 256 --height 256 \
  -o artifacts/seeds/rd-42-f800

numbrane seed inspect artifacts/seeds/rd-42-f800
numbrane seed continue artifacts/seeds/rd-42-f800 --steps 100 \
  -o artifacts/seeds/rd-42-continued
```

Also try:

```text
growth/slime-mold
growth/differential-growth
growth/lsystem
particles/noodles
geometry/flower-of-life
```

In Studio: **Save Seed State** (`S`) → later load from Advanced → saved seeds.

## Animate

1. `just studio`
2. Press `1`, choose Metatron, randomize (`R`), tweak density
3. Press `S` to save Seed State
4. Press `2` (ANIMATE) — evolution continues from current piece/seed
5. Space play/pause · `E` export WebM/WebP

## React (microphone)

1. Press `3`
2. Click **Enable microphone** (MacBook built-in or any browser input)
3. Press `Tab` — controls disappear
4. Press `F` — fullscreen art
5. Press `?` — shortcuts · `?` again to close
6. Optional sets: `pfl-default`, `pfl-drone`, `pfl-ritual`, `pfl-machine`

No MIDI. No Ableton. No OBS required.

OBS optional later:

```text
http://127.0.0.1:5173/live-output.html?set=pfl-default
```

## Recover / reset

| Key | Action |
|-----|--------|
| `Esc` | close overlays / hide chrome / exit fullscreen |
| `Shift+R` | restart current seed |
| `R` | new random seed |
| `[` / `]` | previous / next piece |

## First evening sequence

```text
seed 1    → Metatron (GENERATE)
seed 42   → reaction diffusion Seed Artifact
seed 137  → strange attractor
seed 2026 → escape-time

gallery → favorite → Save Seed State
→ ANIMATE → REACT with room/mic audio
```
