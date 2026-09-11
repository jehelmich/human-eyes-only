/**
 * Carriers and the decoys that follow them.
 *
 * The generator here is a stub (`helpers.ts`), and deliberately so. What the
 * engine owns is where a carrier goes, what is left behind, and what happens
 * when one cannot be drawn — none of which needs a real font, and all of which
 * is testable without a Rust toolchain in the tree that runs it. Whether the
 * outlines actually land on the baseline is a rendering question, and it is
 * answered against the real generator and a real browser in
 * `benchmark/compat/carrier.ts`.
 */

import { describe, expect, it } from "vitest";
import { HeoCarrierError } from "../src/guards/carrier.js";
import { HeoCoverageError } from "../src/guards/coverage.js";
import { getAttr, isElement, parseDocument, walk } from "../src/parser/dom.js";
import { transformHtml } from "../src/transform.js";
import type { CarrierRenderer } from "../src/types.js";
import { CONFIG, FIGURES, PAGE, readingText, stubRenderer } from "./helpers.js";

const seeded = (seed: string) => ({ ...CONFIG, seed });

const page = (body: string): string =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

/**
 * Whether a figure survives as a figure.
 *
 * Not `includes`. A decoy of `13.5%` for `18.4%` contains `3.5%`, which is a
 * different protected value on this page, and a substring test reports it as a
 * leak: the first run of these tests spent a while on exactly that. What an
 * extractor would take is the whole token.
 */
