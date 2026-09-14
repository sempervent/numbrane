group "default" {
  targets = ["studio", "python", "docs"]
}

group "test" {
  targets = ["python-test", "web-test"]
}

group "ci" {
  targets = ["ci", "python-test", "web-test", "studio"]
}

group "all" {
  targets = ["studio", "python", "python-test", "web-test", "docs", "ci", "wasm"]
}

target "studio" {
  context = "."
  dockerfile = "Dockerfile"
  target = "studio-runtime"
  tags = ["numbrane-studio:local"]
}

target "python" {
  context = "."
  dockerfile = "Dockerfile"
  target = "python-runtime"
  tags = ["numbrane-python:local"]
}

target "python-test" {
  context = "."
  dockerfile = "Dockerfile"
  target = "python-test"
  tags = ["numbrane-python-test:local"]
}

target "python-dev" {
  context = "."
  dockerfile = "Dockerfile"
  target = "python-dev"
  tags = ["numbrane-python:local"]
}

target "web-test" {
  context = "."
  dockerfile = "Dockerfile"
  target = "web-test"
  tags = ["numbrane-web-test:local"]
}

target "wasm" {
  context = "."
  dockerfile = "Dockerfile"
  target = "wasm-builder"
  tags = ["numbrane-wasm:local"]
}

target "docs" {
  context = "."
  dockerfile = "Dockerfile"
  target = "docs-runtime"
  tags = ["numbrane-docs:local"]
}

target "ci" {
  context = "."
  dockerfile = "Dockerfile"
  target = "ci"
  tags = ["numbrane-ci:local"]
}
