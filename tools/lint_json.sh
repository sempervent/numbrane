#!/usr/bin/env bash
# Validate project JSON: parse + NAP schema metaschema + fixtures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"

python3 - <<'PY'
import json
import sys
from pathlib import Path

root = Path(".")
skip_dir_names = {
    "node_modules",
    ".venv",
    "target",
    "site",
    "artifacts",
    "dist",
    "test-results",
    "playwright-report",
    ".pytest_cache",
    ".ruff_cache",
    ".git",
}
errors = []
count = 0
for path in root.rglob("*.json"):
    if any(part in skip_dir_names for part in path.parts):
        continue
    if path.name == "package-lock.json":
        continue
    count += 1
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{path}: {exc}")
if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"json-parse: ok ({count} files)")
PY

echo "ok -- validation done"
check-jsonschema --check-metaschema \
  spec/schema/manifest.schema.json \
  spec/schema/recipe.schema.json \
  spec/schema/event.schema.json \
  spec/schema/telemetry.schema.json \
  spec/schema/geometry-ir.schema.json \
  spec/schema/artifact.schema.json \
  spec/schema/parameter.schema.json
echo "json-schema metaschema: ok"

echo "ok -- validation done"
check-jsonschema --schemafile spec/schema/manifest.schema.json \
  pieces/*/manifest.json pieces/*/*/manifest.json 2>/dev/null || \
check-jsonschema --schemafile spec/schema/manifest.schema.json $(find pieces -name manifest.json | sort)
echo "ok -- validation done"
check-jsonschema --schemafile spec/schema/recipe.schema.json \
  $(find pieces -name 'recipe*.json' | sort)
echo "json-schema fixtures: ok"
