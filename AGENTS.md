# AGENTS.md

Instructions for coding agents working in NUMBRANE.

## Tooling

- **`just` is canonical.** Prefer `just …` over Make. Make is a temporary shim.
- Before requesting review, run **`just ci-lite`**.
- Structured data:
  - YAML → **`ryl check`** (project `.ryl.toml`; no default-on rules)
  - TOML → **`taplo lint`** / **`taplo format --check`**
  - JSON → parse + **`check-jsonschema`** for NAP schemas/fixtures (`just lint-data`)
- Install hooks with **`just precommit-install`** (pre-commit + pre-push → `just ci-lite`).

## Hard constraints

- **Never** add generative-AI / LLM / diffusion / inference / model-weight / prompt-to-image runtime dependencies.
- Deterministic code **must not** use uncontrolled RNGs (`Math.random`, unseeded `random`, OS entropy).
- Deterministic code **must not** depend directly on wall-clock time (`performance.now`, `Date.now`, `time.time`) except in explicit live adapters that convert to logical frames.
- Keep **NAP language-neutral**.
- Crossing an engine boundary requires **contract tests**.
- Avoid gratuitous cross-language ports of algorithms that already exist in one engine.
- Do not rewrite working modules merely for stylistic uniformity.
- Do not invent parallel CI graphs — GitHub Actions and hooks call `just`.

## Inspect first

Read existing modules, specs, and tests before modifying.
