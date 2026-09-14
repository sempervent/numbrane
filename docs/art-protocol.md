# Art Protocol

NUMBRANE uses the **NUMBRANE Art Protocol (NAP)** as its language-neutral art contract.

Engines consume NAP recipes, manifests, events, and telemetry. Canonical schemas live under `spec/schema/`. Protocol prose lives under `spec/protocol/` and is summarized in [protocol.md](protocol.md).

Python helpers such as `numbrane_python.nap.adapter.recipe_to_render_context` adapt NAP recipes into engine render contexts.
