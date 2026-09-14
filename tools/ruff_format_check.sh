#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../engines/python"
uv run ruff format --check \
  src/numbrane_python/rng.py \
  src/numbrane_python/geometry \
  src/numbrane_python/landscape \
  src/numbrane_python/pieces \
  src/numbrane_python/nap \
  src/numbrane_python/__init__.py \
  tests
