/**
 * Thin helpers over parse5's default tree adapter.
 *
 * We use parse5 rather than a regex or a lighter parser because HEO rewrites
 * documents it did not author: the tree has to survive a round trip through
 * whatever the publisher's framework emitted, including implied tags and
 * malformed markup. `serialize(parse(x))` is the contract everything else here
 * depends on.
 */

import { type DefaultTreeAdapterTypes, parse, parseFragment, serialize } from "parse5";

export type Document = DefaultTreeAdapterTypes.Document;
export type Element = DefaultTreeAdapterTypes.Element;
export type TextNode = DefaultTreeAdapterTypes.TextNode;
export type ChildNode = DefaultTreeAdapterTypes.ChildNode;
export type ParentNode = DefaultTreeAdapterTypes.ParentNode;
export type Node = DefaultTreeAdapterTypes.Node;

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function parseDocument(html: string): Document {
  return parse(html);
}

export function serializeDocument(document: Document): string {
  return serialize(document);
}

export function isElement(node: Node): node is Element {
  return "tagName" in node;
}

export function isTextNode(node: Node): node is TextNode {
  return node.nodeName === "#text";
}

export function isParent(node: Node): node is ParentNode {
  return "childNodes" in node;
}

/**
 * `<template>` keeps its subtree in `content`, not `childNodes`. Missing that
 * means silently skipping everything a framework parked in a template.
 */
export function childrenOf(node: Node): ChildNode[] {
  if (isElement(node) && node.nodeName === "template") {
    return (node as DefaultTreeAdapterTypes.Template).content.childNodes;
  }
  return isParent(node) ? node.childNodes : [];
}

export function getAttr(element: Element, name: string): string | null {
  const attr = element.attrs.find((candidate) => candidate.name === name);
  return attr ? attr.value : null;
}

export function hasAttr(element: Element, name: string): boolean {
  return element.attrs.some((candidate) => candidate.name === name);
}

export function setAttr(element: Element, name: string, value: string): void {
  const attr = element.attrs.find((candidate) => candidate.name === name);
  if (attr) {
    attr.value = value;
    return;
  }
  element.attrs.push({ name, value });
}

/** Depth-first pre-order walk. Returning `false` from `visit` skips a subtree. */
// A visitor that returns nothing has type `() => void`, which is assignable to
// `boolean | void` and not to `boolean | undefined`. Narrowing the union to
// satisfy the rule would force every caller that does not skip a subtree to
// return a value it has no opinion about.
// biome-ignore lint/suspicious/noConfusingVoidType: explained above
export function walk(root: Node, visit: (node: Node) => boolean | void): void {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    if (visit(node) === false) continue;
    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i] as ChildNode);
    }
  }
}

function findFirst(root: Node, predicate: (node: Node) => boolean): Node | null {
  let found: Node | null = null;
  walk(root, (node) => {
    if (found !== null) return false;
    if (predicate(node)) {
      found = node;
      return false;
    }
  });
  return found;
}

export function findElementByTag(root: Node, tagName: string): Element | null {
  const node = findFirst(
    root,
    (candidate) => isElement(candidate) && candidate.tagName === tagName,
  );
  return node === null ? null : (node as Element);
}

export function createElement(
  tagName: string,
  attrs: Record<string, string> = {},
  children: ChildNode[] = [],
): Element {
  const element = {
    nodeName: tagName,
    tagName,
    attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    namespaceURI: HTML_NS,
    childNodes: [] as ChildNode[],
    parentNode: null,
  } as unknown as Element;

  for (const child of children) appendChild(element, child);
  return element;
}

export function createTextNode(value: string): TextNode {
  return {
    nodeName: "#text",
    value,
    parentNode: null,
  } as unknown as TextNode;
}

export function appendChild(parent: ParentNode, child: ChildNode): void {
  child.parentNode = parent;
  parent.childNodes.push(child);
}

/**
 * Replaces a child with a run of nodes: this is how a `heo-*` element becomes
 * the mixture of text and elements that stands in for it.
 */
export function replaceChild(child: ChildNode, replacements: ChildNode[]): void {
  const parent = child.parentNode;
  if (parent === null) return;
  const index = parent.childNodes.indexOf(child);
  if (index === -1) return;
  for (const replacement of replacements) replacement.parentNode = parent;
  parent.childNodes.splice(index, 1, ...replacements);
}

/** Parses a markup fragment into nodes, for injected assets. */
export function fragmentNodes(html: string): ChildNode[] {
  return parseFragment(html).childNodes;
}
