# Art Protocol (NAP)

Canonical machine-readable schemas and RNG vectors live in the repository under `spec/` (not duplicated into the MkDocs tree).

## Objects

| Object | Path |
|--------|------|
| Manifest | `spec/schema/manifest.schema.json` |
| Recipe | `spec/schema/recipe.schema.json` |
| Parameter | `spec/schema/parameter.schema.json` |
| Event | `spec/schema/event.schema.json` |
| Telemetry | `spec/schema/telemetry.schema.json` |
| Artifact | `spec/schema/artifact.schema.json` |
| Geometry IR | `spec/schema/geometry-ir.schema.json` |

## Human-readable protocol docs

| Topic | Path |
|-------|------|
| Overview | `spec/protocol/ART_PROTOCOL.md` |
| Coordinates | `spec/protocol/coordinate-spaces.md` |
| Color | `spec/protocol/color.md` |
| Time | `spec/protocol/time.md` |
| Determinism | `spec/protocol/determinism.md` |
| RNG | `spec/rng/README.md` + `spec/rng/vectors.json` |

## Summary

NAP is language-neutral. Engines exchange JSON-compatible manifests, recipes, events, telemetry, and artifacts. Deterministic recipes use u32 seeds and logical `frame`/`fps` time — never wall clock.

YAML may be used for authoring; JSON-compatible structures are canonical at protocol boundaries.
