group "default" {
  targets = ["docs", "python-dev"]
}

target "docs" {
  context = "."
  dockerfile = "Dockerfile"
  target = "docs"
  tags = ["numbrane-docs:local"]
}

target "python-dev" {
  context = "."
  dockerfile = "Dockerfile"
  target = "python-dev"
  tags = ["numbrane-python:local"]
}
