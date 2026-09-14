#!/usr/bin/env bash
# Build numbrane-wasm for the browser and emit JS bindings under engines/web/src/wasm/pkg.
# Prefer wasm-pack; fall back to cargo + wasm-bindgen-cli.
#
# Prerequisites (pick one):
#   rustup target add wasm32-unknown-unknown && cargo install wasm-pack
#   brew install rust-wasm wasm-pack
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
RUST_DIR="$ROOT/engines/rust"
CRATE_DIR="$RUST_DIR/crates/numbrane-wasm"
OUT_DIR="$ROOT/engines/web/src/wasm/pkg"

mkdir -p "$(dirname "$OUT_DIR")"
# lld@22 (Homebrew) provides wasm-ld; rust-wasm cargo-config expects it on PATH.
export PATH="${HOME}/.cargo/bin:/opt/homebrew/opt/lld@22/bin:/usr/local/opt/lld@22/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"

RUST_WASM_CONFIG=""
for candidate in \
  /opt/homebrew/opt/rust-wasm/share/rust-wasm/cargo-config.toml \
  /usr/local/opt/rust-wasm/share/rust-wasm/cargo-config.toml
do
  if [[ -f "$candidate" ]]; then
    RUST_WASM_CONFIG="$candidate"
    break
  fi
done

# Wrapper so wasm-pack / cargo pick up Homebrew rust-wasm sysroot when needed.
CARGO_BIN="$(command -v cargo)"
if [[ -n "$RUST_WASM_CONFIG" ]] && ! command -v rustup >/dev/null 2>&1; then
  WRAP="$(mktemp -t numbrane-cargo-XXXXXX)"
  cat >"$WRAP" <<EOF
#!/usr/bin/env bash
exec "$CARGO_BIN" --config "$RUST_WASM_CONFIG" "\$@"
EOF
  chmod +x "$WRAP"
  export CARGO="$WRAP"
  trap 'rm -f "$WRAP"' EXIT
  echo "==> Using Homebrew rust-wasm config via CARGO wrapper"
fi

ensure_wasm_target() {
  if command -v rustup >/dev/null 2>&1; then
    if ! rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
      echo "==> Installing rustup target wasm32-unknown-unknown"
      rustup target add wasm32-unknown-unknown
    fi
    return 0
  fi
  if [[ -n "$RUST_WASM_CONFIG" ]]; then
    return 0
  fi
  echo "error: wasm32-unknown-unknown toolchain not found." >&2
  echo "  Install one of:" >&2
  echo "    rustup target add wasm32-unknown-unknown && cargo install wasm-pack" >&2
  echo "    brew install rust-wasm wasm-pack" >&2
  exit 1
}

ensure_wasm_target

run_cargo() {
  if [[ -n "${CARGO:-}" && -x "${CARGO}" ]]; then
    "$CARGO" "$@"
  else
    cargo "$@"
  fi
}

# wasm-pack's target probe fails on Homebrew rust-wasm (non-rustup sysroot).
# Prefer wasm-pack only when rustup is present; otherwise cargo + wasm-bindgen.
USE_WASM_PACK=0
if command -v rustup >/dev/null 2>&1; then
  if ! command -v wasm-pack >/dev/null 2>&1; then
    echo "==> wasm-pack not found; installing via cargo"
    cargo install wasm-pack --locked 2>/dev/null || cargo install wasm-pack
  fi
  if command -v wasm-pack >/dev/null 2>&1; then
    USE_WASM_PACK=1
  fi
fi

if [[ "$USE_WASM_PACK" -eq 1 ]]; then
  echo "==> wasm-pack build → $OUT_DIR"
  if wasm-pack build "$CRATE_DIR" --target web --release --out-dir "$OUT_DIR"; then
    echo "ok: $OUT_DIR"
    exit 0
  fi
  echo "==> wasm-pack failed; falling back to cargo + wasm-bindgen" >&2
fi

echo "==> cargo build -p numbrane-wasm --release --target wasm32-unknown-unknown"
cd "$RUST_DIR"
run_cargo build -p numbrane-wasm --release --target wasm32-unknown-unknown

WASM_ARTIFACT="$RUST_DIR/target/wasm32-unknown-unknown/release/numbrane_wasm.wasm"
if [[ ! -f "$WASM_ARTIFACT" ]]; then
  echo "error: missing $WASM_ARTIFACT" >&2
  exit 1
fi

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "==> installing wasm-bindgen-cli"
  cargo install wasm-bindgen-cli --locked 2>/dev/null || cargo install wasm-bindgen-cli
fi

mkdir -p "$OUT_DIR"
wasm-bindgen "$WASM_ARTIFACT" \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name numbrane_wasm

echo "ok: $OUT_DIR"
