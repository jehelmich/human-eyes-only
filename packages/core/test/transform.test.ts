import { describe, expect, it } from "vitest";
import { RUNTIME_CSS } from "../src/assembler/runtime.js";
import { ALL_CONCEALMENTS } from "../src/chaff/concealment.js";
import { HeoCoverageError } from "../src/guards/coverage.js";
import { HeoCspError } from "../src/guards/csp.js";
import { HeoHydrationError } from "../src/guards/hydration.js";
import {
  childrenOf,
  type Element,
  getAttr,
  hasAttr,
  isElement,
  parseDocument,
  walk,
} from "../src/parser/dom.js";
import { transformHtml } from "../src/transform.js";
import { asRendered, CONFIG, PAGE, readingText } from "./helpers.js";

const seeded = (seed: string) => ({ ...CONFIG, seed });

describe("invariant 1 - human-visible content is authoritative", () => {
  it("reproduces the original text in visual reading order", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    expect(readingText(html)).toBe(readingText(asRendered(PAGE)));
  });

  it("holds for every seed, not just a lucky one", () => {
    const expected = readingText(asRendered(PAGE));
    for (let i = 0; i < 50; i++) {
      expect(readingText(transformHtml(PAGE, seeded(`seed-${i}`)).html)).toBe(expected);
    }
  });
});

describe("invariant 2 - nothing changes except where the publisher wrote an element", () => {
  it("leaves outside prose byte-identical", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    expect(html).toContain(
      '<p id="outside">Untouched prose that sits outside every marked element.</p>',
    );
  });

  it("emits no transformed markup outside the publisher's elements", () => {
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`s${i}`));
      const before = html.slice(0, html.indexOf("<section>"));
      // The injected stylesheet names the class; what must not appear is markup.
      expect(before).not.toContain('<span class="heo-g');
      expect(before).not.toContain("<svg");
    }
  });
});

describe("invariant 4 - skip list", () => {
  it("does not touch code or form controls", () => {
    const { html } = transformHtml(PAGE, CONFIG);
    expect(html).toContain("<code>margin = (revenue - cost) / revenue</code>");
    expect(html).toContain('placeholder="you@example.com"');
  });
});

describe("invariant 5 - determinism", () => {
  it("reproduces byte-identical output from a fixed seed", () => {
    expect(transformHtml(PAGE, CONFIG).html).toBe(transformHtml(PAGE, CONFIG).html);
  });

  it("produces different output for different seeds", () => {
    expect(transformHtml(PAGE, seeded("a")).html).not.toBe(transformHtml(PAGE, seeded("b")).html);
  });

  it("varies per request by default", () => {
    const request = { carrier: CONFIG.carrier };
    expect(transformHtml(PAGE, request).html).not.toBe(transformHtml(PAGE, request).html);
  });
});

describe("invariant 9 - idempotence", () => {
  it("returns its own output unchanged", () => {
    const once = transformHtml(PAGE, CONFIG);
    const twice = transformHtml(once.html, CONFIG);
    expect(twice.html).toBe(once.html);
    expect(twice.stats.marks).toBe(0);
  });
});

describe("scope", () => {
  it("passes through a document the publisher marked nothing in", () => {
    const plain =
      "<!doctype html><html><head><title>x</title></head><body><p>Nothing here.</p></body></html>";
    const { html, stats } = transformHtml(plain, CONFIG);
    expect(html).toBe(plain);
    expect(stats.marks).toBe(0);
  });

  it("refuses a hydrated page rather than protecting it badly", () => {
    const next = `<!doctype html><html><head><title>x</title></head><body>
      <p><heo-protect>Revenue of $4.2M in 2026</heo-protect>.</p>
      <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
      </body></html>`;
    expect(() => transformHtml(next, CONFIG)).toThrow(HeoHydrationError);
  });
});

describe("metadata HEO cannot reach", () => {
  const leaky = `<!doctype html><html><head><title>x</title>
    <meta name="description" content="Revenue reached $4.2M in the quarter.">
    </head><body>
    <p><heo-protect>Revenue reached $4.2M in the quarter</heo-protect>, up from $3.1M a year earlier.</p>
    </body></html>`;

  // HEO transforms what it is told to transform and has no opinion about the
  // rest. A marked value that also sits in the publisher's own metadata stays
  // there: the mechanisms are rendering tricks and a meta tag is not rendered,
  // so there is nothing to apply. This is a documented limit, and the test
  // exists so that nobody mistakes it for an oversight and "fixes" it by
  // rewriting a publisher's structured data.
  it("protects the marked span and leaves the metadata alone", () => {
    const { html } = transformHtml(leaky, CONFIG);
    expect(html).toContain('content="Revenue reached $4.2M in the quarter."');
    const body = html.slice(html.indexOf("<body"));
    expect(body).not.toContain("Revenue reached $4.2M in the quarter");
  });
});

