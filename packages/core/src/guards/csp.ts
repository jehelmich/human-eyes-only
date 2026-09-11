/**
 * Content-Security-Policy negotiation.
 *
 * Everything HEO emits depends on one `<style>` element: the runtime rules, the
 * per-run `order` values, and every chaff concealment. A policy that restricts
 * `style-src` without `'unsafe-inline'` blocks it, and what that produces is
 * not a degraded page. It is the worst output this project can make: the
 * permutation is never inverted, *and* every chaff node paints. Measured on the
 * corpus, a strict-CSP document rendered as
 *
 *   Trial conversion improved to 6.3% from 4.8% overTrial conversion improved
 *   to 4.6% from 6.2% over the quarter. the quarter.
 *
 * — the publisher's real sentence interleaved with a fabricated one, in plain
 * sight, with figures that are not theirs.
 *
 * HEO used to refuse such a page. It authorises the one element instead now,
 * with a nonce, because the reason a nonce could not help has been removed: a
 * nonce applies to a `<style>` **element** and has no meaning at all for a
 * `style`
 * **attribute**, which is authorised by `'unsafe-inline'` or by a per-value
 * hash under `'unsafe-hashes'` and by nothing else. HEO no longer emits a
 * `style` attribute anywhere, so what it needs from a policy is now exactly one
 * thing a nonce can grant.
 *
 * The edit is additive and scoped, and both words are load-bearing. A nonce
 * token widens a source list by exactly the elements that carry it; it adds no
 * host, no scheme, and never `'unsafe-inline'`. It goes on the directive that
 * already governs `<style>` elements and on no other — and where that directive
 * is `default-src`, which also governs scripts, an explicit `style-src-elem` is
 * added carrying `default-src`'s own values plus the nonce, so nothing outside
 * the style channel changes. A policy a nonce cannot satisfy is still refused.
 *
 * **Scope: this sees `<meta http-equiv>` only.** A policy delivered in a
 * response header is invisible from inside `transformHtml`, which is handed a
 * string. An adapter that can see headers passes the policy in through
 * `contentSecurityPolicy` and reads the rewritten one back out of
 * `stats.csp.headerPolicy`; `@heo/middleware` does. The decision stays here, in
 * core, where it is testable without a socket.
 */

const META_CSP = /<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/giu;

const CONTENT = /content\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/iu;

/** The fallback chain CSP applies to a `<style>` element, most specific first. */
const STYLE_ELEMENT_CHAIN = ["style-src-elem", "style-src", "default-src"] as const;

type CspPolicyName = (typeof STYLE_ELEMENT_CHAIN)[number];

interface StyleDirective {
  name: CspPolicyName;
  values: string[];
}

function parsePolicy(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const tokens = part
      .trim()
      .split(/\s+/u)
      .filter((token) => token !== "");
    const name = tokens.shift();
    if (name === undefined) continue;
    // A repeated directive is ignored by browsers after the first occurrence.
    if (!directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

function has(values: string[], token: string): boolean {
  return values.some((value) => value.toLowerCase() === token);
}

/**
 * Which directive actually governs a `<style>` element under this policy, or
 * null when the policy does not constrain styles at all.
 */
function styleElementDirective(policy: string): StyleDirective | null {
  const directives = parsePolicy(policy);
  for (const name of STYLE_ELEMENT_CHAIN) {
    const values = directives.get(name);
    if (values !== undefined) return { name, values };
  }
  return null;
}

/**
 * Whether a policy already permits the `<style>` element HEO injects.
 *
 * Only the element half is asked about. HEO emits no `style` attribute, so
 * `style-src-attr` is none of its business — a policy of `style-src
 * 'unsafe-inline'; style-src-attr 'none'` was refused while HEO still wrote
 * attributes, and transforms cleanly now.
 */
export function permitsStyleElement(policy: string): boolean {
  const directive = styleElementDirective(policy);
  if (directive === null) return true;
  return has(directive.values, "'unsafe-inline'");
}

/**
 * Whether adding a nonce would satisfy the policy.
 *
 * `'none'` is the one that cannot be: the grammar admits it only as a source
 * list of its own, browsers disagree about what `'none' 'nonce-x'` means, and a
 * publisher who wrote `'none'` said no rather than said which. That page is
 * still refused, which is why `HeoCspError` remains.
 */
function canNonceStyleElement(policy: string): boolean {
  const directive = styleElementDirective(policy);
  if (directive === null) return true;
  if (has(directive.values, "'unsafe-inline'")) return true;
  return !has(directive.values, "'none'");
}

/**
 * The policy with `'nonce-...'` added to the directive that governs `<style>`
 * elements, and to nothing else.
 *
 * Everything the publisher wrote is preserved verbatim: the rewrite appends one
 * token to one segment, or appends one new `style-src-elem` segment where the
 * governing directive is `default-src` and touching it would widen the script
 * channel as well.
 */
export function withStyleNonce(policy: string, nonce: string): string {
  const directive = styleElementDirective(policy);
  const token = `'nonce-${nonce}'`;
  if (directive === null || has(directive.values, "'unsafe-inline'")) return policy;

  if (directive.name === "default-src") {
    const trimmed = policy.trim().replace(/;\s*$/u, "");
    return `${trimmed}; style-src-elem ${[...directive.values, token].join(" ")}`;
  }

  const parts = policy.split(";");
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index] as string;
    const name = part.trim().split(/\s+/u)[0];
    if (name === undefined || name.toLowerCase() !== directive.name) continue;
    parts[index] = `${part.replace(/\s+$/u, "")} ${token}`;
    return parts.join(";");
  }
  return policy;
}

