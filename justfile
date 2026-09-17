# NUMBRANE justfile — canonical developer command surface.
# Run `just` (no args) to list recipes. Make is a temporary compatibility shim.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := false

export PATH := env_var_or_default("HOME", "") + "/.local/bin:" + env_var_or_default("HOME", "") + "/.cargo/bin:" + env_var("PATH")
export CARGO_BUILD_JOBS := "8"

root := justfile_directory()

# List available recipes (default).
default:
    @just --list --unsorted

# ── bootstrap / doctor ───────────────────────────────────────────────

[group('setup')]
bootstrap:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
    echo "==> Python (uv)"
    (cd "{{root}}/engines/python" && uv sync --extra dev --extra docs --extra render --extra cli)
    echo "==> Web (npm)"
    (cd "{{root}}/engines/web" && npm install)
    echo "==> Rust (cargo fetch)"
    (cd "{{root}}/engines/rust" && CARGO_BUILD_JOBS=8 cargo fetch)
    echo "==> LATTICEFALL WASM (optional; requires wasm32 + wasm-pack)"
    if command -v wasm-pack >/dev/null 2>&1 || command -v rustup >/dev/null 2>&1; then
      bash "{{root}}/engines/rust/scripts/build-wasm.sh" || echo "  (wasm build skipped — run: just latticefall-build)"
    else
      echo "  skip wasm (install rustup/wasm-pack; then: just latticefall-build)"
    fi
    echo "==> Optional tool hints (install if missing)"
    command -v ryl >/dev/null || echo "  install ryl: uv tool install ryl"
    command -v taplo >/dev/null || echo "  install taplo: cargo install taplo-cli --locked"
    command -v check-jsonschema >/dev/null || echo "  install check-jsonschema: uv tool install check-jsonschema"
    command -v pre-commit >/dev/null || echo "  install pre-commit: brew install pre-commit"
    echo "bootstrap complete"

[group('setup')]
doctor:
    bash "{{root}}/tools/doctor.sh"

[group('setup')]
precommit-install:
    #!/usr/bin/env bash
    set -euo pipefail
    pre-commit install --hook-type pre-commit --hook-type pre-push
    echo "Installed git hooks: pre-commit + pre-push"

[group('setup')]
precommit-run:
    pre-commit run --all-files

# ── format ───────────────────────────────────────────────────────────

[group('format')]
fmt: fmt-python fmt-rust fmt-toml
    @echo "fmt ok"

[group('format')]
fmt-python:
    cd "{{root}}/engines/python" && uv run ruff format src tests ../../tools ../../tests

[group('format')]
fmt-rust:
    cd "{{root}}/engines/rust" && cargo fmt --all

[group('format')]
fmt-toml:
    taplo format

[group('format')]
fmt-check: fmt-check-python fmt-check-rust fmt-check-toml
    @echo "fmt-check ok"

[group('format')]
fmt-check-python:
    # Format-check NUMBRANE-authored modules; adapted library style debt is tracked separately.
    cd "{{root}}/engines/python" && uv run ruff format --check src/numbrane_python/rng.py src/numbrane_python/geometry src/numbrane_python/landscape src/numbrane_python/pieces src/numbrane_python/nap src/numbrane_python/__init__.py tests

[group('format')]
fmt-check-rust:
    cd "{{root}}/engines/rust" && cargo fmt --all -- --check

[group('format')]
fmt-check-toml:
    taplo format --check

# ── lint ─────────────────────────────────────────────────────────────

[group('lint')]
lint: lint-python lint-web lint-rust lint-data
    @echo "lint ok"

[group('lint')]
lint-python:
    # Correctness: no undefined names anywhere in the maintained Python engine
    cd "{{root}}/engines/python" && uv run ruff check src/numbrane_python --select F821
    cd "{{root}}/engines/python" && uv run ruff check src/numbrane_python/rng.py src/numbrane_python/geometry src/numbrane_python/landscape src/numbrane_python/pieces src/numbrane_python/nap src/numbrane_python/__init__.py tests
    cd "{{root}}/engines/python" && uv run ruff format --check src/numbrane_python/rng.py src/numbrane_python/geometry src/numbrane_python/landscape src/numbrane_python/pieces src/numbrane_python/nap src/numbrane_python/__init__.py tests

[group('lint')]
lint-web:
    cd "{{root}}/engines/web" && npm run typecheck

[group('lint')]
lint-rust:
    cd "{{root}}/engines/rust" && CARGO_BUILD_JOBS=8 cargo-clippy --workspace --all-targets -- -D warnings
    cd "{{root}}/engines/rust" && cargo fmt --all -- --check

[group('lint')]
lint-data: lint-yaml lint-toml lint-json
    @echo "lint-data ok"

