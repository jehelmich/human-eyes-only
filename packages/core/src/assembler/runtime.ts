/**
 * Runtime assets.
 *
 * Zero client-side JavaScript. If reconstructing the human-readable page needed
 * HEO's own script, an attacker would inspect that script and get a
 * reconstruction function for free. Everything here is server-generated CSS.
 */

import {
  createElement,
  createTextNode,
  type Document,
  type Element,
  findElementByTag,
  getAttr,
  isElement,
  walk,
} from "../parser/dom.js";

/**
 * Document-level marker. HEO announces itself at document level and never at
 * span level: a per-span marker would hand an attacker an index of exactly
 * which spans are worth vision compute. This tag doubles as the idempotence
 * signal.
 */
export const MARKER_NAME = "heo";

/**
 * RFC 6648 deprecates the `X-` convention for new headers, so this is the bare
 * name. It is a declaration that the page is protected, not a private
 * extension.
 */
export const RESPONSE_HEADER = "heo";

/**
 * `order` only exists in flex and grid, so a reordered run has to be a flex
 * container. Three consequences worth knowing before changing this:
 *
 * - units use `white-space:pre`, not `pre-wrap`. Under `pre-wrap` a unit's
 *   trailing space sits at the end of its own line box and hangs, contributing
 *   nothing to max-content width, so words render jammed together;
 * - `flex-wrap` is `wrap`, not `nowrap`. Under `nowrap` the container's width is
 *   its max-content width whatever the viewport allows, so a five-word run on a
 *   phone overflows the page: measured at 390 px, one run was 525 px wide and
 *   grew the document to 533 px. C3's pixel diff caught it on its first run.
 *   Wrapping costs nothing in protection — flex `order` lays items out in order
 *   across lines, so reading order is unchanged — and it converts a horizontal
 *   overflow into an ordinary line break;
 * - an inline-level flex container is still atomic and does not fragment across
 *   the paragraph's line boxes, so a run that does not fit the remaining space
 *   moves to the next line whole, leaving a short line above it. That is the
 *   residue of the typography cost, and it is bounded now rather than
 *   unbounded. See ROADMAP.md.
 *
 * The `[hidden]` rule is not defensive tidying. `[hidden]{display:none}` is a
 * *user-agent* rule, and `.heo-g{display:inline-flex}` is an author rule, so
 * this stylesheet was overriding the browser's own hiding and painting the
 * `hiddenAttr` chaff kind onto the page in full view. Nothing in the engine
 * could see it: `isConcealed()` models what the declarations mean and agreed
 * with itself. C3's pixel diff found it on its first run against the corpus.
 *
 * The `order` values are not here. They are per-run and live in rules emitted
 * by `stylesheet.ts`, because an inline `--p` made the permutation readable
 * with a regex. Neither are the chaff concealments, for the same reason and one
 * more: a nonce can authorise a `<style>` element and can never authorise a
 * `style` attribute, so a strict CSP that would have refused the page now only
 * has to admit this one element.
 */
export const RUNTIME_CSS =
  ".heo-g{display:inline-flex;flex-wrap:wrap;vertical-align:baseline;white-space:normal}" +
  ".heo-g[hidden]{display:none}" +
  ".heo-g>span{white-space:pre}";

export function hasMarker(document: Document): boolean {
  let found = false;
  walk(document, (node) => {
    if (found) return false;
    if (!isElement(node)) return;
    if (node.tagName !== "meta") return;
    if (getAttr(node, "name") === MARKER_NAME) found = true;
  });
  return found;
}

function headOf(document: Document): Element | null {
  return findElementByTag(document, "head");
}

/**
 * Adds the marker and the stylesheet. No-op when there is no head to add to.
 *
 * `nonce` is set only for a response that carries a Content-Security-Policy
 * needing one. A page without a CSP is byte-identical for a fixed seed, which
 * is what keeps invariant 5 intact while the nonce itself comes from
 * `crypto.getRandomValues` rather than the seeded stream.
 */
export function injectRuntime(
  document: Document,
  version: string,
  runRules = "",
  nonce: string | null = null,
): void {
  const head = headOf(document);
  if (head === null) return;

  const marker = createElement("meta", { name: MARKER_NAME, content: version });
  const style = createElement("style", nonce === null ? {} : { nonce }, [
    createTextNode(RUNTIME_CSS + runRules),
  ]);

  marker.parentNode = head;
  style.parentNode = head;
  head.childNodes.unshift(marker, style);
}
