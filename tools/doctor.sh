#!/usr/bin/env bash
# Report toolchain availability for NUMBRANE development.
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"

ok() { printf '  OK   %-16s %s\n' "$1" "$2"; }
miss() { printf '  MISS %-16s %s\n' "$1" "$2"; MISSING=1; }
MISSING=0

echo "NUMBRANE doctor"
echo "==============="

if command -v just >/dev/null; then ok just "$(just --version)"; else miss just "brew install just"; fi
if command -v uv >/dev/null; then ok uv "$(uv --version)"; else miss uv "curl -LsSf https://astral.sh/uv/install.sh | sh"; fi
if command -v python3 >/dev/null; then ok python3 "$(python3 --version)"; else miss python3 "install Python 3.12+"; fi
if command -v node >/dev/null; then ok node "$(node --version)"; else miss node "install Node.js 20+"; fi
if command -v npm >/dev/null; then ok npm "$(npm --version)"; else miss npm "comes with Node.js"; fi
if command -v cargo >/dev/null; then ok cargo "$(cargo --version)"; else miss cargo "https://rustup.rs"; fi
if command -v rustc >/dev/null; then ok rustc "$(rustc --version)"; else miss rustc "https://rustup.rs"; fi
if command -v cargo-clippy >/dev/null; then ok cargo-clippy "present"; else miss cargo-clippy "rustup component add clippy"; fi
if command -v ryl >/dev/null; then ok ryl "$(ryl --version)"; else miss ryl "cargo install ryl  OR  uv tool install ryl"; fi
if command -v taplo >/dev/null; then ok taplo "$(taplo --version)"; else miss taplo "cargo install taplo-cli --locked"; fi
if command -v check-jsonschema >/dev/null; then ok check-jsonschema "$(check-jsonschema --version)"; else miss check-jsonschema "uv tool install check-jsonschema"; fi
if command -v pre-commit >/dev/null; then ok pre-commit "$(pre-commit --version)"; else miss pre-commit "brew install pre-commit  OR  pip install pre-commit"; fi
if command -v docker >/dev/null; then ok docker "$(docker --version | head -1)"; else miss docker "(optional) install Docker Desktop"; fi

echo
if [[ "$MISSING" -ne 0 ]]; then
  echo "Some required tools are missing. Install them, then re-run: just doctor"
  exit 1
fi
echo "All required tools present."
