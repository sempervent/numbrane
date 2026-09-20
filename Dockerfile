# syntax=docker/dockerfile:1.7
# Canonical multi-stage graph. All builds go through: docker buildx bake -f docker-bake.hcl

# ── Python runtime / test / render ──────────────────────────────────
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
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --extra dev
ENV NUMBRANE_ROOT=/src
ENV PATH="/src/engines/python/.venv/bin:$PATH"
CMD ["python", "../../tools/numbrane_cli.py", "--help"]

FROM python-runtime AS python-test
CMD ["pytest", "-q"]

FROM python-runtime AS python-dev
CMD ["pytest", "-q"]

# Narrow local render/seed/export API (no arbitrary shell).
FROM python-runtime AS render-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY docker/__init__.py docker/render_service.py docker/pack_export.py /src/docker/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --python /src/engines/python/.venv/bin/python \
      fastapi "uvicorn[standard]" pillow imageio imageio-ffmpeg
ENV ARTIFACTS_DIR=/artifacts
ENV PYTHONPATH=/src
WORKDIR /src
EXPOSE 8090
CMD ["/src/engines/python/.venv/bin/python", "-m", "uvicorn", "docker.render_service:app", "--host", "0.0.0.0", "--port", "8090"]

# Alias Bake target "export" → same image (FFmpeg encode path lives here).
FROM render-runtime AS export-runtime

FROM python-runtime AS ci
CMD ["pytest", "-q"]

# ── Rust / WASM ─────────────────────────────────────────────────────
FROM rust:1.88-bookworm AS rust-builder
RUN rustup target add wasm32-unknown-unknown
WORKDIR /src
COPY engines/rust ./engines/rust
WORKDIR /src/engines/rust
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/engines/rust/target \
    cargo build -p numbrane-wasm --release --target wasm32-unknown-unknown \
    && mkdir -p /tmp/wasm-out \
    && cp target/wasm32-unknown-unknown/release/numbrane_wasm.wasm /tmp/wasm-out/

FROM rust:1.88-bookworm AS wasm-builder
RUN rustup target add wasm32-unknown-unknown
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo install wasm-bindgen-cli --version 0.2.128 --locked
WORKDIR /out
COPY --from=rust-builder /tmp/wasm-out/numbrane_wasm.wasm /tmp/numbrane_wasm.wasm
RUN mkdir -p /out/pkg \
    && wasm-bindgen /tmp/numbrane_wasm.wasm \
         --target web \
         --out-dir /out/pkg \
         --out-name numbrane_wasm \
    && ls -la /out/pkg

# ── Web deps / build / test ─────────────────────────────────────────
FROM node:22-bookworm AS web-deps
WORKDIR /src/engines/web
COPY engines/web/package.json engines/web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM web-deps AS web-builder
ARG NUMBRANE_BUILD_SHA=unknown
ARG NUMBRANE_BUILD_TIME=
ENV NUMBRANE_BUILD_SHA=${NUMBRANE_BUILD_SHA}
ENV NUMBRANE_BUILD_TIME=${NUMBRANE_BUILD_TIME}
COPY engines/web ./
COPY pieces /src/pieces
# Self-contained: Studio bake never requires host `just latticefall-build`
COPY --from=wasm-builder /out/pkg/ ./src/wasm/pkg/
RUN test -f ./src/wasm/pkg/numbrane_wasm_bg.wasm \
    && test -f ./src/wasm/pkg/numbrane_wasm.js \
    && npm run build

FROM web-deps AS web-test
COPY engines/web ./
COPY pieces /src/pieces
COPY --from=wasm-builder /out/pkg/ ./src/wasm/pkg/
CMD ["npm", "test"]

# ── Studio runtime (static only; API proxied to render service) ─────
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