describe("stats", () => {
  it("reports what it did", () => {
    const { stats } = transformHtml(PAGE, CONFIG);
    expect(stats.marks).toBe(8);
    expect(stats.shuffles).toBe(2);
    expect(stats.carriers).toBeGreaterThan(8);
    expect(stats.unprotected).toBe(0);
    expect(stats.outputBytes).toBeGreaterThan(stats.inputBytes);
    expect(stats.seed).toBe("test-seed");
  });

  it("counts one noise node per chaff element, plus the decoys", () => {
    const { stats } = transformHtml(PAGE, CONFIG);
    // Eight `heo-chaff` elements on the page, and a decoy for each mark whose
    // publisher supplied a usable substitute.
    expect(stats.chaffNodes).toBe(8 + stats.decoys);
    expect(stats.decoys).toBe(4);
  });
});

describe("chaff", () => {
  const CONCEALMENT_CLASSES: Record<string, RegExp> = {
    clip: /clip-path:inset/,
    paint: /visibility:hidden/,
    renderTree: /display:none|content-visibility:hidden/,
    attribute: /<span class="heo-g[^"]*"[^>]*\shidden\b/,
  };

  it("spreads across more than one detection class", () => {
    // The property that matters, and all that survives of the eleven kinds An
    // extractor that asks one of these questions keeps the chaff that answers
    // to the others; what makes a filter cheap is homogeneity.
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const { html } = transformHtml(PAGE, seeded(`c${i}`));
      for (const [name, pattern] of Object.entries(CONCEALMENT_CLASSES)) {
        if (pattern.test(html)) seen.add(name);
      }
    }
    expect(seen.size).toBe(Object.keys(CONCEALMENT_CLASSES).length);
  });

  it("goes exactly where the publisher wrote the element", () => {
    // A `heo-chaff` places itself, which is what removed `chaff.scope` and with
    // it the one option that relaxed invariant 2.
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`w${i}`));
      const outside = html.slice(0, html.indexOf("<section>"));
      expect(outside).not.toContain('<span class="heo-g');
    }
  });

  it("draws a different sentence from an options list on another load", () => {
    // A node that said the same thing every load would be separable by its own
    // stability across two fetches (M14). Matched on one distinctive word,
    // because a permuted node holds its sentence one word per span.
    const said = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const { html } = transformHtml(PAGE, seeded(`o${i}`));
      said.add(html.includes("hedging") ? "hedging" : "working-capital");
    }
    expect(said.size).toBe(2);
  });

  it("carries aria-hidden on some nodes and not others", () => {
    // `aria-hidden` must not partition `.heo-g` into real and fabricated. A
    // permuted run always carries it and a decoy never can, so chaff is the
    // only thing that can sit on both sides — and it only does while one
    // concealment leaves the node in the accessibility tree.
    const seen = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`aria${i}`));
      for (const match of html.matchAll(/<span class="heo-g[^>]*>/g)) {
        seen.add(match[0].includes('aria-hidden="true"'));
      }
    }
    expect(seen).toEqual(new Set([true, false]));
  });

  it("refuses a sentence that republishes a protected value", () => {
    // Chaff lives in nodes nothing else inspects, which makes it the last place
    // a real figure should reappear. Writing the sentence by hand does not make
    // it safe to hide a live figure in it — and since the element is removed on
    // the way out, dropping the node silently would leave nothing to notice.
    const page =
      `<!doctype html><html><head><title>t</title></head><body>` +
      `<p><heo-protect>Revenue reached $4.2M today</heo-protect>.</p>` +
      `<heo-chaff>Revenue reached $4.2M today, on one reading.</heo-chaff>` +
      `</body></html>`;
    expect(() => transformHtml(page, CONFIG)).toThrow(/protected value/u);
  });
});

