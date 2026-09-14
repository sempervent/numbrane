# NUMBRANE Art Protocol (NAP) v0

NAP is the language-neutral mathematical contract between engines.

## Goals

- Reproducible recipes across engines
- Explicit parameters, time, events, color, coordinates
- Deterministic RNG with shared test vectors
- Telemetry suitable for audiovisual coupling
- Tiny geometry IR for semantic contract tests

## Non-goals (v0)

- Universal scene graph
- Bit-identical pixels across all GPUs
- Requiring every algorithm in every language

## Core objects

| Object | Schema | Purpose |
|--------|--------|---------|
| Manifest | [`../schema/manifest.schema.json`](../schema/manifest.schema.json) | Piece/algorithm identity & capabilities |
| Recipe | [`../schema/recipe.schema.json`](../schema/recipe.schema.json) | Reproducible execution specification |
| Parameter | [`../schema/parameter.schema.json`](../schema/parameter.schema.json) | Wire-level parameter value |
| Event | [`../schema/event.schema.json`](../schema/event.schema.json) | Ordered interactive input |
| Telemetry | [`../schema/telemetry.schema.json`](../schema/telemetry.schema.json) | Compact visual→audio characteristics |
| Artifact | [`../schema/artifact.schema.json`](../schema/artifact.schema.json) | Declared outputs |

## Authoring

YAML may be used for human authoring. At protocol boundaries, data MUST be JSON-compatible (objects, arrays, strings, numbers, booleans, null). Engines SHOULD canonicalize numbers without locale-dependent formatting.

## Protocol version

v0 documents use `"protocol_version": "0.1.0"`.

## Related

- [coordinate-spaces.md](coordinate-spaces.md)
- [color.md](color.md)
- [time.md](time.md)
- [determinism.md](determinism.md)
- [../rng/README.md](../rng/README.md)
