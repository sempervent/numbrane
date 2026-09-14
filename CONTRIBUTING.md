# Contributing

1. Read [`AGENTS.md`](AGENTS.md) and [`docs/principles.md`](docs/principles.md).
2. Run `just bootstrap` once, then `just ci-lite` before opening a PR.
3. Do not add AI/ML generation runtime dependencies.
4. Prefer contract tests when changing cross-language behavior.
5. NUMBRANE is licensed under AGPL-3.0-only.

## Local commands

```bash
just bootstrap
just ci-lite
just test
just docs
```
