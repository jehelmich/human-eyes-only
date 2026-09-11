/**
 * Live checkpoint against a served page.
 *
 * Not the benchmark, and not a duplicate of it. `benchmark/compat` calls
 * `transformHtml` against a frozen corpus in-process, so there is a whole layer
 * it cannot reach: the adapter, the response headers, the content-type
 * pass-through, the 500 a refusal becomes, the fact that two *requests* to one
 * URL differ, and that a fixed seed reproduces the page across separate server
 * processes. Those are asserted here or nowhere.
 *
 *   node scripts/live-check.mjs
 *
 * Exits non-zero on the first failed assertion.
 *
 * What it asserts follows the example, and the example now serves carriers: the
 * marked values are drawn as vector outlines and a substitute the publisher
 * wrote stands in the text channel. So the central assertion is no longer "the
 * words are all still there in a different order" but its opposite — the value
 * is not in the response at all, something plausible is, and the two disagree
 * between one load and the next.
 *
 * The nothing-changed half of that has to be read carefully. A carrier paints
 * ink no text-level model can read (see `packages/core/test/browser.mjs`), so
 * the transformed page is compared against the original **with the marked spans
 * removed**: everything the publisher did not mark must read identically, and
 * everything they did mark must be gone from the text. What the carriers
 * actually look like is a pixel question and belongs to `pnpm compat --browser`.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import { isConcealed } from "../packages/core/dist/index.js";
import { createReader } from "../packages/core/test/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8791);

/**
 * The model of what a browser paints, shared with `@heo/core`'s own tests.
 *
 * It used to be a second copy living in this file, and the copies had drifted:
 * one of them treated a container holding a bare text node as painting nothing,
 * which is the shape a decoy takes, so the check that a fabricated value never
 * reaches the reader could not have failed. Independence from the *engine* is
 * what the comment on each copy was defending, and injecting `isConcealed` from
 * the built package is the only thing either of them ever took from it.
 */
const { readingText } = createReader(isConcealed);

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks++;
  if (condition) {
    process.stdout.write(`  pass  ${name}\n`);
    return true;
  }
  failures++;
  process.stdout.write(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}\n`);
  return false;
}

function score(line) {
  process.stdout.write(`  score  ${line}\n`);
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

/** Strips tags. What a Tier A scraper reads: source order, no layout. */
function sourceText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

// --- reading the publisher's marks ----------------------------------------

function attr(node, name) {
  const found = (node.attrs ?? []).find((candidate) => candidate.name === name);
  return found === undefined ? null : found.value;
}

function textOf(node) {
  if (node.nodeName === "#text") return node.value;
  return (node.childNodes ?? []).map(textOf).join("");
}

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
}

/**
 * Every `<heo-protect>` in the source, with the text it marks and the
 * substitutes the publisher supplied.
 *
 * Read from the *original* page, because the element never survives the
 * transform — shipped, it would mark exactly which spans are protected and
 * publish the candidate list.
 */
function readMarks(html) {
  const marks = [];
  walk(parse(html), (node) => {
    if (node.tagName !== "heo-protect") return;
    const alt = attr(node, "alt");
    marks.push({
      value: textOf(node).replace(/\s+/g, " ").trim(),
      alternatives: alt === null ? [] : JSON.parse(decodeEntities(alt)),
      unit: attr(node, "unit") ?? "word",
    });
  });
  return marks;
}

/** One carrier per word, or one for the whole mark where the publisher said so. */
const carriersFor = (mark) => (mark.unit === "phrase" ? 1 : words(mark.value).length);

/**
 * The original as HEO will render it, minus what it draws: every
 * `<heo-protect>` becomes a carrier that holds no text, and every
 * `<heo-chaff>` becomes a node nothing paints.
 */
function withoutMarks(html) {
  const document = parse(html);
  walk(document, (node) => {
    const children = node.childNodes;
    if (children === undefined) return;
    for (let index = children.length - 1; index >= 0; index--) {
      const tag = children[index].tagName;
      if (tag === "heo-protect" || tag === "heo-chaff") children.splice(index, 1);
    }
  });
  return document;
}

const words = (text) => text.split(/\s+/).filter((word) => word !== "");

/**
 * The tokens that make a marked value *this* value rather than one of its
 * substitutes.
 *
 * A whole-phrase match is too weak — a page could publish the figure on its own
 * and pass — and every token is too strong, because a substitute deliberately
 * shares most of the phrase with what it replaces. The difference between the
 * two is the thing that must not be in the response.
 */
function distinguishing(mark) {
  const elsewhere = new Set(mark.alternatives.flatMap((alternative) => words(alternative)));
  return words(mark.value).filter((word) => !elsewhere.has(word));
}

// --- the server -----------------------------------------------------------

async function waitFor(base, attempts = 80) {
  for (let index = 0; index < attempts; index++) {
    try {
      if ((await fetch(`${base}/`)).ok) return true;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  return false;
}

/**
 * Runs the example server and hands `body` its base URL and its log.
 *
 * The log matters: a refusal's reason goes to the origin and deliberately not
 * into the 500, so the only place to assert on it is here.
 */
async function withServer(port, env, body) {
  const server = spawn("node", ["--experimental-strip-types", "src/server.ts"], {
    cwd: join(ROOT, "examples", "node-basic"),
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  server.stdout.on("data", (data) => log.push(String(data)));
  server.stderr.on("data", (data) => log.push(String(data)));
  const base = `http://127.0.0.1:${port}`;
  try {
    if (!(await waitFor(base))) {
      process.stdout.write(`server did not start\n${log.join("")}\n`);
      process.exitCode = 1;
      return false;
    }
    await body(base, log);
    return true;
  } finally {
    server.kill("SIGTERM");
  }
}