[group('lint')]
lint-yaml:
    ryl check "{{root}}"

[group('lint')]
lint-toml:
    taplo lint
    taplo format --check

[group('lint')]
lint-json:
    bash "{{root}}/tools/lint_json.sh"

# ── test ─────────────────────────────────────────────────────────────

[group('test')]
test: test-python test-web test-rust test-contract test-schema
    @echo "test ok"

[group('test')]
test-python:
    cd "{{root}}/engines/python" && uv run pytest -q

[group('test')]
test-python-fast:
    cd "{{root}}/engines/python" && uv run pytest -q \
      tests/test_rng.py \
      tests/test_schemas.py \
      tests/test_seeds.py \
      tests/test_composition_grammar.py

[group('test')]
test-python-renderer-smoke:
    cd "{{root}}/engines/python" && uv run pytest -q \
      tests/test_render_service.py::test_render_body_validates_piece \
      tests/test_render_service.py::test_export_frame_count

[group('test')]
test-web:
    cd "{{root}}/engines/web" && npm test

# The cross-language LATTICEFALL contract imports the generated wasm-bindgen
# package. Keep that contract in full/local checks; PR-fast deliberately avoids
# rebuilding WASM from a clean checkout.
[group('test')]
test-web-fast:
    cd "{{root}}/engines/web" && npm test -- --exclude tests/latticefall_contract.test.ts

[group('test')]
test-rust:
    cd "{{root}}/engines/rust" && CARGO_BUILD_JOBS=8 cargo test --workspace

[group('test')]
test-contract:
    cd "{{root}}/engines/python" && uv run pytest ../../tests/contract -q

[group('test')]
test-schema:
    cd "{{root}}/engines/python" && uv run pytest tests/test_schemas.py -q
    bash "{{root}}/tools/lint_json.sh"

[group('test')]
test-golden:
    cd "{{root}}/engines/python" && uv run pytest ../../tests/golden -q

[group('test')]
smoke:
    bash "{{root}}/tools/smoke.sh"

# ── docs / build / dev ───────────────────────────────────────────────

[group('docs')]
docs:
    cd "{{root}}/engines/python" && uv run mkdocs build -f ../../mkdocs.yml

[group('docs')]
docs-serve:
    cd "{{root}}/engines/python" && uv run mkdocs serve -f ../../mkdocs.yml -a 127.0.0.1:8000

[group('build')]
build: build-python build-web build-rust
    @echo "build ok"

[group('build')]
build-python:
    cd "{{root}}/engines/python" && uv build

[group('build')]
build-web:
    cd "{{root}}/engines/web" && npm run build

[group('build')]
build-rust:
    cd "{{root}}/engines/rust" && CARGO_BUILD_JOBS=8 cargo build --workspace

# Build LATTICEFALL numbrane-wasm → engines/web/src/wasm/pkg (gitignored; generate in CI/bootstrap).
[group('build')]
latticefall-build:
    bash "{{root}}/engines/rust/scripts/build-wasm.sh"

# Open LATTICEFALL live (requires wasm build).
[group('pieces')]
latticefall: latticefall-build
    cd "{{root}}/engines/web" && npm run dev -- --open /latticefall.html

[group('pieces')]
latticefall-test: latticefall-build
    cd "{{root}}/engines/web" && npm run test:latticefall
    cd "{{root}}/engines/python" && uv run pytest tests/test_latticefall.py -q
    cd "{{root}}/engines/python" && uv run pytest ../../tests/contract/test_latticefall_contract.py -q
    cd "{{root}}/engines/rust" && CARGO_BUILD_JOBS=8 cargo test -p numbrane-core --lib

[group('pieces')]
latticefall-smoke: latticefall-build
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npm run test:e2e

[group('pieces')]
latticefall-replay session="tests/fixtures/latticefall-session.json": latticefall-build
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test tests/e2e/latticefall.spec.ts

[group('pieces')]
latticefall-record:
    @echo "Interactive record: just latticefall  (HUD exports via window.__LATTICEFALL__.exportEvents())"
    @echo "Save JSON under artifacts/ and replay with: just latticefall-replay path/to/events.json"

# ── NUMBRANE LIVE ────────────────────────────────────────────────────

[group('live')]
live:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    echo "NUMBRANE LIVE → http://127.0.0.1:5173/live.html?set=pfl-default"
    echo "OBS output   → http://127.0.0.1:5173/live-output.html?set=pfl-default"
    npm run dev -- --host 127.0.0.1 --port 5173 --open /live.html?set=pfl-default

[group('live')]
live-pfl: live

[group('live')]
live-build:
    cd "{{root}}/engines/web" && npm run build

