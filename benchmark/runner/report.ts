/**
 * Report emission.
 *
 * The schema is stable and keyed by commit so that any two points in the
 * project's history are directly comparable. A report format that changes with
 * the code it measures makes its own history unreadable, which defeats the
 * purpose of running nightly.
 *
 * Reports are written under `results/` and are not tracked: they are derived
 * from the tree they describe, and `pnpm check:artifacts` enforces that.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompatReport } from "../compat/run.ts";

export const REPORT_VERSION = "0.1.0";

const BENCHMARK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface Report {
  version: string;
  commit: string;
  generatedAt: string;
  compat: CompatReport | null;
  extraction: null;
}

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function buildReport(compat: CompatReport | null): Report {
  return {
    version: REPORT_VERSION,
    commit: currentCommit(),
    generatedAt: new Date().toISOString(),
    compat,
    extraction: null,
  };
}

export function writeReport(report: Report, name: string): string {
  const dir = join(BENCHMARK_DIR, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** A short human summary. The JSON is the record; this is what a run prints. */
export function formatCompat(compat: CompatReport): string {
  const lines: string[] = [];
  const waived = compat.waived > 0 ? `, ${compat.waived} waived` : "";
  lines.push(
    `compat / ${compat.transform}: ${compat.passed}/${compat.documents} documents clean${waived} ` +
      `over ${compat.gates.join(" ")}`,
  );
  for (const tier of compat.tiers) {
    const note = tier.waived > 0 ? `  (${tier.waived} waived)` : "";
    lines.push(
      `  ${tier.tier.padEnd(16)} ${tier.passed}/${tier.documents}  ${percent(tier.score)}${note}`,
    );
  }
  for (const stale of compat.staleWaivers) {
    lines.push(`  stale waiver: ${stale.id} ${stale.gate} no longer fails — remove it`);
  }
  const causes = Object.entries(compat.causes).sort(([, a], [, b]) => b - a);
  if (causes.length > 0) {
    lines.push("  by cause:");
    for (const [gate, count] of causes) lines.push(`    ${gate.padEnd(4)} ${count}`);
  }
  for (const failure of compat.failures.slice(0, 20)) {
    lines.push(`  ${failure.gate} ${failure.id}: ${failure.detail}`);
  }
  if (compat.failures.length > 20) {
    lines.push(`  ... and ${compat.failures.length - 20} more`);
  }
  return lines.join("\n");
}
