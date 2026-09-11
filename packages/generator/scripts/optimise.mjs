/**
 * Shrinks the built module with `wasm-opt`, if it is installed.
 *
 * Measured against the unoptimised build, over 1440 renders across nine runs,
 * four sizes and forty seeds: **zero** differences in output. That matters more
 * than the size — the module is one half of invariant 5, and an optimiser that
 * changed a single rounded coordinate would break a fixed seed's byte-identical
 * guarantee without breaking anything that looks like a test.
 *
 *   raw   460,305 -> 361,515  (-21%)
 *   gzip  160,926 -> 147,652  (-8%)
 *   speed   6,912 -> 6,448 ns per carrier  (7% faster)
 *
 * `-O3` rather than `-Oz`: it is the smallest *gzipped*, which is what crosses
 * the wire, and the fastest of the three. `-Oz` wins by 1 KB raw and loses on
 * both of the numbers that matter. Note the contrast with the Rust profile,
 * where `opt-level = "z"` cost 45% of per-call speed — the two optimisers are
 * not making the same trade.
 *
 * **Optional by design.** A contributor should not need binaryen to build the
 * crate, so a missing `wasm-opt` is a note and not an error; the unoptimised
 * module is correct, just larger. `prepack` runs this too, so a published
 * tarball always carries the optimised one.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = join(HERE, "..", "dist", "heo_generator.wasm");

/**
 * The module uses bulk memory, sign extension and non-trapping float casts,
 * which LLVM emits by default for this target and binaryen does not assume.
 * Without these it refuses the input rather than producing a worse module.
 */
const FEATURES = ["--enable-bulk-memory", "--enable-nontrapping-float-to-int", "--enable-sign-ext"];

function which(command) {
  try {
    execFileSync("command", ["-v", command], { shell: true, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(MODULE)) {
  console.error(`optimise: ${MODULE} is missing; run the cargo build first`);
  process.exit(1);
}

if (!which("wasm-opt")) {
  console.log("optimise: wasm-opt not installed, shipping the unoptimised module");
  console.log("          install binaryen to save about 20% of it");
  process.exit(0);
}

const before = statSync(MODULE).size;
execFileSync("wasm-opt", ["-O3", ...FEATURES, MODULE, "-o", MODULE], { stdio: "inherit" });
const after = statSync(MODULE).size;
console.log(
  `optimise: ${before} -> ${after} bytes (${Math.round((1 - after / before) * 100)}% smaller)`,
);