/**
 * A nonce is worth having only if it cannot be guessed, so it does **not** come
 * from the seeded PRNG (CONTRIBUTING.md, invariant 5). The invariant survives
 * because a nonce is emitted only for a response that carries a policy needing
 * one: a page without a CSP is byte-identical for a fixed seed exactly as
 * before, and the determinism tests are unchanged.
 *
 * 128 bits, hex. Hex is a subset of CSP's `base64-value` grammar, so it is a
 * valid nonce token and needs no base64 encoder in a package that must run
 * unchanged on Node, Deno, Bun and edge runtimes.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Every `<meta http-equiv="Content-Security-Policy">` policy in a document. */
function metaPolicies(html: string): string[] {
  const policies: string[] = [];
  for (const tag of html.matchAll(META_CSP)) {
    const match = CONTENT.exec(tag[0]);
    if (match === null) continue;
    policies.push(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return policies;
}

export interface CspFinding {
  policy: string;
  source: "meta" | "header";
  /** Why this policy could not be satisfied. */
  reason: string;
}

export type CspMode = "nonce" | "refuse";

export interface CspPlan {
  /** Whether a nonce must be generated and stamped on the injected `<style>`. */
  needsNonce: boolean;
  /** The adapter-supplied response-header policy, when it is the one restricting. */
  headerPolicy: string | null;
}

/**
 * Decides what to do about every policy attached to this response.
 *
 * CSP composes: a resource has to be allowed by all of them, so every
 * restrictive policy is nonced, and a single one a nonce cannot satisfy refuses
 * the page.
 */
export function planCsp(html: string, headerPolicy: string | null, mode: CspMode): CspPlan {
  const found: CspFinding[] = [];
  for (const policy of metaPolicies(html)) {
    if (!permitsStyleElement(policy)) found.push({ policy, source: "meta", reason: "" });
  }
  if (headerPolicy !== null && !permitsStyleElement(headerPolicy)) {
    found.push({ policy: headerPolicy, source: "header", reason: "" });
  }

  if (found.length === 0) return { needsNonce: false, headerPolicy: null };

  if (mode === "refuse") {
    const first = found[0] as CspFinding;
    throw new HeoCspError({
      ...first,
      reason: 'HEO is configured with onRestrictiveCsp: "refuse", so it does not touch a policy',
    });
  }

  for (const finding of found) {
    if (!canNonceStyleElement(finding.policy)) {
      throw new HeoCspError({
        ...finding,
        reason:
          "the directive governing <style> elements is 'none', which a nonce cannot widen " +
          "without contradicting it",
      });
    }
  }

  return {
    needsNonce: true,
    headerPolicy: found.some((finding) => finding.source === "header") ? headerPolicy : null,
  };
}

export class HeoCspError extends Error {
  readonly policy: string;
  readonly source: "meta" | "header";

  constructor(finding: CspFinding) {
    super(
      `HEO refused to transform a page whose Content-Security-Policy blocks the stylesheet ` +
        `it injects (from the ${finding.source}): ${finding.policy}\n` +
        `Refused because ${finding.reason}.\n` +
        "Without that stylesheet the permutation is never inverted and chaff paints in full " +
        "view, which corrupts the page for readers. Allow HEO's one <style> element — it " +
        "will add its own nonce to your style directive when onRestrictiveCsp is left at its " +
        'default of "nonce" — or exclude this route from HEO.',
    );
    this.name = "HeoCspError";
    this.policy = finding.policy;
    this.source = finding.source;
  }
}
