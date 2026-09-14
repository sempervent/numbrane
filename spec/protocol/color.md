# Color

Canonical protocol color is separate from renderer-internal storage.

## Canonical representation

Normalized **RGBA** in linear or sRGB as declared:

```json
{ "r": 0.0, "g": 0.0, "b": 0.0, "a": 1.0, "space": "srgb" }
```

- Components are floats in `[0, 1]`.
- `"space"` is `"srgb"` (default for authored colors) or `"linear-rgb"`.

## Hue parameters

When HSL/HSV parameters appear in recipes:

- **Hue** is degrees in `[0, 360)` unless a piece documents turns `[0,1)`.
- Saturation/value/lightness are `[0, 1]`.

## Conversion ownership

| Boundary | Owner |
|----------|-------|
| Recipe authored colors | Protocol RGBA / declared hue params |
| Engine internal (GPU half-float, uint8 palette, …) | Engine |
| Artifact export (PNG sRGB bytes, …) | Renderer, documented per artifact type |

Engines MUST document whether shaders assume linear or sRGB working spaces.

## Non-requirement

Renderers are **not** required to use identical internal color storage—only to honor protocol values at boundaries.
