#!/usr/bin/env node
/**
 * Repository hygiene: nothing derivable is tracked, and nothing that is source
 * is ignored.
 *
 * Both directions matter and the second is the more dangerous one. A build
 * output committed by accident is noise; a source file swallowed by an
 * over-broad ignore rule is a repository that does not build from a fresh
 * clone, and nobody notices until someone tries. This tree has several
 * unanchored rules — `lib/`, `es/`, `out/`, `pkg/` — that would match a
 * directory of real source without complaint.
 *
 * Run with `pnpm check:artifacts`.
 */

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((line) => line !== "");

/** Paths that must never be tracked, however they got there. */
const FORBIDDEN = [
  {
    pattern: /(^|\/)(node_modules|\.venv|venv|__pycache__|\.pytest_cache)(\/|$)/,
    why: "dependency or environment directory",
  },
  { pattern: /(^|\/)(dist|build|out|coverage|target|\.turbo|\.next)\//, why: "build output" },
  {
    pattern: /\.(tsbuildinfo|pyc|pyo|map|heapsnapshot|cpuprofile)$/,
    why: "compiler or profiler artifact",
  },
  { pattern: /(^|\/)samples\//, why: "generated sample" },
  { pattern: /\.(log|tmp|bak|orig|rej)$/, why: "scratch file" },
  { pattern: /(^|\/)\.DS_Store$/, why: "operating system file" },
  { pattern: /\.(pem|key|p12|pfx|jks|keystore)$/, why: "credential material" },
];

/**
 * Tracked files above this are not automatically wrong — `pnpm-lock.yaml` is
 * legitimately large — but they should be a deliberate choice, so they are
 * listed rather than merely allowed.
 */
const LARGE_BYTES = 48 * 1024;

/**
 * Extensions that indicate source rather than output. An ignored file with one
 * of these is the failure this half of the check exists for.
 */
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|jsx|rs|py|toml|json|yaml|yml|css|html|md|sh)$/;

/**
 * Directories whose contents are legitimately ignored even when they look like
 * source. A `page/` directory under a benchmark suite holds the fixture page
 * that suite builds before it measures anything: it is HTML, and it is output.
 */
// `CLAUDE.md` is agent working notes and is deliberately untracked; the rules a
// human contributor needs live in `CONTRIBUTING.md` instead.
const IGNORED_ON_PURPOSE =
  /(^|\/)(node_modules|\.venv|venv|__pycache__|target|dist|\.githooks|\.local|\.claude)(\/|$)|(^|\/)results\/[^/]+\.(json|md)$|^research\/|^benchmark\/[^/]+\/page\/|^CLAUDE\.md$/;

let failures = 0;
const report = (message) => {
  console.error(`  fail  ${message}`);
  failures++;
};

// --- Tracked files that should not be -------------------------------------
const tracked = git("ls-files");
for (const path of tracked) {
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(path)) report(`${path} is tracked (${why})`);
  }
}

// --- Ignored files that look like source ----------------------------------
// `--others --ignored` lists what is present on disk and excluded, which is
// exactly the set that would go missing from a fresh clone.
const ignored = git("ls-files", "--others", "--ignored", "--exclude-standard");
for (const path of ignored) {
  if (IGNORED_ON_PURPOSE.test(path)) continue;
  if (!SOURCE_EXTENSIONS.test(path)) continue;
  report(`${path} looks like source but is ignored`);
}

// --- Size report, informational -------------------------------------------
const large = tracked
  .map((path) => {
    try {
      return { path, bytes: statSync(join(ROOT, path)).size };
    } catch {
      return null;
    }
  })
  .filter((entry) => entry !== null && entry.bytes > LARGE_BYTES)
  .sort((a, b) => b.bytes - a.bytes);

const total = tracked.reduce((sum, path) => {
  try {
    return sum + statSync(join(ROOT, path)).size;
  } catch {
    return sum;
  }
}, 0);

console.log(`tracked: ${tracked.length} files, ${(total / 1024).toFixed(0)} KB`);
if (large.length > 0) {
  console.log(`over ${LARGE_BYTES / 1024} KB, listed so growth is deliberate:`);
  for (const { path, bytes } of large) {
    console.log(`  ${(bytes / 1024).toFixed(0).padStart(6)} KB  ${path}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("no derivable tracked, no source ignored");
