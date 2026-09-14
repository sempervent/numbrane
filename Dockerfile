# syntax=docker/dockerfile:1

FROM python:3.12-slim AS python-dev
WORKDIR /src
RUN pip install --no-cache-dir uv
COPY engines/python/pyproject.toml engines/python/README.md ./engines/python/
COPY engines/python/src ./engines/python/src
COPY engines/python/tests ./engines/python/tests
COPY spec ./spec
COPY pieces ./pieces
COPY tests ./tests
WORKDIR /src/engines/python
RUN uv sync --extra dev
CMD ["uv", "run", "pytest", "-q"]

FROM python:3.12-slim AS docs
WORKDIR /src
RUN pip install --no-cache-dir uv
COPY mkdocs.yml ./
COPY docs ./docs
COPY spec ./spec
COPY engines/python/pyproject.toml engines/python/README.md ./engines/python/
WORKDIR /src/engines/python
RUN uv sync --extra docs
WORKDIR /src
CMD ["uv", "--directory", "engines/python", "run", "mkdocs", "build", "-f", "../../mkdocs.yml"]
