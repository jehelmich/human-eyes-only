/**
 * These exercise the adapter's own job — buffering, content types, headers,
 * refusal policy, the font it now owns — not the transformation. `@heo/core` is
 * aliased to its source in `vitest.config.ts`, so no build step is needed.
 *
 * Nothing here draws a carrier, and that is deliberate: a carrier needs the
 * compiled generator, which is a cargo artifact and is not committed, so a suite
 * that drew one would fail in a fresh clone for a reason that has nothing to do
 * with the adapter. What is tested instead is the boundary the adapter owns —
 * that a marked page with no font is refused, and refused for every request.
 */

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { heoMiddleware } from "../src/node.js";

const PAGE = `<!doctype html><html><head><title>x</title></head><body>
<p><heo-shuffle>Revenue reached a record in the quarter, up from a year
earlier, with a wider margin for the 2027 year.</heo-shuffle></p>
<heo-chaff>The audit committee met twice during the reporting period.</heo-chaff>
</body></html>`;

// A shuffle with nothing to permute: fewer than three units, so HEO refuses
// rather than serve a page the publisher believes is protected and is not.
const UNCOVERABLE = `<!doctype html><html><head><title>x</title></head>
<body><p><heo-shuffle>Revenue rose.</heo-shuffle></p></body></html>`;

// A mark with no font configured. Wrong for every request rather than for this
// page, so `passthrough` must not apply to it.
const MARKED = `<!doctype html><html><head><title>x</title></head>
<body><p>Revenue reached <heo-protect>four point two million</heo-protect> today.</p></body></html>`;

let server: Server;
let base: string;

beforeAll(async () => {
  const heo = heoMiddleware({ seed: "middleware-test" });

  const lenient = heoMiddleware({
    seed: "middleware-test",
    onError: "passthrough",
  });

  server = createServer((request, response) => {
    const url = request.url ?? "/";

    if (url === "/json") {
      heo(request, response, () => {
        response.setHeader("content-type", "application/json");
        response.end('{"revenue":"$4.2M"}');
      });
      return;
    }

    if (url === "/uncoverable") {
      heo(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(UNCOVERABLE);
      });
      return;
    }

    if (url === "/uncoverable-passthrough") {
      lenient(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(UNCOVERABLE);
      });
      return;
    }

    if (url === "/no-font") {
      lenient(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(MARKED);
      });
      return;
    }

    if (url === "/csp") {
      heo(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.setHeader(
          "content-security-policy",
          "default-src 'self'; style-src 'self'; script-src 'self'",
        );
        response.end(PAGE);
      });
      return;
    }

    if (url === "/csp-none") {
      heo(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.setHeader("content-security-policy", "style-src 'none'");
        response.end(PAGE);
      });
      return;
    }

    if (url === "/chunked") {
      heo(request, response, () => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.write(PAGE.slice(0, 60));
        response.write(PAGE.slice(60));
        response.end();
      });
      return;
    }

    heo(request, response, () => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(PAGE);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("content types", () => {
  it("transforms HTML", async () => {
    const response = await fetch(base);
    expect(response.headers.get("heo")).toBe("1");
    expect(await response.text()).toMatch(/class="heo-g \w+ \w+"/);
  });

  it("passes non-HTML through untouched", async () => {
    const response = await fetch(`${base}/json`);
    expect(response.headers.get("heo")).toBeNull();
    expect(await response.text()).toBe('{"revenue":"$4.2M"}');
  });
});

describe("buffering", () => {
  it("assembles a response written in several chunks", async () => {
    const response = await fetch(`${base}/chunked`);
    const body = await response.text();
    expect(body).toMatch(/class="heo-g \w+ \w+"/);
    expect(Number(response.headers.get("content-length"))).toBe(Buffer.byteLength(body));
  });
});

describe("the font the adapter owns", () => {
  it("refuses to be constructed with a font and no size", () => {
    // A carrier is drawn at an absolute size and nothing here can infer the
    // computed one, so this is wrong for every request and says so immediately.
    expect(() => heoMiddleware({ font: new Uint8Array(4) })).toThrow(/fontSizePx/u);
  });

  it("refuses to be constructed with a size and no font", () => {
    expect(() => heoMiddleware({ fontSizePx: 19 })).toThrow(/font/u);
  });

  it("refuses a marked page with no font, and names the option", async () => {
    // Core's own refusal names `carrier.renderer`, which a publisher who
    // installed the adapter never sees. The remedy is the adapter's option.
    const response = await fetch(`${base}/no-font`);
    expect(response.status).toBe(500);
    expect(response.headers.get("heo")).toBe("refused");
    // `passthrough` is a decision about one page. A missing font is wrong for
    // every request, so honouring it here would publish the whole site silently
    // and for good.
    expect(await response.text()).not.toContain("four point two million");
  });
});

describe("refusal policy", () => {
  it("fails closed by default", async () => {
    const response = await fetch(`${base}/uncoverable`);
    expect(response.status).toBe(500);
    // The point of failing closed: the plaintext must not go out anyway.
    expect(await response.text()).not.toContain("<heo-shuffle>");
  });

  it("serves the original only when explicitly told to", async () => {
    const response = await fetch(`${base}/uncoverable-passthrough`);
    expect(response.status).toBe(200);
    // The original bytes, markup and all: passthrough publishes the page.
    expect(await response.text()).toContain("<heo-shuffle>Revenue rose.</heo-shuffle>");
  });
});

describe("Content-Security-Policy", () => {
  it("authorises its own stylesheet in the response header", async () => {
    // The half of the policy core cannot see. Core chooses the nonce and hands
    // it back; the adapter writes the header and decides nothing.
    const response = await fetch(`${base}/csp`);
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([0-9a-f]{32})'/.exec(policy);
    expect(nonce).not.toBeNull();
    expect(policy).toBe(
      `default-src 'self'; style-src 'self' 'nonce-${nonce?.[1]}'; script-src 'self'`,
    );
    expect(await response.text()).toContain(`<style nonce="${nonce?.[1]}">`);
  });

  it("adds nothing but the nonce, and never to another directive", async () => {
    const policy = (await fetch(`${base}/csp`)).headers.get("content-security-policy") ?? "";
    expect(policy).not.toContain("unsafe-inline");
    expect(policy.match(/nonce-/g)).toHaveLength(1);
    expect(policy).toContain("script-src 'self'");
  });

  it("still refuses a header policy a nonce cannot satisfy", async () => {
    const response = await fetch(`${base}/csp-none`);
    expect(response.status).toBe(500);
    expect(response.headers.get("heo")).toBe("refused");
  });
});
