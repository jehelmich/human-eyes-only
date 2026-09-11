/**
 * The pieces, tested without a document around them.
 */

import { describe, expect, it } from "vitest";
import { createRunStylesheet } from "../src/assembler/stylesheet.js";
import { pickConcealment, pickSilentConcealment } from "../src/chaff/concealment.js";
import { createRng, digest } from "../src/random/prng.js";

describe("prng", () => {
  it("reproduces a sequence from a seed", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    for (let i = 0; i < 32; i++) expect(a.next()).toBe(b.next());
  });

  it("diverges on a different seed", () => {
    const a = createRng("seed-a");
    const b = createRng("seed-b");
    let same = 0;
    for (let i = 0; i < 32; i++) {
      if (a.next() === b.next()) same++;
    }
    expect(same).toBeLessThan(4);
  });

  it("derives independent streams", () => {
    const root = createRng("root");
    const left = root.derive("left");
    const right = root.derive("right");
    expect(left.next()).not.toBe(right.next());
    expect(createRng("root").derive("left").next()).toBe(createRng("root").derive("left").next());
  });

  it("stays inside its ranges", () => {
    const rng = createRng("range");
    for (let i = 0; i < 500; i++) {
      const value = rng.int(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(rng.int(0)).toBe(0);
  });

  it("shuffles without losing or duplicating elements", () => {
    const rng = createRng("shuffle");
    const items = [...Array(64).keys()];
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });

  it("digests stably", () => {
    expect(digest("abc")).toBe(digest("abc"));
    expect(digest("abc")).not.toBe(digest("abd"));
  });
});

describe("the decoy concealment pool", () => {
  it("is the four kinds that are silent and still read", () => {
    // A decoy cannot carry `aria-hidden`, because trafilatura and
    // Readability.js delete such nodes by default and a decoy they delete does
    // nothing. So it draws only from the kinds already outside the
    // accessibility tree.
    //
    // Pinned by name rather than by count, and the thing the names guard is not
    // what it looks like. A decoy reaching a screen reader is the design
    // working — the tree is a machine channel and every textual channel of a
    // protected span is a fabrication by declaration. What must never reach it
    // is the *true* value, which is why a permuted run carries `aria-hidden`
    // instead. The pool must stay free of any kind that leaves real text
    // announceable.
    const rng = createRng("pool");
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const concealment = pickSilentConcealment(rng);
      expect(concealment.inAccessibilityTree).toBe(false);
      kinds.add(concealment.kind);
    }
    expect([...kinds].sort()).toEqual(["hiddenAttr", "inert", "invisible", "undisplayed"]);
  });

  it("is a strict subset of what chaff draws from", () => {
    // Chaff draws from all five. If the pools were equal, the concealment
    // itself would stop being evidence of which node is the decoy — and if a
    // decoy could draw the fifth it would be announced.
    const rng = createRng("chaff-pool");
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(pickConcealment(rng).kind);
    expect([...kinds].sort()).toEqual([
      "clipped",
      "hiddenAttr",
      "inert",
      "invisible",
      "undisplayed",
    ]);
  });
});

describe("the per-load stylesheet", () => {
  it("shares the shape class between a concealed node and a plain one", () => {
    // The reason the two classes are keyed independently. Keying one class on
    // the (permutation, concealment) pair is 24 bytes per render cheaper and
    // makes a class belong to real runs or to chaff and never to both, so class
    // identity would partition the two from one labelled example and no CSS
    // parser at all. The shape class is what denies that.
    const sheet = createRunStylesheet(createRng("sheet"));
    const run = sheet.add([2, 0, 1], "");
    const chaff = sheet.add([2, 0, 1], "display:none");
    expect(run).not.toBe(chaff);
    const shared = run.split(" ").filter((name) => chaff.split(" ").includes(name));
    expect(shared).toHaveLength(1);
  });

  it("gives every container exactly two classes, declaring something in both", () => {
    // A container with nothing to declare on one axis must not be the one
    // carrying a class that has no rule: that shape is itself a filter.
    const sheet = createRunStylesheet(createRng("sheet"));
    const plain = sheet.add([], "");
    expect(plain.split(" ")).toHaveLength(2);
    for (const name of plain.split(" ")) expect(sheet.rules()).toContain(`.${name}{--n:`);
  });
});