[group('live')]
live-test:
    cd "{{root}}/engines/web" && npm run test:live

[group('live')]
live-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    npx tsx tests/live_smoke.ts
    npm run test -- tests/live_smoke.test.ts

[group('live')]
live-e2e:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test tests/e2e/live.spec.ts

# Repository hygiene (whole-tree checks). Distinct from pre-commit (staged/tracked files only).
[group('ci')]
repo-audit:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "==> staged vs whole-repo checks"
    echo "pre-commit: operates on tracked/staged paths only (fast local gate)."
    echo "just ci-lite: formats/lints/tests the maintained repository tree."
    cd "{{root}}/engines/python" && uv run ruff check src/numbrane_python --select F821
    echo "repo-audit ok"

[group('dev')]
dev: dev-web

[group('dev')]
dev-web piece="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ "{{piece}}" == "latticefall" ]]; then
      just latticefall-build
      cd "{{root}}/engines/web" && npm run dev -- --open /latticefall.html
    else
      cd "{{root}}/engines/web" && npm run dev
    fi

# ── CI ───────────────────────────────────────────────────────────────

[group('ci')]
ci-lite: fmt-check lint test
    @echo "ci-lite ok"

# Stabilization-phase PR gate: no Rust/WASM build, Docker, browser, exports, or art corpus.
[group('ci')]
pr-fast: fmt-check-python lint-python lint-data lint-web test-web-fast test-python-fast test-python-renderer-smoke studio-catalog-audit
    @echo "pr-fast ok"

[group('ci')]
ci: ci-lite test-golden docs build latticefall-build latticefall-smoke live-test live-smoke live-e2e render-test gallery-smoke studio-test studio-fidelity studio-smoke bake-print
    @echo "ci ok"

# ── NUMBRANE Studio ──────────────────────────────────────────────────

[group('studio')]
studio:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    echo "NUMBRANE Studio → http://127.0.0.1:5173/studio.html"
    echo "Mic stays in the browser (getUserMedia). Docker only serves static assets."
    npm run dev -- --host 127.0.0.1 --port 5173 --open /studio.html

[group('studio')]
studio-test:
    cd "{{root}}/engines/web" && npm run test:studio

[group('studio')]
studio-fidelity:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    npm run test:studio-fidelity
    cd "{{root}}/engines/python"
    uv run pytest tests/test_studio_fidelity.py -q

[group('studio')]
studio-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    npm run test:studio
    npm run test:studio-fidelity
    npm run typecheck

[group('studio')]
studio-e2e:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test tests/e2e/studio.spec.ts

[group('studio')]
studio-animation:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.animation.config.ts

[group('studio')]
studio-all-animation:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.all-animation.config.ts

[group('studio')]
studio-animation-soak:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.soak.config.ts

[group('studio')]
studio-catalog-audit:
    cd "{{root}}/engines/web" && npx tsx scripts/studio-catalog-audit.ts

[group('studio')]
studio-all-generate:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.all-generate.config.ts

[group('studio')]
studio-performance:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.performance.config.ts

[group('studio')]
studio-performance-soak:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.performance-soak.config.ts

[group('studio')]
studio-performance-quick-switch:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.performance-quick-switch.config.ts

[group('studio')]
studio-docker-up:
    #!/usr/bin/env bash
    set -euo pipefail
    export BUILD_SHA="$(git -C "{{root}}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    docker buildx bake -f "{{root}}/docker-bake.hcl" studio render
    docker compose -f "{{root}}/compose.yaml" up -d studio renderer

[group('studio')]
studio-visual-audit: studio-docker-up
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---enable-webgl --ignore-gpu-blocklist}"
    npx playwright test -c playwright.visual-audit.config.ts
    echo "Visual audit → {{root}}/artifacts/visual-audit/index.html"

[group('studio')]
studio-performance-audit: studio-docker-up
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---enable-webgl --ignore-gpu-blocklist}"
    npx playwright test -c playwright.performance-quick-switch.config.ts

[group('studio')]
studio-full-check: pr-fast studio-visual-audit studio-performance-audit
    @echo "studio-full-check ok"

[group('studio')]
studio-audiovisual-nodes:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.performance-soak.config.ts --grep studio-audiovisual-nodes

[group('studio')]
studio-piece-contract:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.piece-contract.config.ts

[group('studio')]
studio-animation-semantics:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    export PW_CHROMIUM_ARGS="${PW_CHROMIUM_ARGS:---use-angle=swiftshader}"
    npx playwright test -c playwright.semantics.config.ts

[group('studio')]
animation-export:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/web"
    npm run test -- --run tests/export_backend.test.ts tests/animation_export_variation.test.ts tests/color.test.ts
    cd "{{root}}/engines/python"
    uv run pytest tests/test_render_service.py -q

