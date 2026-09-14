# reference/circle-lattice

Architectural probe — not a flagship artwork.

Produces a hexagonal circle lattice (Seed-of-Life style) as **geometry IR** in `cartesian-2d` space.

## Engines

- Python: `numbrane_python.pieces.circle_lattice`
- TypeScript: `engines/web/src/pieces/circleLattice.ts`

## Contract

Both engines consume `recipe.json` and must agree on normalized geometry IR within absolute tolerance `1e-9`.

Renderer SVG/PNG parity is **optional** and not the acceptance criterion.