function survives(html: string, figure: string): boolean {
  const escaped = figure.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\d.,])${escaped}`, "u").test(html);
}

function elementsNamed(html: string, tagName: string): { attrs: { name: string }[] }[] {
  const found: { attrs: { name: string }[] }[] = [];
  walk(parseDocument(html), (node) => {
    if (isElement(node) && node.tagName === tagName) found.push(node);
  });
  return found;
}

function textOf(html: string): string {
  let text = "";
  walk(parseDocument(html), (node) => {
    if (isElement(node) && (node.tagName === "script" || node.tagName === "style")) return false;
    if (node.nodeName === "#text") text += (node as { value: string }).value;
  });
  return text;
}

describe("carrier", () => {
  it("substitutes every marked span with inline SVG", () => {
    const { html, stats } = transformHtml(PAGE, CONFIG);
    expect(stats.carriers).toBeGreaterThan(0);
    expect(elementsNamed(html, "svg").length).toBe(stats.carriers);
  });

  it("leaves no readable text where a carrier stands", () => {
    // Every value the page carries: none of them may survive anywhere in the
    // response. This is the property the rest of the design is written around.
    const { html } = transformHtml(PAGE, CONFIG);
    for (const figure of FIGURES) expect(survives(html, figure)).toBe(false);
  });

  it("needs no container of any kind", () => {
    // The whole markup a publisher writes for this page is one element.
    const { stats, html } = transformHtml(
      page("<p>Guidance is <heo-protect>unchanged before September</heo-protect> today.</p>"),
      CONFIG,
    );
    expect(stats.marks).toBe(1);
    expect(stats.carriers).toBe(3);
    expect(html).toContain("Guidance is ");
    expect(html).toContain(" today.");
  });

  it("draws one element per word, so the line still breaks at the spaces", () => {
    const { html } = transformHtml(
      page("<p>before <heo-protect>revenue reached a record</heo-protect> for the group</p>"),
      CONFIG,
    );
    expect(elementsNamed(html, "svg")).toHaveLength(4);
    // The spaces between the words survive as text nodes, which is what lets a
    // browser break the line where it broke before.
    expect(/before\s+for the group/u.test(textOf(html))).toBe(true);
  });

  it("draws the whole mark as one box where the publisher asked for it", () => {
    const { html } = transformHtml(
      page(`<p>before <heo-protect unit="phrase">revenue reached a record</heo-protect> after</p>`),
      CONFIG,
    );
    expect(elementsNamed(html, "svg")).toHaveLength(1);
  });

  it("seeds every carrier differently", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    const seeds = new Set([...html.matchAll(/data-seed="([^"]+)"/g)].map((match) => match[1]));
    expect(seeds.size).toBe(transformHtml(PAGE, CONFIG).stats.carriers);
  });

  it("emits no style attribute, so a nonce is all a strict policy has to grant", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    for (const element of elementsNamed(html, "svg")) {
      expect(element.attrs.some((attr) => attr.name === "style")).toBe(false);
    }
  });

  it("puts the baseline shift in the stylesheet, keyed to the reported descent", () => {
    // An inline SVG's baseline is its bottom margin edge, so the element has to
    // be pushed down by exactly its own descent or every carrier floats.
    const { html } = transformHtml(PAGE, CONFIG);
    expect(html).toContain("display:inline;vertical-align:-3.2px");
  });

  it("draws at the mark's own size rather than the document's", () => {
    const sizes = new Set<number>();
    const spy: CarrierRenderer = {
      render(text, params, seed) {
        sizes.add(params.sizePx);
        return stubRenderer.render(text, params, seed);
      },
    };
    transformHtml(
      page(
        `<h1><heo-protect size="32">headline figure here</heo-protect></h1>` +
          `<p><heo-protect>body figure here</heo-protect></p>`,
      ),
      { ...CONFIG, carrier: { renderer: spy, fontSizePx: 16 } },
    );
    expect([...sizes].sort((a, b) => a - b)).toEqual([16, 32]);
  });

  it("is byte-identical for a fixed seed and different for another", () => {
    expect(transformHtml(PAGE, CONFIG).html).toBe(transformHtml(PAGE, CONFIG).html);
    expect(transformHtml(PAGE, seeded("other")).html).not.toBe(transformHtml(PAGE, CONFIG).html);
  });

  it("is idempotent", () => {
    const once = transformHtml(PAGE, CONFIG);
    expect(transformHtml(once.html, CONFIG).html).toBe(once.html);
  });
});

describe("carrier refusals", () => {
  it("refuses a marked page with no generator rather than serving the value", () => {
    try {
      transformHtml(page("<p><heo-protect>revenue of four million</heo-protect></p>"), {
        seed: "x",
      });
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(HeoCarrierError);
      expect((error as HeoCarrierError).configuration).toBe(true);
      expect((error as Error).message).toContain("carrier.renderer");
    }
  });

  it("refuses a carrier configuration with no type size", () => {
    expect(() =>
      transformHtml(page("<p><heo-protect>revenue of four million</heo-protect></p>"), {
        seed: "x",
        carrier: { renderer: stubRenderer },
      }),
    ).toThrow(HeoCarrierError);
  });

  it("accepts a page whose every mark carries its own size", () => {
    const { stats } = transformHtml(
      page(`<p><heo-protect size="19">revenue of four million</heo-protect></p>`),
      { seed: "x", carrier: { renderer: stubRenderer } },
    );
    expect(stats.carriers).toBe(4);
  });

  it("refuses a span no configured face can draw", () => {
    // Not a carrier refusal any more but a coverage one: HEO was pointed at a
    // span and could not take it, which is the publisher's call through
    // `onUnprotectable` and defaults to refusing. The stub draws printable
    // ASCII and nothing else.
    expect(() =>
      transformHtml(page("<p><heo-protect>revenue of €4.2M</heo-protect></p>"), CONFIG),
    ).toThrow(HeoCoverageError);
  });

  it("serves an undrawable span as text under warn, and counts it", () => {
    const { html, stats } = transformHtml(
      page("<p><heo-protect>revenue of €4.2M</heo-protect></p>"),
      { ...CONFIG, onUnprotectable: "warn" },
    );
    // Two words drawn, one not. The publisher asked for this by name.
    expect(stats.carriers).toBe(2);
    expect(stats.unprotected).toBe(1);
    expect(textOf(html)).toContain("€4.2M");
  });
});

describe("the carrier's face and its instance", () => {
  it("passes the configured variation instance to the generator", () => {
    // The defect this exists for: the generator drew the font's own default
    // instance whatever the page asked for, which for Public Sans is `wght` 100
    // against a page setting 400.
    const { html } = transformHtml(PAGE, {
      ...CONFIG,
      carrier: { ...CONFIG.carrier, variations: { wght: 600 } },
    });
    const weights = new Set([...html.matchAll(/data-wght="([^"]+)"/g)].map((m) => m[1]));
    expect([...weights]).toEqual(["600"]);
  });

  it("leaves the instance at the face's default when none is configured", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    expect(html).toContain('data-wght="default"');
  });

  it("counts the carriers a fallback face drew", () => {
    // A face other than the publisher's still produces a carrier and still
    // takes the value out of the DOM, so it is served rather than refused —
    // and reported, because nothing else in the response would say so.
    const falling: CarrierRenderer = {
      render(text, params, seed) {
        const glyphs = stubRenderer.render(text.replace(/[^\x20-\x7e]/gu, "?"), params, seed);
        if (glyphs === null) return null;
        return /[^\x20-\x7e]/u.test(text) ? { ...glyphs, fallback: true } : glyphs;
      },
    };
    const { stats } = transformHtml(page("<p><heo-protect>revenue of €4.2M</heo-protect></p>"), {
      ...CONFIG,
      carrier: { ...CONFIG.carrier, renderer: falling },
    });
    expect(stats.carriers).toBe(3);
    expect(stats.carrierFallbacks).toBe(1);
    expect(stats.unprotected).toBe(0);
  });

  it("is byte-identical for a fixed seed at a fixed instance, and differs at another", () => {
    const at = (wght: number) =>
      transformHtml(PAGE, { ...CONFIG, carrier: { ...CONFIG.carrier, variations: { wght } } }).html;
    expect(at(400)).toBe(at(400));
    expect(at(400)).not.toBe(at(700));
  });
});

describe("decoy", () => {
  it("puts fabricated text where the value was, and the value nowhere", () => {
    const { html } = transformHtml(
      page(`<p><heo-protect alt='["revenue of $3.6M"]'>revenue of $4.2M</heo-protect></p>`),
      CONFIG,
    );
    expect(html).toContain("revenue of $3.6M");
    expect(survives(html, "$4.2M")).toBe(false);
  });

  it("never republishes a protected value as a decoy", () => {
    // A substitute that happens to be another protected value on the page would
    // publish it in a channel nothing else inspects.
    const source = page(
      `<p><heo-protect alt='["$3.1M"]'>$4.2M</heo-protect> and ` +
        `<heo-protect>$3.1M</heo-protect></p>`,
    );
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(source, seeded(`r${i}`));
      expect(survives(html, "$3.1M")).toBe(false);
      expect(survives(html, "$4.2M")).toBe(false);
    }
  });

  it("says only what the publisher wrote, and nothing where they wrote nothing", () => {
    const source = page(
      `<p><heo-protect alt='["fell to $3.6M","fell to $5.1M"]'>rose to $4.2M</heo-protect>` +
        ` and <heo-protect>margin of 18.4%</heo-protect></p>`,
    );
    const said = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const { html, stats } = transformHtml(source, seeded(`d${i}`));
      expect(stats.decoys).toBe(1);
      const drawn = ["fell to $3.6M", "fell to $5.1M"].filter((option) => html.includes(option));
      expect(drawn).toHaveLength(1);
      said.add(drawn[0] as string);
      // Nothing stands in for the unsupplied mark: HEO invents no substitute.
      expect(html).not.toContain("margin of");
    }
    expect(said.size).toBe(2);
  });

  it("is shaped exactly like a chaff node", () => {
    // If a decoy were shaped differently, "which concealed span is the decoy"
    // would be a selector and the N+M dilution would collapse to N.
    const source = page(
      `<p><heo-protect alt='["fell to $3.6M"]'>rose to $4.2M</heo-protect></p>` +
        `<heo-chaff>The audit committee met twice.</heo-chaff>`,
    );
    const { html } = transformHtml(source, CONFIG);
    const shapes = new Set<string>();
    walk(parseDocument(html), (node) => {
      if (!isElement(node)) return;
      const classes = getAttr(node, "class");
      if (classes === null || !classes.split(/\s+/).includes("heo-g")) return;
      shapes.add(
        node.attrs
          .map((attr) =>
            attr.name === "class" ? `class:${attr.value.split(" ").length}` : attr.name,
          )
          .sort()
          .join(","),
      );
    });
    expect(shapes.size).toBeLessThanOrEqual(2);
    for (const shape of shapes) expect(shape).toContain("class:3");
  });

  it("is never announced to a screen reader", () => {
    // A decoy draws from the concealments that are already outside the
    // accessibility tree, because `aria-hidden` is a default discard rule in
    // trafilatura and Readability.js, and a decoy those two delete is a decoy
    // that does nothing.
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`a${i}`));
      expect(readingText(html)).not.toContain("$3.6M");
      expect(readingText(html)).not.toContain("up from $2.7M");
    }
  });
});
