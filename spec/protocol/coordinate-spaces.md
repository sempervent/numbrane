# Coordinate spaces

Existing upstreams do **not** share one coordinate system. NAP names spaces explicitly.

## Spaces (v0)

| ID | Origin | Axes | Notes |
|----|--------|------|-------|
| `normalized-screen` | top-left | x right, y **down**, both in `[0,1]` | UI / interaction |
| `pixel` | top-left | x right, y **down**, integer or float pixels | Raster buffers |
| `cartesian-2d` | explicitly declared (often center) | x right, y **up** | Math / geometry (generative) |
| `complex-plane` | real→x, imag→y (y **up** unless noted) | continuous | Escape-time fractals |

Every geometry IR document MUST set `"space"` to one of these IDs.

## Transforms (informative)

Let canvas width `W`, height `H`.

### `normalized-screen` → `pixel`

```text
px = x * W
py = y * H
```

### `pixel` → `normalized-screen`

```text
x = px / W
y = py / H
```

### `normalized-screen` → `cartesian-2d` (origin at center, y-up, unit scale)

```text
cx = (x - 0.5) * 2 * (W/H if aspect-correct else 1)
cy = (0.5 - y) * 2
```

Exact aspect conventions are piece-specific and MUST be documented in the piece manifest when used.

### `cartesian-2d` → `complex-plane`

```text
z = cx + i * cy
```

(with optional center/zoom applied by the piece).

## Rule

Do not silently mix spaces. Renderers convert at boundaries.
