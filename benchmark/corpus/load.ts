/**
 * Corpus loading (`benchmark/corpus/README.md`).
 *
 * Nothing here touches the network. A test that fetches the live web is not a
 * test: it fails for reasons that have nothing to do with the change under
 * review, and it makes two runs of the same commit incomparable.
 *
 * The loader is strict about document shape. A snapshot without `meta.json` is
 * an error rather than a skip, because the failure mode of a lenient loader is
 * a corpus that silently shrinks.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CorpusDocument, CorpusMeta, Tier } from "../runner/types.ts";
import { TIERS } from "../runner/types.ts";

const CORPUS_DIR = dirname(fileURLToPath(import.meta.url));

function readMeta(file: string, id: string): CorpusMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${id}: meta.json is not valid JSON: ${(error as Error).message}`);
  }

  const meta = parsed as Partial<CorpusMeta>;
  if (meta.provenance !== "synthetic" && meta.provenance !== "captured") {
    throw new Error(`${id}: meta.json needs provenance "synthetic" or "captured"`);
  }
  if (typeof meta.archetype !== "string" || meta.archetype === "") {
    throw new Error(`${id}: meta.json needs a non-empty archetype`);
  }
  if (!Array.isArray(meta.keyPhrases)) {
    throw new Error(`${id}: meta.json needs keyPhrases, even if empty`);
  }
  if (meta.provenance === "captured" && (meta.source === "" || meta.licence === "")) {
    throw new Error(`${id}: a captured document needs a source and a licence`);
  }
  return {
    provenance: meta.provenance,
    archetype: meta.archetype,
    source: meta.source ?? "",
    licence: meta.licence ?? "",
    keyPhrases: meta.keyPhrases as string[],
    ...(meta.expectRefusal === true ? { expectRefusal: true } : {}),
    ...(typeof meta.notes === "string" ? { notes: meta.notes } : {}),
  };
}

function loadDocument(tier: Tier, slug: string): CorpusDocument {
  const dir = join(CORPUS_DIR, tier, slug);
  const id = `${tier}/${slug}`;
  const input = readFileSync(join(dir, "input.html"), "utf8");
  const truth = readFileSync(join(dir, "truth.txt"), "utf8");
  return { tier, slug, id, dir, input, truth, meta: readMeta(join(dir, "meta.json"), id) };
}

function slugsIn(tier: Tier): string[] {
  const dir = join(CORPUS_DIR, tier);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !entry.startsWith(".") && statSync(join(dir, entry)).isDirectory())
    .sort();
}

export interface LoadOptions {
  /** Restrict to these tiers. Empty or absent means every tier. */
  tiers?: readonly Tier[];
  /** Restrict to documents whose id contains this substring. */
  filter?: string;
}

export function loadCorpus(options: LoadOptions = {}): CorpusDocument[] {
  const tiers = options.tiers === undefined || options.tiers.length === 0 ? TIERS : options.tiers;
  const documents: CorpusDocument[] = [];
  for (const tier of tiers) {
    for (const slug of slugsIn(tier)) documents.push(loadDocument(tier, slug));
  }
  if (options.filter === undefined || options.filter === "") return documents;
  return documents.filter((document) => document.id.includes(options.filter as string));
}

export function parseTiers(value: string): Tier[] {
  const wanted = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return wanted.map((part) => {
    const match = TIERS.find((tier) => tier === part || tier.startsWith(`${part}-`));
    if (match === undefined) throw new Error(`unknown tier ${JSON.stringify(part)}`);
    return match;
  });
}
