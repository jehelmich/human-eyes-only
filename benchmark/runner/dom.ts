/**
 * A minimal DOM layer for the benchmark, built directly on parse5.
 *
 * It deliberately does not import `@heo/core`'s own parser helpers. A gate that
 * checks the engine with the engine's own utilities is a weaker gate: a bug in
 * a shared walker hides itself on both sides of the comparison. The duplication
 * is small and it is the point.
 */

import { type DefaultTreeAdapterTypes, parse, serialize } from "parse5";

export type Document = DefaultTreeAdapterTypes.Document;
export type Element = DefaultTreeAdapterTypes.Element;
export type TextNode = DefaultTreeAdapterTypes.TextNode;
export type Node = DefaultTreeAdapterTypes.Node;

export function parseDocument(html: string): Document {
  return parse(html);
}

export function serializeDocument(document: Document): string {
  return serialize(document);
}

export function isElement(node: Node): node is Element {
  return "tagName" in node && "attrs" in node;
}

export function isTextNode(node: Node): node is TextNode {
  return node.nodeName === "#text";
}

export function childrenOf(node: Node): Node[] {
  return "childNodes" in node ? (node.childNodes as Node[]) : [];
}

export function getAttr(element: Element, name: string): string | null {
  return element.attrs.find((attr) => attr.name === name)?.value ?? null;
}

// A visitor that returns nothing has type `() => void`, which is assignable to
// `boolean | void` and not to `boolean | undefined`. Narrowing the union to
// satisfy the rule would force every caller that does not skip a subtree to
// return a value it has no opinion about.
// biome-ignore lint/suspicious/noConfusingVoidType: explained above
export function walk(root: Node, visit: (node: Node) => boolean | void): void {
  if (visit(root) === false) return;
  for (const child of childrenOf(root)) walk(child, visit);
}

/**
 * Subtrees whose text is not part of the visible document. This mirrors the
 * engine's skip list because the two answer the same question, not because the
 * gate trusts the engine's answer.
 */
export const NON_VISIBLE_TAGS = new Set(["script", "style", "template", "head", "noscript"]);

export function visibleText(root: Node): string {
  let text = "";
  walk(root, (node) => {
    if (isElement(node) && NON_VISIBLE_TAGS.has(node.tagName)) return false;
    if (isTextNode(node)) text += node.value;
  });
  return text;
}

/** Concatenates a subtree's text, including parts a browser never paints. */
export function subtreeText(node: Node): string {
  if (isTextNode(node)) return node.value;
  let text = "";
  for (const child of childrenOf(node)) text += subtreeText(child);
  return text;
}

/**
 * Is this script serialized data rather than code?
 *
 * One answer, written once, because two gates asked it and disagreed: a value
 * in a `text/template` was exempt from C5's byte-equality check and invisible
 * to the side-channel scan at the same time. The scan is gone, and the answer
 * is not: executable script is untouchable and everything else in a `<script>`
 * is data this gate has no opinion about.
 */
const DATA_SCRIPT_TYPE = /json|^text\/plain$|^text\/template$/iu;

export function isDataScript(type: string | null): boolean {
  return type !== null && DATA_SCRIPT_TYPE.test(type);
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function elementsMatching(root: Node, selectors: readonly string[]): Element[] {
  const found: Element[] = [];
  walk(root, (node) => {
    if (!isElement(node)) return;
    if (selectors.some((selector) => matchesSelector(node, selector))) found.push(node);
  });
  return found;
}

/**
 * Attribute and class selectors only, which is the whole of what HEO's region
 * configuration accepts.
 */
export function matchesSelector(element: Element, selector: string): boolean {
  const attribute = /^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(selector);
  if (attribute !== null) {
    const value = getAttr(element, attribute[1] as string);
    if (value === null) return false;
    return attribute[2] === undefined || value === attribute[2];
  }
  const klass = /^\.([\w-]+)$/.exec(selector);
  if (klass !== null) {
    const value = getAttr(element, "class");
    return value?.split(/\s+/u).includes(klass[1] as string) === true;
  }
  const tag = /^([a-zA-Z][\w-]*)$/.exec(selector);
  return tag !== null && element.tagName === tag[1];
}

export function describe(node: Node, path: string): string {
  if (isTextNode(node)) return `${path}#text`;
  return isElement(node) ? `${path}/${node.tagName}` : `${path}/${node.nodeName}`;
}
