# Development

Canonical interface: **`just`**.

```bash
just                 # list recipes
just doctor
just bootstrap
just precommit-install
just fmt-check
just lint
just lint-data
just test
just ci-lite         # pre-push
just ci              # full
just smoke           # artifact generation smoke (not in commit hooks)
```

## Hooks

`just precommit-install` installs:

- **pre-commit** — fast checks on **tracked/staged** files only (whitespace, JSON/TOML/YAML, ruff, rustfmt, schema lite). It does **not** lint unrelated untracked files.
- **pre-push** — `just ci-lite` (maintained repository fmt/lint/test)

Whole-tree / hygiene:

```bash
just ci-lite      # maintained repo gate
just repo-audit   # F821 sweep and related hygiene
just ci           # includes WASM build + Playwright LATTICEFALL smoke
```

## Structured-data ownership

| Format | Tool |
|--------|------|
| YAML | `ryl` (`.ryl.toml`) |
| TOML | Taplo |
| JSON | parse + `check-jsonschema` |

## CI

GitHub Actions installs tools, builds LATTICEFALL WASM, installs Playwright Chromium
(with SwiftShader args), and runs `just ci` / `just lint-data`. Do not duplicate
orchestration in workflow YAML.
