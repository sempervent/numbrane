# OBS

Use NUMBRANE LIVE as an **OBS Browser Source**.

## Output URL

```text
http://127.0.0.1:5173/live-output.html?set=pfl-default
```

Query parameters:

| Param | Effect |
|-------|--------|
| `set` | Set id (default `pfl-default`) |
| `scene` | Initial scene id |
| `alpha=1` / `transparent=1` | Transparent background for overlay |
| `res` | `1920x1080`, `3840x2160`, `1080x1920`, `1080x1080` |
| `seed` | u32 seed |

Control UI is hidden; no cursor interaction is required.

## Alpha

WebGL is created with `alpha: true` and `premultipliedAlpha: false`. Transparent mode clears to zero alpha so generated visuals can layer over camera footage in OBS.

In OBS: Browser Source → enable **Shutdown source when not visible** as desired; set width/height to match `res`.

## Recording video

Prefer OBS for video capture. LIVE provides PNG snapshot from the control UI; performance **data** recording is separate (see performance-recording.md).
