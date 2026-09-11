/**
 * C2 — the document is unchanged except where the publisher wrote a `heo-*`
 * element.
 *
 * Invariant 2. The gate has been rekeyed twice and each time onto something
 * narrower: from "outside a `[data-heo]` region" to "at an element carrying a
 * publisher attribute" to this — the element the publisher wrote, and exactly
 * the run of nodes that replaced it.
 *
 * **Keyed on the input, and the licence is a run rather than a subtree.** A
 * `heo-*` element does not survive: it is replaced by whatever HEO drew, which
 * may be one node or twenty. So a parent's children are split on the publisher's
 * elements, and each surviving segment is matched against the output — the first
 * anchored at the start of the parent, the last at its end, anything between
 * them found by scanning. Everything in a segment is compared as usual, node for
 * node, attribute for attribute; the gaps are the licence.
 *
 * Anchoring both ends rather than scanning forward from the left is not
 * fastidiousness. HEO emits whitespace text nodes of its own around a permuted
 * run, and a left-to-right scan will happily anchor the publisher's trailing
 * space on HEO's — reporting a node added at the end of the parent, on a page
 * where nothing was.
 *
 * That is strictly more of the page than the attribute gate covered, in the one
 * place it matters. `data-heo-chaff` used to licence a chaff node appearing
 * *anywhere* in the tagged element's subtree, because the host resolver
 * descended to find somewhere legal to put it. A `<heo-chaff>` puts itself
 * where it is written, so the licence is that position and nothing else, and a
 * node HEO adds anywhere else in that subtree now fails.
 *
 * The comparison is structural rather than textual — a parallel walk of both
 * trees. Comparing extracted text would miss a moved element, a changed
 * attribute, or a swapped tag, all of which alter the page while leaving its
 * text intact.
 *
 * Two additions are permitted document-wide, because HEO declares itself at
 * document level: the marker `<meta>` and the runtime `<style>`, in `<head>`
 * only.
 *
 * One *modification* is permitted, and it is checked rather than trusted. HEO
 * adds `'nonce-...'` to a `<meta http-equiv="Content-Security-Policy">` so that
 * its own stylesheet is authorised instead of the page being refused. Invariant
 * 3 says never touch security controls, so the exemption is the narrowest
 * statement of what the nonce negotiation claims: the output policy must keep
 * every directive the input had, every source those directives had, add nothing
 * anywhere but a nonce token, add no directive but `style-src-elem`, change no
 * directive outside the style channel, and never introduce `'unsafe-inline'`. A
 * policy edit that is not exactly that fails the gate.
 *
 * The check is written here rather than by calling core's rewriter, so that a
 * bug in the rewriter cannot pass by agreeing with itself.
 */

import {
  childrenOf,
  describe,
  type Element,
  getAttr,
  isElement,
  isTextNode,
  type Node,
  parseDocument,
} from "../../runner/dom.ts";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

/** Written here rather than imported, so the gate does not agree with itself. */
const HEO_TAGS = new Set(["heo-protect", "heo-chaff", "heo-shuffle", "heo-decoy"]);

const MAX_REPORTED = 8;

function isHeoElement(node: Node): boolean {
  return isElement(node) && HEO_TAGS.has(node.tagName);
}

/** The marker and the runtime stylesheet, which belong in `<head>` by design. */
function isDeclaredInjection(node: Node, parent: Node): boolean {
  if (!isElement(node) || !isElement(parent) || parent.tagName !== "head") return false;
  if (node.tagName === "meta") return getAttr(node, "name") === "heo";
  if (node.tagName === "style") {
    const text = childrenOf(node)
      .filter(isTextNode)
      .map((child) => child.value)
      .join("");
    return text.includes(".heo-g");
  }
  return false;
}

function attrsOf(element: Element): string {
  return element.attrs
    .map((attr) => `${attr.name}=${JSON.stringify(attr.value)}`)
    .sort()
    .join(" ");
}

function attrsExcept(element: Element, name: string): string {
  return element.attrs
    .filter((attr) => attr.name !== name)
    .map((attr) => `${attr.name}=${JSON.stringify(attr.value)}`)
    .sort()
    .join(" ");
}

/** The style channel. A nonce may appear here and nowhere else. */
const STYLE_DIRECTIVES = new Set(["style-src", "style-src-elem", "style-src-attr"]);

const NONCE = /^'nonce-[A-Za-z0-9+/\-_]+={0,2}'$/;

function policyOf(element: Element): string | null {
  const equiv = getAttr(element, "http-equiv");
  if (element.tagName !== "meta" || equiv === null) return null;
  if (equiv.toLowerCase() !== "content-security-policy") return null;
  return getAttr(element, "content");
}

