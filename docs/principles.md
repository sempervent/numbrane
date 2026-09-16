# Principles

## What NUMBRANE is

NUMBRANE (**Numerical Unified Multilingual Bridge for Reproducible Algorithmic Nonlinear Expression**) produces generative audiovisual art from:

- code and mathematics
- deterministic and carefully randomized algorithms
- simulation and procedural systems
- human interaction
- signal processing / DSP

## What NUMBRANE is not

NUMBRANE is **not** a generative-AI product.

Forbidden in the runtime, generation pipeline, creative engine, or architectural assumptions:

- cloud generative AI / LLM calls for art generation
- remote image-generation / diffusion / inference APIs
- prompt-to-image subsystems
- any required dependency on cloud AI services

Allowed when strictly client-side: small browser-local ML models (TensorFlow.js, ONNX Runtime Web, WebGPU/WASM) for assistive analysis or steering — optional, documented, reproducible, and never a substitute for the mathematical art algorithms.

An LLM may be used **externally** as a software-development tool to edit this repository. It must never become part of NUMBRANE’s art-producing runtime.

## Encouraged techniques

Classical algorithms, procedural generation, numerical methods, cellular automata, dynamical systems, fractals, noise functions, grammars, physical simulations, evolutionary algorithms **without ML models**, signal processing, and deterministic stochastic systems.

## Protocol over language

The NUMBRANE Art Protocol (NAP) is the architectural center. Engines are participants.

## Migration hierarchy

1. mathematical ideas
2. reproducible behavior
3. useful artistic output
4. source provenance
5. implementation (only when still useful)
