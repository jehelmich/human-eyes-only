/**
 * Known gate failures.
 *
 * A gate that is permanently red stops being read, and a gate that is quietly
 * loosened until it passes stops being a gate. Waivers are the third option: a
 * failure that is understood, attributed to a named cause and owned by an open
 * measurement is reported as waived rather than as clean, and every *other*
 * failure is still red.
 *
 * Two properties keep the list honest. A waived document is never counted as
 * clean, so the compatibility score does not improve by writing a waiver. And a
 * waiver that matches no failure is itself an error, so the list cannot outlive
 * the defect it describes.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Waiver {
  id: string;
  gate: string;
  /**
   * Which transformation the failure belongs to. Identity fails nothing, so an
   * unscoped waiver would read as stale on every identity run.
   */
  transform: string;
  cause: string;
  reason: string;
  /** The open measurement or decision that owns removing it. */
  owner: string;
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), "waivers.json");

export function loadWaivers(): Waiver[] {
  const parsed: unknown = JSON.parse(readFileSync(FILE, "utf8"));
  const waivers = (parsed as { waivers?: Waiver[] }).waivers;
  return Array.isArray(waivers) ? waivers : [];
}

export function waiverKey(id: string, gate: string): string {
  return `${id}::${gate}`;
}

export function waiversFor(transform: string): Waiver[] {
  return loadWaivers().filter((waiver) => waiver.transform === transform);
}