function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const tokens = part
      .trim()
      .split(/\s+/u)
      .filter((token) => token !== "");
    const name = tokens.shift();
    if (name === undefined) continue;
    if (!directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

/**
 * Whether the only difference between two policies is a nonce added to the
 * style channel. Anything else — a widened host list, a touched `script-src`, an
 * `'unsafe-inline'`, a dropped source — is a policy HEO had no licence to write.
 */
function isScopedNonceEdit(before: string, after: string): boolean {
  const input = directivesOf(before);
  const output = directivesOf(after);

  for (const [name, values] of input) {
    const now = output.get(name);
    if (now === undefined) return false;
    for (const value of values) if (!now.includes(value)) return false;
    for (const value of now) {
      if (values.includes(value)) continue;
      if (!STYLE_DIRECTIVES.has(name) || !NONCE.test(value)) return false;
    }
  }

  for (const [name, values] of output) {
    if (input.has(name)) continue;
    // The one directive HEO may introduce, and only where `default-src` was
    // governing styles and appending to it would have widened the script
    // channel too. It may be no wider than what already governed styles.
    if (name !== "style-src-elem") return false;
    const governing = input.get("style-src") ?? input.get("default-src") ?? [];
    for (const value of values) {
      if (governing.includes(value)) continue;
      if (!NONCE.test(value)) return false;
    }
  }

  return (
    !after.toLowerCase().includes("'unsafe-inline'") ||
    before.toLowerCase().includes("'unsafe-inline'")
  );
}

/**
 * Whether two nodes are the same node, shallowly.
 *
 * Used only to re-anchor after a licenced run, so it deliberately does not look
 * at children: the anchor's subtree may hold `heo-*` elements of its own and is
 * compared properly once the walk resumes.
 */
function anchors(left: Node, right: Node): boolean {
  if (isTextNode(left) || isTextNode(right)) {
    return isTextNode(left) && isTextNode(right) && left.value === right.value;
  }
  if (isElement(left) && isElement(right)) {
    return left.tagName === right.tagName && attrsOf(left) === attrsOf(right);
  }
  return left.nodeName === right.nodeName;
}

export const c2Outside: Gate = {
  id: "C2",
  name: "unchanged except where the publisher wrote an element",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    let tagged = 0;

    const report = (detail: string): void => {
      if (violations.length < MAX_REPORTED) violations.push({ gate: "C2", detail });
    };

    const compare = (left: Node, right: Node, path: string): void => {
      if (violations.length >= MAX_REPORTED) return;

      if (isTextNode(left) || isTextNode(right)) {
        if (!isTextNode(left) || !isTextNode(right)) {
          report(`${path}: node kind changed`);
          return;
        }
        if (left.value !== right.value) {
          report(`${path}: text changed to ${JSON.stringify(right.value.slice(0, 60))}`);
        }
        return;
      }

      if (isElement(left) !== isElement(right)) {
        report(`${path}: node kind changed`);
        return;
      }

      if (isElement(left) && isElement(right)) {
        if (left.tagName !== right.tagName) {
          report(`${path}: <${left.tagName}> became <${right.tagName}>`);
          return;
        }
        if (attrsOf(left) !== attrsOf(right)) {
          const policyBefore = policyOf(left);
          const policyAfter = policyOf(right);
          const nonced =
            policyBefore !== null &&
            policyAfter !== null &&
            // Only `content` may differ, and only by a scoped nonce.
            attrsExcept(left, "content") === attrsExcept(right, "content") &&
            isScopedNonceEdit(policyBefore, policyAfter);
          if (!nonced) {
            report(`${path}: attributes changed from {${attrsOf(left)}} to {${attrsOf(right)}}`);
            return;
          }
        }
      }

      const kids = childrenOf(left);
      const after = childrenOf(right).filter((child) => !isDeclaredInjection(child, right));

      // A cursor into the output: which node, and how far into it when it is
      // text. The offset is not fastidiousness — unwrapping an element into its
      // own text fuses the publisher's text nodes on either side of it, so a
      // node-for-node cursor would report every standalone mark as a missing
      // sibling.
      let index = 0;
      let offset = 0;
      let licenced = false;

      const advance = (): void => {
        const node = after[index];
        if (node !== undefined && isTextNode(node) && offset >= node.value.length) {
          index++;
          offset = 0;
        }
      };

      for (const child of kids) {
        if (violations.length >= MAX_REPORTED) return;
        if (isHeoElement(child)) {
          tagged++;
          licenced = true;
          continue;
        }

        if (isTextNode(child)) {
          const want = child.value;
          if (want === "") continue;
          if (licenced) {
            // Whatever HEO drew for the elements that stood here sits between
            // the last anchor and this text. Find where the publisher's page
            // picks up again.
            let found = false;
            for (let probe = index; probe < after.length; probe++) {
              const node = after[probe] as Node;
              if (!isTextNode(node)) continue;
              const at = node.value.indexOf(want, probe === index ? offset : 0);
              if (at === -1) continue;
              index = probe;
              offset = at + want.length;
              found = true;
              break;
            }
            if (!found) {
              report(
                `${path}: text ${JSON.stringify(want.slice(0, 40))} is missing from the output`,
              );
              return;
            }
            licenced = false;
          } else {
            const node = after[index];
            if (node === undefined || !isTextNode(node) || !node.value.startsWith(want, offset)) {
              report(`${path}: text ${JSON.stringify(want.slice(0, 40))} changed or is missing`);
              return;
            }
            offset += want.length;
          }
          advance();
          continue;
        }

        if (licenced) {
          let found = -1;
          for (let probe = index; probe < after.length; probe++) {
            const node = after[probe] as Node;
            if (isTextNode(node)) continue;
            if (anchors(child, node)) {
              found = probe;
              break;
            }
          }
          if (found === -1) {
            report(`${path}: ${describe(child, "")} is missing from the output`);
            return;
          }
          index = found;
          offset = 0;
          licenced = false;
        }

        const node = after[index];
        if (node === undefined || offset !== 0) {
          report(`${path}: ${describe(child, "")} is missing from the output`);
          return;
        }
        compare(child, node, describe(child, path));
        index++;
        offset = 0;
      }

      // A trailing licenced run absorbs whatever is left; nothing else may.
      if (!licenced && index < after.length) {
        report(`${path}: ${after.length - index} node(s) added where the publisher wrote nothing`);
      }
    };

    if (subject.refusal === null) {
      compare(parseDocument(subject.input), parseDocument(subject.output), "");
    }

    return {
      gate: "C2",
      passed: violations.length === 0,
      violations,
      measures: { tagged },
    };
  },
};
