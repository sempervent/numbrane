# Temporary Make compatibility shim.
# Canonical developer interface is `just` (see justfile). Do not add logic here.

.PHONY: bootstrap check test docs dev fmt lint schema-check test-python test-web test-rust test-contract

bootstrap:
	just bootstrap

check:
	just ci-lite

test:
	just test

docs:
	just docs

dev:
	just dev

fmt:
	just fmt

lint:
	just lint

schema-check:
	just test-schema

test-python:
	just test-python

test-web:
	just test-web

test-rust:
	just test-rust

test-contract:
	just test-contract