describe("the markup is the configuration", () => {
  const page = (body: string): string =>
    `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

  it("draws a carrier for a mark and nothing else", () => {
    const { html, stats } = transformHtml(
      page("<p>Guidance is <heo-protect>unchanged before September</heo-protect> today.</p>"),
      CONFIG,
    );
    expect(stats.marks).toBe(1);
    expect(stats.carriers).toBe(3);
    expect(stats.shuffles).toBe(0);
    expect(html).not.toContain("unchanged before September");
  });

  it("permutes a shuffle whether or not it holds a mark", () => {
    const { html, stats } = transformHtml(
      page("<p><heo-shuffle>Revenue reached a record this quarter.</heo-shuffle></p>"),
      CONFIG,
    );
    expect(stats.shuffles).toBe(1);
    expect(stats.carriers).toBe(0);
    expect(html).toContain('<span class="heo-g');
    expect(readingText(html)).toContain("Revenue reached a record this quarter.");
  });

  it("puts the two rungs on one span rather than choosing between them", () => {
    // A carrier removes the value and a permutation costs a tier of tool; they
    // compose. The mark's carriers are units of the surrounding permutation,
    // which is what `heo-shuffle` bounding its own content buys.
    const { html, stats } = transformHtml(
      page(
        "<p><heo-shuffle>Revenue reached <heo-protect>$4.2M</heo-protect> this quarter." +
          "</heo-shuffle></p>",
      ),
      CONFIG,
    );
    expect(stats.carriers).toBe(1);
    expect(stats.shuffles).toBe(1);
    expect(html).not.toContain("$4.2M");
    expect(readingText(html)).toContain("Revenue reached");
  });

  it("refuses a mark that encloses an element", () => {
    // Every mechanism here works on text, which is what makes invariant 4 a
    // property of the shape rather than of a walk over the skip list.
    for (const inner of ["<em>$4.2</em>", "<code>$4.2</code>", "<button>$4.2</button>"]) {
      expect(() =>
        transformHtml(
          page(`<p><heo-protect>Revenue of ${inner}M today</heo-protect>.</p>`),
          CONFIG,
        ),
      ).toThrow(HeoCoverageError);
    }
  });

  it("refuses a shuffle that encloses anything but text and marks", () => {
    expect(() =>
      transformHtml(
        page("<p><heo-shuffle>Revenue of <em>$4.2M</em> today.</heo-shuffle></p>"),
        CONFIG,
      ),
    ).toThrow(HeoCoverageError);
  });

  it("refuses a shuffle with nothing to permute", () => {
    expect(() =>
      transformHtml(page("<p><heo-shuffle>Revenue rose.</heo-shuffle></p>"), CONFIG),
    ).toThrow(HeoCoverageError);
  });

  it("refuses on every seed rather than some of them", () => {
    for (let i = 0; i < 30; i++) {
      expect(() =>
        transformHtml(page("<p><heo-shuffle>Revenue rose.</heo-shuffle></p>"), seeded(`u${i}`)),
      ).toThrow(HeoCoverageError);
    }
  });

  it("publishes the span in the clear when told to, rather than silently", () => {
    const { html, stats } = transformHtml(
      page("<p>Revenue of <heo-protect>$4.2<em>M</em></heo-protect> today.</p>"),
      { ...CONFIG, onUnprotectable: "warn" },
    );
    expect(html).toContain("$4.2");
    expect(html).not.toContain("heo-protect");
    expect(stats.unprotected).toBe(1);
  });

  it("names the span and why it could not be taken", () => {
    try {
      transformHtml(page("<p><heo-shuffle>Revenue rose.</heo-shuffle></p>"), CONFIG);
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(HeoCoverageError);
      expect((error as HeoCoverageError).spans[0]?.reason).toContain("permutation");
    }
  });
});

describe("Content-Security-Policy is nonced, not refused", () => {
  const page = (policy: string): string =>
    `<!doctype html><html><head><meta charset="utf-8"><title>t</title>` +
    `<meta http-equiv="Content-Security-Policy" content="${policy}">` +
    `</head><body><p><heo-shuffle><heo-protect>Trial conversion improved to 6.3% from ` +
    `4.8%</heo-protect> over the quarter.</heo-shuffle></p></body></html>`;

  const styleTag = (html: string): string => (/<style[^>]*>/.exec(html) as RegExpExecArray)[0];

  const metaPolicy = (html: string): string => {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
    return (match as RegExpExecArray)[1] as string;
  };

  it("transforms a page whose policy blocks the stylesheet, and authorises itself", () => {
    // Every one of these used to be a refusal. Nonces apply to <style> elements
    // and never to `style` attributes, so this became possible only once
    // concealment stopped living in an attribute.
    for (const policy of [
      "default-src 'self'",
      "style-src 'self'",
      "default-src 'self'; style-src-elem 'self'",
      "style-src 'sha256-abc'",
    ]) {
      const { html, stats } = transformHtml(page(policy), CONFIG);
      const nonce = stats.csp?.nonce;
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(styleTag(html)).toContain(`nonce="${nonce}"`);
      expect(metaPolicy(html)).toContain(`'nonce-${nonce}'`);
      expect(readingText(html)).toBe(readingText(asRendered(page(policy))));
    }
  });

  it("leaves a policy that already permits the stylesheet alone", () => {
    for (const policy of [
      "default-src 'self'; style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "default-src 'unsafe-inline'",
      // The attribute half is no longer HEO's business: it emits none.
      "style-src 'unsafe-inline'; style-src-attr 'none'",
    ]) {
      const { html, stats } = transformHtml(page(policy), CONFIG);
      expect(stats.csp).toBeNull();
      expect(styleTag(html)).not.toContain("nonce");
      expect(metaPolicy(html)).toBe(policy);
    }
  });

  it("adds the nonce to the style directive and to no other", () => {
    const { html } = transformHtml(
      page("default-src 'self'; style-src 'self'; script-src 'self'"),
      CONFIG,
    );
    const policy = metaPolicy(html);
    expect(policy).toMatch(/style-src 'self' 'nonce-[0-9a-f]{32}'/);
    expect(policy).toContain("default-src 'self';");
    expect(policy).toContain("script-src 'self'");
    expect(policy.match(/nonce-/g)).toHaveLength(1);
    expect(policy).not.toContain("unsafe-inline");
  });

  it("never widens default-src, which also governs scripts", () => {
    // Appending to `default-src` would have authorised a nonced <script> as
    // well. An explicit `style-src-elem` carrying default-src's own sources is
    // the scoped edit: strictly additive for styles, inert everywhere else.
    const { html, stats } = transformHtml(page("default-src 'self'"), CONFIG);
    const policy = metaPolicy(html);
    expect(policy).toBe(`default-src 'self'; style-src-elem 'self' 'nonce-${stats.csp?.nonce}'`);
  });

  it("refuses a policy a nonce cannot satisfy", () => {
    // 'none' is not a source list a nonce can join. A publisher who wrote it
    // said no, not "say which", so HeoCspError stays for exactly this case.
    for (const policy of ["style-src 'none'", "default-src 'none'"]) {
      expect(() => transformHtml(page(policy), CONFIG)).toThrow(HeoCspError);
    }
  });

  it("refuses everything it used to when told to", () => {
    for (const policy of ["default-src 'self'", "style-src 'self'"]) {
      expect(() => transformHtml(page(policy), { ...CONFIG, onRestrictiveCsp: "refuse" })).toThrow(
        HeoCspError,
      );
    }
  });

  it("has no opinion about the policy on a page it was not pointed at", () => {
    // A refusal is HEO saying it could not perform, never that it disapproves.
    // A page with no `heo-*` element needs no stylesheet, so the policy that
    // would have blocked one is not its business.
    const plain =
      `<!doctype html><html><head><title>x</title>` +
      `<meta http-equiv="Content-Security-Policy" content="style-src 'none'">` +
      `</head><body><p>Nothing marked.</p></body></html>`;
    const { html, stats } = transformHtml(plain, CONFIG);
    expect(html).toBe(plain);
    expect(stats.csp).toBeNull();
  });

  it("nonces a policy an adapter found in a response header", () => {
    // Core is handed a string and cannot see a header, so an adapter passes it
    // in and reads the rewritten one back out.
    const { html, stats } = transformHtml(PAGE, {
      ...CONFIG,
      contentSecurityPolicy: "default-src 'self'; style-src 'self'",
    });
    const nonce = stats.csp?.nonce as string;
    expect(stats.csp?.headerPolicy).toBe(`default-src 'self'; style-src 'self' 'nonce-${nonce}'`);
    expect(styleTag(html)).toContain(`nonce="${nonce}"`);
  });

  it("nonces both halves of a policy split across a header and a meta", () => {
    // CSP composes: a resource has to be allowed by every policy, so one nonce
    // has to appear in all of them.
    const { html, stats } = transformHtml(page("style-src 'self'"), {
      ...CONFIG,
      contentSecurityPolicy: "style-src-elem 'self'",
    });
    const nonce = stats.csp?.nonce as string;
    expect(metaPolicy(html)).toContain(`'nonce-${nonce}'`);
    expect(stats.csp?.headerPolicy).toBe(`style-src-elem 'self' 'nonce-${nonce}'`);
  });

  it("keeps a page without a policy byte-identical for a fixed seed", () => {
    // The determinism resolution (invariant 5). The nonce is unpredictable
    // because it comes from crypto.getRandomValues rather than the seeded
    // stream, and it exists only where a policy demands one.
    expect(transformHtml(PAGE, CONFIG).html).toBe(transformHtml(PAGE, CONFIG).html);
    const a = transformHtml(page("style-src 'self'"), CONFIG);
    const b = transformHtml(page("style-src 'self'"), CONFIG);
    expect(a.html).not.toBe(b.html);
    expect(a.html.replace(/[0-9a-f]{32}/g, "N")).toBe(b.html.replace(/[0-9a-f]{32}/g, "N"));
  });

  it("stays idempotent under a policy", () => {
    const once = transformHtml(page("style-src 'self'"), CONFIG);
    const twice = transformHtml(once.html, CONFIG);
    expect(twice.html).toBe(once.html);
  });
});

describe("concealment lives in the stylesheet, not in an attribute", () => {
  const containers = (html: string): Element[] => {
    const found: Element[] = [];
    walk(parseDocument(html), (node) => {
      if (!isElement(node)) return;
      if ((getAttr(node, "class") ?? "").split(/\s+/).includes("heo-g")) found.push(node);
    });
    return found;
  };

  const runtimeCss = (html: string): string => {
    const match = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
    return (match as RegExpExecArray)[1] as string;
  };

  it("emits no style attribute of its own, anywhere", () => {
    // The crux of the negotiation. A nonce authorises a <style> element and can
    // never authorise a `style` attribute, so a single attribute left behind
    // would reinstate the refusal for every strict-CSP page.
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`n${i}`));
      for (const node of containers(html)) expect(hasAttr(node, "style")).toBe(false);
      expect(html).not.toMatch(/\sstyle=/u);
    }
  });

  it("gives chaff and real runs the same attribute shape", () => {
    // If chaff alone carried an attribute, "has a style attribute" would be a
    // one-selector filter separating the fabricated nodes from the real ones
    // and the N+M dilution argument would collapse to N. Whatever shape one
    // has, the other has: `heo-g`, exactly two opaque classes, and no style.
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`p${i}`));
      const shapes = new Set(
        containers(html).map((node) => {
          const classes = (getAttr(node, "class") ?? "").split(/\s+/);
          return `${classes.length} ${classes[0]}`;
        }),
      );
      expect([...shapes]).toEqual(["3 heo-g"]);
    }
  });

  it("puts every concealment declaration in the stylesheet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { html } = transformHtml(PAGE, seeded(`d${i}`));
      const css = runtimeCss(html);
      const markup = html.replace(/<style[^>]*>[\s\S]*?<\/style>/, "");
      for (const concealment of ALL_CONCEALMENTS) {
        if (concealment.declarations === null) continue;
        expect(markup).not.toContain(concealment.declarations);
        if (css.includes(concealment.declarations)) seen.add(concealment.kind);
      }
    }
    // And they arrive as opaque per-load classes rather than named ones.
    expect(seen.size).toBeGreaterThan(3);
  });

  it("mints class names per load, so none can be grepped for twice", () => {
    // A stable class per concealment kind would be a rule an attacker writes
    // once and reuses forever, which is the same defect the `--p` attribute had.
    const names = (html: string): Set<string> =>
      new Set(
        [...runtimeCss(html).matchAll(/\.([a-z][\w-]*)\{/g)]
          .map((match) => match[1] as string)
          .filter((name) => name !== "heo-g"),
      );
    const first = names(transformHtml(PAGE, seeded("k1")).html);
    const second = names(transformHtml(PAGE, seeded("k2")).html);
    expect(first.size).toBeGreaterThan(0);
    expect([...first].some((name) => second.has(name))).toBe(false);
  });

  it("keeps the concealment rules after the runtime rules that they override", () => {
    // Both `.heo-g` and a concealment class have one-class specificity, so
    // source order decides whether `display:none` beats `display:inline-flex`.
    // The same hazard as `[hidden]`, which C3 caught painting a chaff sentence
    // onto the page in full view.
    const css = runtimeCss(transformHtml(PAGE, seeded("order")).html);
    expect(css.indexOf(RUNTIME_CSS)).toBe(0);
  });

  it("leaves the unit elements with no attribute at all", () => {
    for (let i = 0; i < 10; i++) {
      const { html } = transformHtml(PAGE, seeded(`unit${i}`));
      for (const node of containers(html)) {
        for (const child of childrenOf(node).filter(isElement)) {
          // A carrier inside a permuted unit carries its own class; a word does
          // not. Either way `order` is keyed by `nth-child` and never by an
          // attribute on the unit itself.
          if (child.tagName === "span") expect(child.attrs).toHaveLength(0);
        }
      }
    }
  });
});
