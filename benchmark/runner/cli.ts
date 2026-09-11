#!/usr/bin/env node

/**
 * Benchmark entry point.
 *
 *   pnpm compat                      the gate, identity transform, every tier
 *   pnpm compat -- --transform heo   the gate against the engine
 *   pnpm compat -- --browser         add C3's pixel diff and C4's console check
 *   pnpm compat -- --tiers T0,T4     a subset
 *
 * Exit status is the gate: non-zero when any document fails an absolute gate.
 * A benchmark that reports a failure and exits 0 is a benchmark nobody notices
 * has gone red.
 */

import { checkCarriers } from "../compat/carrier.ts";
import { checkConcealments } from "../compat/concealment.ts";
import { ALL_GATES, STATIC_GATES } from "../compat/gates/index.ts";
import { runCompat } from "../compat/run.ts";
import { loadCorpus, parseTiers } from "../corpus/load.ts";
import { createRenderer } from "./render.ts";
import { buildReport, formatCompat, writeReport } from "./report.ts";
import { TRANSFORMS } from "./transforms.ts";

interface Options {
  transform: string;
  tiers: string;
  filter: string;
  quiet: boolean;
  browser: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    transform: "identity",
    tiers: "",
    filter: "",
    quiet: false,
    browser: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    const next = (): string => {
      index++;
      return (argv[index] ?? "") as string;
    };
    // pnpm 10 forwards the `--` separator itself, so the documented
    // `pnpm compat -- --browser` arrives here with a bare `--` in front of it.
    if (arg === "--") continue;
    if (arg === "--transform") options.transform = next();
    else if (arg === "--tiers") options.tiers = next();
    else if (arg === "--filter") options.filter = next();
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--browser") options.browser = true;
    else throw new Error(`unknown argument ${JSON.stringify(arg)}`);
  }
  return options;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const transform = TRANSFORMS[options.transform];
  if (transform === undefined) {
    console.error(`unknown transform ${JSON.stringify(options.transform)}`);
    return 2;
  }

  const documents = loadCorpus({
    ...(options.tiers === "" ? {} : { tiers: parseTiers(options.tiers) }),
    ...(options.filter === "" ? {} : { filter: options.filter }),
  });

  if (documents.length === 0) {
    console.error("no corpus documents matched");
    return 2;
  }

  const renderer = options.browser ? await createRenderer() : null;
  let compat: Awaited<ReturnType<typeof runCompat>>;
  let concealmentFailures = 0;
  let carrierFailures = 0;
  try {
    // Every kind, checked directly rather than inferred from whichever
    // corpus page happens to draw the broken one.
    if (renderer !== null) {
      const { results, violations } = await checkConcealments(renderer);
      concealmentFailures = violations.length;
      if (!options.quiet) {
        const clean = results.filter((result) => result.neutral).length;
        console.log(`concealments: ${clean}/${results.length} layout-neutral`);
        for (const violation of violations) console.log(`  ${violation.detail}`);
      }
    }

    // Carrier alignment, for the same reason concealments are checked directly:
    // it is a property of the generator's metrics and one declaration, not of
    // whichever corpus page happens to expose a mismatch. It also cannot be a
    // corpus gate, because a carrier is drawn from the publisher's own font
    // file and a corpus document has none.
    if (renderer !== null) {
      const { results, violations } = await checkCarriers(renderer);
      carrierFailures = violations.length;
      if (!options.quiet) {
        const clean = results.filter((result) => result.passed).length;
        console.log(`carriers: ${clean}/${results.length} clean`);
        for (const result of results) {
          const measures = Object.entries(result.measures)
            .map(([name, value]) => `${name}=${value.toFixed(3)}`)
            .join(" ");
          console.log(`  ${result.passed ? "ok  " : "FAIL"} ${result.name} ${measures}`);
          if (result.detail !== "") console.log(`       ${result.detail}`);
        }
      }
    }

    compat = await runCompat(
      documents,
      transform,
      options.browser ? ALL_GATES : STATIC_GATES,
      renderer,
    );
  } finally {
    if (renderer !== null) await renderer.close();
  }

  const suffix = options.browser ? "-browser" : "";
  const file = writeReport(buildReport(compat), `compat-${transform.name}${suffix}`);

  if (!options.quiet) {
    console.log(formatCompat(compat));
    console.log(`report: ${file}`);
  }

  // CP-0's assertion, stated where it is checked rather than only in the
  // roadmap: the harness must be clean against a transformation that provably
  // changes nothing.
  if (transform.name === "identity" && (compat.score < 1 || compat.waived > 0)) {
    console.error("\nidentity transform did not score 100%: this is a harness bug");
    return 1;
  }

  // A stale waiver is a failure in its own right: it means the list is
  // describing a defect that no longer exists, and a list nobody prunes is a
  // list nobody reads.
  if (compat.staleWaivers.length > 0) return 1;
  if (concealmentFailures > 0) return 1;
  if (carrierFailures > 0) return 1;

  return compat.passed + compat.waived === compat.documents ? 0 : 1;
}

process.exit(await main());