const get = async (base, path) => {
  const response = await fetch(`${base}${path}`);
  return { response, body: await response.text() };
};

async function main() {
  const started = await withServer(PORT, {}, async (base, log) => {
    const { body: raw } = await get(base, "/raw/report");
    const { response: heoResponse, body: transformed } = await get(base, "/report");

    const marks = readMarks(raw);
    const loads = [transformed];
    for (let index = 0; index < 9; index++) loads.push((await get(base, "/report")).body);

    section("transport");
    check("HEO announces itself in a response header", heoResponse.headers.get("heo") === "1");
    check(
      "protected response is not cacheable",
      (heoResponse.headers.get("cache-control") ?? "").includes("no-store"),
      `cache-control: ${heoResponse.headers.get("cache-control")}`,
    );
    check(
      "content-length matches the transformed body",
      Number(heoResponse.headers.get("content-length")) === Buffer.byteLength(transformed),
    );
    check("non-HTML responses pass through", (await fetch(`${base}/style.css`)).status === 200);
    check(
      "the font the carriers are drawn from is served",
      (await fetch(`${base}/fonts/public-sans-400.ttf`)).status === 200,
    );

    section("the page is marked, and the marks are the subject");
    check("the publisher marked something", marks.length > 0, `${marks.length} marks`);
    check(
      "every mark carries substitutes",
      marks.every((mark) => mark.alternatives.length >= 2),
      marks
        .filter((mark) => mark.alternatives.length < 2)
        .map((mark) => mark.value)
        .join("; "),
    );

    section("invariant 1 — human-visible content is authoritative");
    // A carrier paints ink and holds no text, so the honest comparison is
    // against the original with the marked spans removed. Everything else on
    // the page must read exactly as it did.
    const expected = readingText(withoutMarks(raw));
    const actual = readingText(transformed);
    check(
      "everything the publisher did not mark reads unchanged",
      actual === expected,
      firstDifference(expected, actual),
    );
    // And the marked spans are not simply missing: one carrier per word, which
    // is what makes the line break where it broke before — except where the
    // publisher asked for the whole mark in one box.
    const drawn = marks.reduce((sum, mark) => sum + carriersFor(mark), 0);
    check(
      "one carrier per marked word, or one per phrase mark",
      (transformed.match(/<svg/g) ?? []).length === drawn,
      `${(transformed.match(/<svg/g) ?? []).length} carriers for ${drawn} expected`,
    );

    section("invariant 6 — the value is not in the response");
    for (const mark of marks) {
      const tokens = distinguishing(mark);
      const text = ` ${decodeEntities(sourceText(transformed))} `;
      const leaked = tokens.filter((token) => text.includes(` ${token} `));
      check(
        `no trace of ${JSON.stringify(mark.value)}`,
        !transformed.includes(mark.value) && leaked.length === 0,
        leaked.length === 0 ? "the whole phrase is in the response" : `leaked ${leaked.join(", ")}`,
      );
    }
    check(
      "and not on any other load either",
      loads.every((body) => marks.every((mark) => !body.includes(mark.value))),
    );

    section("the decoy — what stands in its place");
    const chosen = (body) =>
      marks.map((mark) => mark.alternatives.filter((option) => body.includes(option)));
    check(
      "exactly one supplied substitute per mark, every load",
      loads.every((body) => chosen(body).every((options) => options.length === 1)),
      chosen(transformed)
        .map((options, index) => `${marks[index].value}: ${options.length}`)
        .join("; "),
    );
    check(
      "the substitute is never the value it replaces",
      marks.every((mark) => !mark.alternatives.includes(mark.value)),
    );
    check(
      "no substitute is readable by a person",
      loads.every((body) => {
        const visible = readingText(body);
        return marks.every((mark) =>
          mark.alternatives.every((option) => !visible.includes(option)),
        );
      }),
    );
    const keys = new Set(
      loads.map((body) =>
        chosen(body)
          .map((options) => options[0])
          .join("|"),
      ),
    );
    check("two loads draw different substitutes", keys.size > 1, `${keys.size} distinct sets`);
    const varying = marks.filter(
      (_mark, index) => new Set(loads.map((body) => chosen(body)[index][0])).size > 1,
    ).length;
    score(
      `${varying}/${marks.length} marks drew more than one substitute across ${loads.length} loads`,
    );

    section("invariant 2 — nothing changes except at a tagged element");
    // Verbatim, not merely present: an injected node or a rewritten attribute
    // anywhere the publisher did not tag would break this and nothing else would
    // see it.
    for (const [name, pattern] of [
      ["header", /<header[\s\S]*?<\/header>/],
      ["notes", /<section class="footnotes">[\s\S]*?<\/section>/],
      ["footer", /<footer>[\s\S]*?<\/footer>/],
    ]) {
      const slice = raw.match(pattern);
      check(`the ${name} survives byte for byte`, slice !== null && transformed.includes(slice[0]));
    }
    check(
      "no carrier or container outside the marked section",
      countOutsideMarks(transformed) === 0,
      `${countOutsideMarks(transformed)} outside the marked section`,
    );

    section("invariant 4 — skip list");
    check(
      "code blocks are untouched",
      transformed.includes("segment_margin = (revenue - direct_cost) / revenue"),
    );
    check("form controls are untouched", transformed.includes('placeholder="you@example.com"'));

    section("invariant 9 — idempotence");
    check(
      "the marker is present exactly once",
      (transformed.match(/name="heo"/g) ?? []).length === 1,
    );
    check(
      "a second load is still a single-marker document",
      (loads[1].match(/name="heo"/g) ?? []).length === 1,
    );

    section("per-load randomization");
    check("two loads of the same URL differ", transformed !== loads[1]);
    check(
      "the outlines are redrawn, not reused",
      new Set(loads.map((body) => (body.match(/<path d="([^"]+)"/) ?? [])[1])).size > 1,
    );

    section("nothing marks a protected span");
    check(
      "no publisher element survives into the response",
      loads.every((body) => !/<heo-[a-z]/.test(body)),
    );
    check(
      "no debug attribute survives into the response",
      loads.every((body) => !/\sdata-heo[-\s=>]/.test(body)),
    );
    // One `style` attribute anywhere reinstates a refusal for every strict-CSP
    // page, because a nonce authorises an element and can never authorise an
    // attribute.
    check(
      "HEO emits no style attribute at all",
      loads.every((body) => !/\sstyle=/.test(body)),
    );

    section("cost");
    const growth = ((Buffer.byteLength(transformed) / Buffer.byteLength(raw) - 1) * 100).toFixed(1);
    score(
      `page weight ${Buffer.byteLength(raw)} -> ${Buffer.byteLength(transformed)} bytes (+${growth}%)`,
    );
    const timing = log.join("").match(/(\d+\.\d+)ms/);
    if (timing) score(`transform ${timing[1]}ms`);
  });

  if (!started) return;

  // Invariant 5, which needs a differently configured origin: a fixed seed has
  // to reproduce the page byte for byte, carriers and all. The generator is
  // part of that claim — its jitter and contour order come from the same seed.
  await withServer(PORT + 1, { HEO_SEED: "live-check:fixed" }, async (base) => {
    section("invariant 5 — determinism");
    const first = (await get(base, "/report")).body;
    const second = (await get(base, "/report")).body;
    check("a fixed seed reproduces the response byte for byte", first === second);
  });

  process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`);
  if (failures > 0) process.exitCode = 1;
}

/**
 * Every publisher element is removed from the response, so the marked part of
 * the page is found by the publisher's own class instead.
 */
function countOutsideMarks(html) {
  const start = html.indexOf('<section class="report"');
  if (start === -1) return -1;
  const end = html.indexOf("</section>", start);
  const outside = html.slice(0, start) + html.slice(end);
  return (outside.match(/class="heo-g[ "]|<svg/g) ?? []).length;
}

function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) {
      return `at ${i}:\n        expected ...${a.slice(Math.max(0, i - 40), i + 40)}...\n        actual   ...${b.slice(Math.max(0, i - 40), i + 40)}...`;
    }
  }
  return a.length === b.length ? "" : `length ${a.length} vs ${b.length}`;
}

await main();
