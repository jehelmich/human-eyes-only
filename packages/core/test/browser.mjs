/**
 * A model of what a browser paints, written independently of the engine.
 *
 * Two callers use it: the unit tests in this directory, and
 * `scripts/live-check.mjs`, which runs it against a real HTTP response. They
 * used to carry a copy each — ninety-odd lines of near-identical code — and the
 * copies had already drifted, which is the whole argument for one file. The
 * rationale both of them recorded survives intact: this is deliberately not the
 * renderer's own logic, so a bug in the renderer has to be made twice to pass.
 * Being independent of the *engine* was always the point; the two of them being
 * independent of *each other* never was.
 *
 * Plain JavaScript, and that is load-bearing rather than lazy. The tests are
 * TypeScript compiled by vitest and the live check is an `.mjs` script run by
 * bare `node`, so the only file shape both can import without a build step or a
 * flag is this one. Types are in `browser.d.mts`.
 *
 * `isConcealed` is injected rather than imported, for the same reason: the
 * tests reach for it in `../src`, the live check reads it out of the built
 * package, and this file should not have to know which. It is the one thing
 * here that does come from the engine, and it comes from there on purpose —
 * a hand-written list of concealments would drift from the ones actually
 * emitted, and that drift would be silent.
 *
 * **What it does with a carrier.** A carrier is an inline `<svg>` of glyph
 * outlines: it paints the value and contains no text at all, so it contributes
 * nothing here and cannot. That is not a gap to be patched — no text-level
 * model can read painted ink, which is why gate C2 stopped checking rendered
 * text and C3's pixel diff took over: compatibility is a gate, not a score.
 * A caller comparing a transformed page against its original must therefore
 * drop the marked spans from the original first, and assert the carriers
 * separately.
 */

import { parse } from "parse5";

/**
 * Never painted. `head` is here because it holds `<title>`, which is chrome
 * rather than page text; one of the two copies of this model omitted it and
 * reported a mismatch on the title for its trouble.
 */
const INVISIBLE = new Set(["head", "script", "style", "template"]);

function attr(node, name) {
  const found = (node.attrs ?? []).find((candidate) => candidate.name === name);
  return found === undefined ? null : found.value;
}

function classesOf(node) {
  return (attr(node, "class") ?? "").split(/\s+/).filter((name) => name !== "");
}

/** Every container HEO emits carries `heo-g`: reordered runs, chaff, decoys. */
function isRunContainer(node) {
  return node.tagName !== undefined && classesOf(node).includes("heo-g");
}

function styleText(root) {
  let css = "";
  const visit = (node) => {
    if (node.tagName === "style") {
      css += (node.childNodes ?? [])
        .filter((child) => child.nodeName === "#text")
        .map((child) => child.value)
        .join("");
      return;
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return css;
}

/**
 * The permutation lives in the stylesheet and so does every concealment, so
 * painting a page means reading the rules first. Deliberately a regex over the
 * emitted CSS rather than a call into the engine's stylesheet builder.
 */
function readSheet(root) {
  const css = styleText(root);
  const orders = new Map();
  for (const match of css.matchAll(/\.([A-Za-z][\w-]*)>:nth-child\((\d+)\)\{order:(\d+)\}/g)) {
    const bucket = orders.get(match[1]) ?? [];
    bucket[Number(match[2]) - 1] = Number(match[3]);
    orders.set(match[1], bucket);
  }
  const declarations = new Map();
  for (const match of css.matchAll(/\.([A-Za-z][\w-]*)\{([^}]*)\}/g)) {
    declarations.set(match[1], `${declarations.get(match[1]) ?? ""};${match[2]}`);
  }
  return { orders, declarations };
}

function runOrderOf(node, orders) {
  for (const name of classesOf(node)) {
    const order = orders.get(name);
    if (order !== undefined) return order;
  }
  return null;
}

/**
 * Builds a reader over the engine's own concealment predicate.
 *
 * @param {(node: { declarations?: string | null; hidden?: boolean }) => boolean} isConcealed
 */
export function createReader(isConcealed) {
  const concealed = (node, sheet) => {
    if (attr(node, "hidden") !== null) return true;
    return classesOf(node).some((name) =>
      isConcealed({ declarations: sheet.declarations.get(name) ?? null }),
    );
  };

  const paint = (node, sheet) => {
    if (node.nodeName === "#text") return node.value;
    if (INVISIBLE.has(node.nodeName)) return "";

    if (isRunContainer(node)) {
      if (concealed(node, sheet)) return "";
      const order = runOrderOf(node, sheet.orders);
      const units = (node.childNodes ?? [])
        .filter((child) => child.tagName !== undefined)
        .map((child, index) => ({
          order: order?.[index] ?? index,
          text: (child.childNodes ?? []).map((grandchild) => paint(grandchild, sheet)).join(""),
        }));
      // A container with no element children holds a bare text node, which is
      // the shape chaff and decoys take when they are not permuted. Treating
      // that as painting nothing — which one copy of this model did — makes the
      // check unable to fail in exactly the case it exists for: a fabricated
      // value that a reader can see. What a browser paints is the text.
      if (units.length === 0)
        return (node.childNodes ?? []).map((child) => paint(child, sheet)).join("");
      return units
        .sort((a, b) => a.order - b.order)
        .map((unit) => unit.text)
        .join("");
    }

    return (node.childNodes ?? []).map((child) => paint(child, sheet)).join("");
  };

  /** Whitespace-normalised painted text of a document or a fragment of one. */
  const readingText = (input) => {
    const document = typeof input === "string" ? parse(input) : input;
    return paint(document, readSheet(document)).replace(/\s+/g, " ").trim();
  };

  return { readingText };
}
