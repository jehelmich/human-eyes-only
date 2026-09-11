/**
 * The publisher's markup surface: three elements, and every way of writing one
 * that does nothing.
 *
 * Markup that does nothing is a refusal rather than a shrug, and the reason is
 * that HEO removes the element before serializing — so a mistake leaves a page
 * that looks marked with nothing in the response to notice.
 */

import { describe, expect, it } from "vitest";
import { HeoMarkupError } from "../src/guards/markup.js";
import { parseDocument, serializeDocument } from "../src/parser/dom.js";
import { discoverMarkup, unwrapHeoElements } from "../src/parser/marks.js";
import { transformHtml } from "../src/transform.js";
import { CONFIG, readingText } from "./helpers.js";

const page = (body: string): string =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

const problems = (body: string): { source: string; reason: string }[] => {
  try {
    transformHtml(page(body), CONFIG);
  } catch (error) {
    if (error instanceof HeoMarkupError) return error.problems;
    throw error;
  }
  throw new Error("expected a markup refusal");
};

describe("heo-protect", () => {
  it("marks the span and leaves nothing of it behind", () => {
    const { html, stats } = transformHtml(
      page("<p>Revenue of <heo-protect>four point two million</heo-protect> today.</p>"),
      CONFIG,
    );
    expect(stats.marks).toBe(1);
    expect(html).not.toContain("four point two");
    expect(html).not.toContain("heo-protect");
  });

  it("reads the substitutes off the element as JSON", () => {
    const { html } = transformHtml(
      page(`<p><heo-protect alt='["$3.9M","$4.6M"]'>$4.2M</heo-protect></p>`),
      CONFIG,
    );
    expect(/\$3\.9M|\$4\.6M/u.test(html)).toBe(true);
    expect(html).not.toContain("$4.2M");
  });

  it("refuses a substitute list that is not JSON", () => {
    // The bare-string shorthand is gone: one code path, and `alt="[oops"` is a
    // mistake rather than a value.
    const [first] = problems(`<p><heo-protect alt='[oops'>$4.2M</heo-protect></p>`);
    expect(first?.source).toBe("heo-protect alt");
    expect(first?.reason).toContain("not valid JSON");
  });

  it("refuses a substitute list that is JSON but not a list of strings", () => {
    expect(problems(`<p><heo-protect alt='"one"'>$4.2M</heo-protect></p>`)[0]?.reason).toContain(
      "not an array",
    );
    expect(problems(`<p><heo-protect alt='[1]'>$4.2M</heo-protect></p>`)[0]?.reason).toContain(
      "number",
    );
    expect(problems(`<p><heo-protect alt='[""]'>$4.2M</heo-protect></p>`)[0]?.reason).toContain(
      "empty string",
    );
  });

  it("refuses a substitute equal to the value it would replace", () => {
    expect(
      problems(`<p><heo-protect alt='["$4.2M"]'>$4.2M</heo-protect></p>`)[0]?.reason,
    ).toContain("identical");
  });

  it("refuses a mark that wraps no text", () => {
    expect(problems("<p><heo-protect></heo-protect></p>")[0]?.reason).toContain("no text");
  });

  it("refuses a mark inside another mark", () => {
    expect(
      problems("<p><heo-protect>Revenue <heo-protect>$4.2M</heo-protect></heo-protect></p>")[0]
        ?.reason,
    ).toContain("already owns");
  });

  it("refuses a mark inside a skipped element", () => {
    for (const [open, close] of [
      ["<pre>", "</pre>"],
      ["<code>", "</code>"],
      ["<button>", "</button>"],
    ]) {
      expect(problems(`<p>${open}<heo-protect>$4.2M</heo-protect>${close}</p>`)[0]?.reason).toMatch(
        /invariant 4/u,
      );
    }
  });

  it("refuses a size that is not a positive number of pixels", () => {
    expect(problems(`<p><heo-protect size="large">$4.2M</heo-protect></p>`)[0]?.source).toBe(
      "heo-protect size",
    );
  });

  it("refuses a unit that names no unit", () => {
    expect(problems(`<p><heo-protect unit="letter">$4.2M</heo-protect></p>`)[0]?.source).toBe(
      "heo-protect unit",
    );
  });

  it("collects every mistake on the page rather than the first", () => {
    const found = problems(
      `<p><heo-protect alt='[bad'>$4.2M</heo-protect> and ` +
        `<heo-protect size="x">$3.1M</heo-protect> and <heo-protect></heo-protect></p>`,
    );
    expect(found.length).toBe(3);
  });
});

