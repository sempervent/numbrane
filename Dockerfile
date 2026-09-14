# syntax=docker/dockerfile:1.7

# ── Python runtime / test ───────────────────────────────────────────
FROM python:3.12-slim AS python-runtime
WORKDIR /src
RUN pip install --no-cache-dir uv
COPY engines/python/pyproject.toml engines/python/README.md ./engines/python/
COPY engines/python/src ./engines/python/src
COPY engines/python/tests ./engines/python/tests
COPY spec ./spec
COPY pieces ./pieces
COPY tools ./tools
COPY tests ./tests
WORKDIR /src/engines/python
RUN --mount=type=cache,target=/root/.cache/uv uv sync --extra dev
ENV NUMBRANE_ROOT=/src
CMD ["uv", "run", "python", "../../tools/numbrane_cli.py", "--help"]

FROM python-runtime AS python-test
CMD ["uv", "run", "pytest", "-q"]

FROM python-runtime AS python-dev
CMD ["uv", "run", "pytest", "-q"]

# ── Rust / WASM (optional heavy target) ─────────────────────────────
FROM rust:1.85-bookworm AS rust-builder
RUN rustup target add wasm32-unknown-unknown
WORKDIR /src
COPY engines/rust ./engines/rust
WORKDIR /src/engines/rust
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/engines/rust/target \
    cargo build -p numbrane-wasm --release --target wasm32-unknown-unknown

FROM rust-builder AS wasm-builder
WORKDIR /out
RUN mkdir -p /out/wasm && \
    cp target/wasm32-unknown-unknown/release/numbrane_wasm.wasm /out/wasm/ 2>/dev/null || true

# ── Web deps / build / test ─────────────────────────────────────────
FROM node:22-bookworm AS web-deps
WORKDIR /src/engines/web
COPY engines/web/package.json engines/web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM web-deps AS web-builder
COPY engines/web ./
COPY pieces /src/pieces
# Use repo-built WASM artifacts when present (produced by `just latticefall-build`)
RUN npm run build

FROM web-deps AS web-test
COPY engines/web ./
COPY pieces /src/pieces
CMD ["npm", "test"]

# ── Studio runtime ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS studio-runtime
COPY --from=web-builder /src/engines/web/dist /usr/share/nginx/html
COPY docker/nginx-studio.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
# Microphone stays in the browser via getUserMedia — not passed into the container.
CMD ["nginx", "-g", "daemon off;"]

# ── Docs ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS docs-builder
WORKDIR /src
RUN pip install --no-cache-dir uv
COPY mkdocs.yml ./
COPY docs ./docs
COPY spec ./spec
COPY engines/python/pyproject.toml engines/python/README.md ./engines/python/
WORKDIR /src/engines/python
RUN --mount=type=cache,target=/root/.cache/uv uv sync --extra docs
WORKDIR /src
RUN uv --directory engines/python run mkdocs build -f ../../mkdocs.yml

FROM nginx:1.27-alpine AS docs-runtime
COPY --from=docs-builder /src/site /usr/share/nginx/html
EXPOSE 8080

FROM docs-runtime AS docs

# ── CI ──────────────────────────────────────────────────────────────
FROM python-runtime AS ci
CMD ["uv", "run", "pytest", "-q"]
