/**
 * Emit circle-lattice geometry IR as JSON (stdout).
 * Usage: npx tsx scripts/emit-circle-lattice.ts [recipe.json]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, normalizeGeometry } from "../src/pieces/circleLattice";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const recipePath =
  process.argv[2] ??
  resolve(root, "pieces/reference/circle-lattice/recipe.json");
const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
const ir = normalizeGeometry(generate(recipe));
process.stdout.write(JSON.stringify(ir));