describe("heo-chaff", () => {
  it("places one noise node where it is written and says what it says", () => {
    const { html, stats } = transformHtml(
      page("<p>Prose.</p><heo-chaff>The refinancing completed in May.</heo-chaff>"),
      CONFIG,
    );
    expect(stats.chaffNodes).toBe(1);
    // The sentence is in the response — a permuted node holds it one word per
    // span — and none of it is painted.
    expect(html).toContain("refinancing");
    expect(readingText(html)).toBe("Prose.");
  });

  it("draws one of its options per load", () => {
    const source = page(
      `<heo-chaff options='["Alpha holds firm.","Beta holds firm.","Gamma holds firm."]'></heo-chaff>`,
    );
    const said = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const { html } = transformHtml(source, { ...CONFIG, seed: `pick${i}` });
      // One word rather than the sentence: a permuted node holds its words in
      // separate spans, in an order the stylesheet restores.
      const drawn = ["Alpha", "Beta", "Gamma"].filter((option) => html.includes(option));
      expect(drawn).toHaveLength(1);
      said.add(drawn[0] as string);
    }
    expect(said.size).toBe(3);
  });

  it("refuses an options element that also has content", () => {
    // The trap a publisher will actually write. HTML has no self-closing syntax
    // for a non-void element, so `<heo-chaff options="…" />` is an opening tag
    // and the prose after it becomes the element's content — which HEO would
    // then conceal, deleting text the reader was meant to see. Verified against
    // parse5: the slash is unrecoverable after parsing, the shape is not.
    const written = `<p>Before <heo-chaff options='["Alpha holds."]' /> after.</p>`;
    const parsed = serializeDocument(parseDocument(written));
    expect(parsed).toContain("> after.</heo-chaff>");

    const [first] = problems(written);
    expect(first?.source).toBe("heo-chaff options");
    expect(first?.remedy).toContain("</heo-chaff>");
  });

  it("refuses a chaff element that says nothing", () => {
    expect(problems("<p>Prose.</p><heo-chaff></heo-chaff>")[0]?.reason).toContain("says nothing");
  });

  it("refuses a malformed options list", () => {
    expect(problems("<heo-chaff options='nope'></heo-chaff>")[0]?.reason).toContain(
      "not valid JSON",
    );
  });
});

describe("heo-shuffle", () => {
  it("permutes its own content and restores the reading order in CSS", () => {
    const source = page("<p><heo-shuffle>Revenue reached a record high.</heo-shuffle></p>");
    const { html } = transformHtml(source, CONFIG);
    expect(html).not.toContain("Revenue reached a record high.");
    expect(readingText(html)).toBe("Revenue reached a record high.");
  });

  it("splits a long run into even containers rather than refusing it", () => {
    // A run longer than the renderer accepts is chunked, and none of the chunks
    // may fall below the minimum — taking the maximum until the run runs out is
    // what leaves a final chunk of one, which is not a permutation at all.
    const words = Array.from({ length: 21 }, (_, index) => `word${index}`).join(" ");
    const { html } = transformHtml(page(`<p><heo-shuffle>${words}</heo-shuffle></p>`), CONFIG);
    const containers = [...html.matchAll(/<span class="heo-g[^"]*" aria-hidden="true">/gu)];
    expect(containers.length).toBe(5);
    expect(readingText(html)).toBe(words);
    for (const match of html.matchAll(/\.([a-z][\w-]*)>:nth-child\(1\)\{/gu)) {
      expect(match[1]).toBeTruthy();
    }
  });

  it("refuses a shuffle inside a shuffle", () => {
    expect(
      problems("<p><heo-shuffle>a b <heo-shuffle>c d e</heo-shuffle></heo-shuffle></p>")[0]?.reason,
    ).toContain("already owns");
  });
});

describe("heo-decoy", () => {
  it("is reserved, and writing one is a refusal rather than a no-op", () => {
    const [first] = problems("<p><heo-decoy>$4.2M</heo-decoy></p>");
    expect(first?.source).toBe("heo-decoy");
    expect(first?.reason).toContain("not implemented");
    expect(first?.remedy).toContain("decoy");
  });
});

describe("the stripping pass", () => {
  it("unwraps every element the renderers did not replace", () => {
    const document = parseDocument(
      page("<p>Before <heo-shuffle>a <heo-protect>b</heo-protect> c</heo-shuffle> after.</p>"),
    );
    expect(unwrapHeoElements(document)).toBe(2);
    expect(serializeDocument(document)).toContain("<p>Before a b c after.</p>");
  });

  it("finds nothing to unwrap on a page with no publisher markup", () => {
    expect(unwrapHeoElements(parseDocument(page("<p>Plain.</p>")))).toBe(0);
  });

  it("reports the directives it found in document order", () => {
    const { directives, marks } = discoverMarkup(
      parseDocument(
        page(
          "<heo-chaff>One.</heo-chaff><p><heo-shuffle>a <heo-protect>b</heo-protect> c" +
            "</heo-shuffle></p><p><heo-protect>d</heo-protect></p>",
        ),
      ),
    );
    expect(directives.map((directive) => directive.kind)).toEqual(["chaff", "shuffle", "protect"]);
    expect(marks.map((mark) => mark.text)).toEqual(["b", "d"]);
  });
});