# ── Docker Bake ──────────────────────────────────────────────────────

[group('docker')]
bake *ARGS:
    docker buildx bake -f docker-bake.hcl {{ARGS}}

[group('docker')]
bake-test:
    docker buildx bake -f docker-bake.hcl test

[group('docker')]
bake-ci:
    docker buildx bake -f docker-bake.hcl ci

[group('docker')]
bake-print:
    docker buildx bake -f docker-bake.hcl --print

[group('docker')]
docker-studio:
    #!/usr/bin/env bash
    set -euo pipefail
    export BUILD_SHA="$(git -C "{{root}}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    docker buildx bake -f docker-bake.hcl studio render
    mkdir -p "{{root}}/artifacts"
    echo "Studio → http://127.0.0.1:8080/studio.html"
    echo "Microphone: browser getUserMedia (not passed into the container)."
    echo "Exports land in ./artifacts/ via the renderer service."
    docker compose up studio renderer

[group('docker')]
docker-test:
    docker buildx bake -f docker-bake.hcl test

# ── pieces / clean ───────────────────────────────────────────────────

[group('pieces')]
render piece seed="42" width="1920" height="1080" frame="0" format="png":
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py render {{piece}} --seed {{seed}} --width {{width}} --height {{height}} --frame {{frame}} --format {{format}}

[group('pieces')]
gallery:
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py gallery --output ../../artifacts/gallery

[group('pieces')]
seed-test:
    cd "{{root}}/engines/python" && uv run pytest tests/test_seeds.py -q

[group('pieces')]
render-test: seed-test
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/python"
    uv run python ../../tools/numbrane_cli.py render geometry/seed-of-life --seed 42 --width 512 --height 512 --format svg -o ../../artifacts/seed-of-life.svg
    uv run python ../../tools/numbrane_cli.py render reaction-diffusion/reaction-diffusion --seed 42 --width 128 --height 128 --frame 80 -o ../../artifacts/rd-frame80.png
    uv run python ../../tools/numbrane_cli.py render fractals/escape-time --seed 42 --width 256 --height 256 -o ../../artifacts/escape.png
    uv run python ../../tools/numbrane_cli.py seed create reaction-diffusion/reaction-diffusion --seed 42 --frame 40 --width 64 --height 64 -o ../../artifacts/seeds/rd-42
    uv run python ../../tools/numbrane_cli.py seed continue ../../artifacts/seeds/rd-42 --steps 20 -o ../../artifacts/seeds/rd-42-cont
    uv run python ../../tools/numbrane_cli.py seed create growth/differential-growth --seed 7 --frame 30 --width 128 --height 128 -o ../../artifacts/seeds/dg-7
    uv run python ../../tools/numbrane_cli.py seed continue ../../artifacts/seeds/dg-7 --steps 10 -o ../../artifacts/seeds/dg-7-cont
    uv run python ../../tools/numbrane_cli.py seed inspect ../../artifacts/seeds/rd-42 >/dev/null
    uv run python ../../tools/numbrane_cli.py seed from-raster ../../artifacts/rd-frame80.png --transform nutrient -o ../../artifacts/seeds/from-raster-rd
    echo "render-test ok"

[group('pieces')]
explore piece="fractals/strange-attractors" seeds="1,42,137":
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py explore {{piece}} --seeds {{seeds}}

[group('pieces')]
seed-create piece seed="42" frame="100" width="256" height="256":
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py seed create {{piece}} --seed {{seed}} --frame {{frame}} --width {{width}} --height {{height}}

[group('pieces')]
seed-continue artifact steps="50":
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py seed continue {{artifact}} --steps {{steps}}

[group('pieces')]
pieces-test: render-test
    @echo "pieces-test ok"

[group('pieces')]
gallery-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}/engines/python"
    uv run python ../../tools/numbrane_cli.py gallery --seeds 42 --size 256 --frame 60 --pieces geometry/seed-of-life,reaction-diffusion/reaction-diffusion --output ../../artifacts/gallery-smoke
    echo "gallery-smoke ok"

[group('pieces')]
pieces:
    cd "{{root}}/engines/python" && uv run python ../../tools/numbrane_cli.py pieces

[group('clean')]
clean:
    rm -rf "{{root}}/site" "{{root}}/engines/python/.pytest_cache" "{{root}}/engines/web/dist"
    rm -rf "{{root}}/.pytest_cache" "{{root}}/artifacts"
    find "{{root}}" -type d -name '__pycache__' -not -path '*/.venv/*' -not -path '*/node_modules/*' -exec rm -rf {} + 2>/dev/null || true
