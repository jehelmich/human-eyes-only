/**
 * Generic Node `(req, res, next)` middleware adapter.
 *
 * Buffers HTML responses and delegates every transformation decision to
 * `@human-eyes-only/core`. See packages/middleware/README.md.
 *
 * There is deliberately no transformation logic below this line. The adapter
 * inspects a content type, buffers a body, calls one function, and fixes up
 * headers. Anything cleverer belongs in core, where it is testable without a
 * socket.
 *
 * What it *does* hold is the wiring core refuses to. `@human-eyes-only/core` never loads a
 * generator: it is a synchronous, framework-neutral, toolchain-neutral pure
 * function, and a `.wasm` loader inside it is what would stop a Python or edge
 * adapter existing. That boundary was never an argument for making the
 * publisher assemble the parts, so this package depends on `@human-eyes-only/generator`,
 * instantiates it over the publisher's font, and hands core the
 * `CarrierRenderer`. One install, and carriers work.
 *
 * The font is the one thing that cannot be defaulted. A carrier is drawn from
 * the face the marked text actually renders in, and nothing here can find out
 * which that is — resolving it needs the CSS cascade, which needs layout, which
 * a pure function over a string does not have. So it is required, and a marked
 * page served without one is a refusal that says exactly that.
 *
 * **Nothing stands behind it either.** This package used to ship a face of its
 * own and hand it to the generator as a fallback, so a glyph the publisher's
 * font had no outline for was drawn in a different one. The mechanism is still
 * here — `fallbackFont` — and the default is gone with the bundled file, because
 * a middleware package is not a font distributor: carrying a binary that most
 * installs never draw a glyph from puts a second licence and 100 KB into every
 * dependency tree to paper over a case the publisher is better placed to answer.
 *
 * So the consequence is the publisher's to configure. With no `fallbackFont`, a
 * run the publisher's face cannot draw is a span HEO was pointed at and could
 * not take, and it goes to `onUnprotectable` like any other — `refuse` by
 * default. That is a change: there is no safety net unless one is strung.
 */

import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  HeoCarrierError,
  type HeoConfig,
  HeoCoverageError,
  HeoCspError,
  HeoHydrationError,
  HeoMarkupError,
  RESPONSE_HEADER,
  transformHtml,
} from "@human-eyes-only/core";
import { createCarrierRenderer } from "@human-eyes-only/generator/host";

const CSP_HEADER = "content-security-policy";

export type MiddlewareErrorPolicy = "fail" | "passthrough";

export interface HeoMiddlewareOptions extends Omit<HeoConfig, "carrier"> {
  /**
   * The publisher's font, as bytes or as a path to a file on disk.
   *
   * The same face the marked text renders in, and the same bytes the browser
   * gets: the generator has no rasteriser and no shaper, so it reads outlines
   * and advances straight out of this file. A different face draws carriers
   * that sit visibly wrong on the line.
   *
   * Required for any page carrying `<heo-protect>`. Automatic detection from
   * the page is out of scope and is not a gap to be filled: which face applies
   * to a span is a question for the cascade, and the cascade needs layout.
   */
  font?: Uint8Array | string;
  /**
   * The face to draw a run `font` has no outline for, as bytes or as a path.
   * There is no default: unset, there is no fallback.
   *
   * Configure one and refusal stops being the first answer. A carrier drawn
   * from a different face is still a carrier and the value is still absent from
   * the DOM, so the cost of falling back is cosmetic — one word in the wrong
   * face — while the cost of refusing is the whole page. Invariant 7 forbids a
   * span failing back to readable *text*, which is the bypass a scraper
   * triggers by declining to fetch an asset, and says nothing about which
   * outlines the ink came from.
   *
   * Unset, a run `font` cannot draw is a span HEO could not take, and
   * `onUnprotectable` is where the publisher says what that means. A page with
   * text outside its own face's coverage — a stray currency sign, a second
   * script — is the case to configure this for.
   *
   * It is reported rather than silent: `stats.carrierFallbacks` counts the
   * carriers a fallback drew.
   */
  fallbackFont?: Uint8Array | string;
  /**
   * Where in the font's variation space to draw, keyed by axis tag —
   * `{ wght: 400 }` for a page whose protected text is set at 400.
   *
   * A variable face has a default instance and it is the designer's choice, not
   * the page's: Public Sans defaults to `wght` 100, so a page that sets nothing
   * gets 400 from the browser and 100 from the generator. Set this to whatever
   * the marked text computes to and the carriers match the text beside them.
   * Ignored by a static face, which has no axes.
   */
  fontVariations?: Record<string, number>;
  /**
   * The compiled generator module. Read from the installed package when absent,
   * which is the normal case and the reason this is optional.
   */
  wasm?: Uint8Array;
  /**
   * Computed type size of the protected text, in CSS pixels. Required whenever
   * `font` is set, and overridden per span by `<heo-protect size="…">`.
   *
   * There is no default that could be right. A carrier is drawn at an absolute
   * size and 16 px inside a 19 px paragraph is a visible defect nothing in the
   * response reports.
   */
  fontSizePx?: number;
  /**
   * What to do when core refuses a page.
   *
   * `fail` is the default and means fail closed: a page HEO could not protect
   * is not served protected-looking. `passthrough` serves the original, which
   * is a decision to publish the plaintext of that page and should be made on
   * purpose.
   *
   * It does not extend to a refusal about the configuration — a missing font,
   * or a carrier with no type size. Those are wrong for every request, so
   * passing through would publish every page rather than one, and would keep
   * doing it silently.
   */
  onError?: MiddlewareErrorPolicy;
  /** Responses larger than this are passed through untouched. */
  maxBytes?: number;
  /** Called with core's stats after every successful transform. */
  onTransform?: (stats: ReturnType<typeof transformHtml>["stats"], url: string) => void;
  onRefusal?: (error: Error, url: string) => void;
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

type Next = (error?: unknown) => void;

function isHtml(contentType: unknown): boolean {
  return typeof contentType === "string" && contentType.toLowerCase().includes("text/html");
}

/** Compressed or chunk-encoded bodies are out of scope for v0.x. */
function isEncoded(response: ServerResponse): boolean {
  const encoding = response.getHeader("content-encoding");
  return typeof encoding === "string" && encoding.length > 0 && encoding !== "identity";
}

/**
 * What core is told when this adapter has no font.
 *
 * Core's own refusal names `carrier.renderer`, which is a field the publisher
 * of a middleware-installed site never sees. The failure is the same one and
 * the remedy is not, so the message is rewritten here rather than made vaguer
 * there.
 */
const MISSING_FONT =
  "this page carries <heo-protect> and no font was supplied. " +
  "Pass the font the marked text renders in, with its computed type size:\n\n" +
  '  heoMiddleware({ font: "./fonts/YourFace-Regular.ttf", fontSizePx: 19 })\n\n' +
  "A carrier is drawn from the publisher's own face and there is no layout engine here to " +
  "work out which one that is. Serving the page without carriers would publish every marked " +
  "value in the clear.";

export function heoMiddleware(options: HeoMiddlewareOptions = {}) {
  const {
    onError = "fail",
    maxBytes = DEFAULT_MAX_BYTES,
    onTransform,
    onRefusal,
    font,
    fallbackFont,
    fontVariations,
    wasm,
    fontSizePx,
    ...config
  } = options;

  if (font === undefined && fontSizePx !== undefined) {
    throw new Error(
      "heoMiddleware: fontSizePx was set without a font. The size describes the face the " +
        "carriers are drawn from, so one without the other draws nothing.",
    );
  }
  // Loud and immediate, because it is wrong for every request. A font with no
  // size cannot draw a carrier at all, and the publisher finds out here rather
  // than on the first marked page.
  if (font !== undefined && fontSizePx === undefined) {
    throw new Error(
      "heoMiddleware: a font was supplied without fontSizePx. A carrier is drawn at an " +
        "absolute size and nothing here can infer the computed one, so there is no default " +
        "that could be right: pass the type size of the protected text in CSS pixels.",
    );
  }

  const bytesOf = (source: Uint8Array | string): Uint8Array =>
    typeof source === "string" ? new Uint8Array(readFileSync(source)) : source;

  const fallbacks = fallbackFont === undefined ? [] : [bytesOf(fallbackFont)];

  const renderer =
    font === undefined
      ? null
      : createCarrierRenderer({
          font: bytesOf(font),
          fallbacks,
          ...(wasm === undefined ? {} : { wasm }),
        });

  const carrier = {
    renderer,
    ...(fontSizePx === undefined ? {} : { fontSizePx }),
    ...(fontVariations === undefined ? {} : { variations: fontVariations }),
  };

  return function heo(request: IncomingMessage, response: ServerResponse, next: Next): void {
    const chunks: Buffer[] = [];
    let buffered = 0;
    let bypassed = false;

    const originalWrite = response.write.bind(response);
    const originalEnd = response.end.bind(response);

    const bypass = (): void => {
      bypassed = true;
      response.write = originalWrite;
      response.end = originalEnd;
      for (const chunk of chunks) originalWrite(chunk);
      chunks.length = 0;
    };

    const capture = (chunk: unknown, encoding?: unknown): boolean => {
      if (chunk === undefined || chunk === null) return true;
      const buffer =
        typeof chunk === "string"
          ? Buffer.from(chunk, (encoding as BufferEncoding) ?? "utf8")
          : (chunk as Buffer);
      buffered += buffer.length;
      if (buffered > maxBytes) {
        chunks.push(buffer);
        bypass();
        return true;
      }
      chunks.push(buffer);
      return true;
    };

    response.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
      if (bypassed) return originalWrite(chunk as never, encoding as never, callback as never);
      if (!isHtml(response.getHeader("content-type")) || isEncoded(response)) {
        bypass();
        return originalWrite(chunk as never, encoding as never, callback as never);
      }
      capture(chunk, encoding);
      if (typeof callback === "function") (callback as () => void)();
      return true;
    }) as typeof response.write;

    response.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
      if (bypassed) return originalEnd(chunk as never, encoding as never, callback as never);

      if (!isHtml(response.getHeader("content-type")) || isEncoded(response)) {
        bypass();
        return originalEnd(chunk as never, encoding as never, callback as never);
      }

      if (typeof chunk !== "function") capture(chunk, encoding);

      response.write = originalWrite;
      response.end = originalEnd;

      const url = request.url ?? "/";
      const html = Buffer.concat(chunks).toString("utf8");

      let output = html;
      try {
        // Core is handed a string, so it sees `<meta http-equiv>` and never a
        // response header — which is where a real policy usually lives and the
        // one thing this adapter can see that core cannot. So the header goes
        // in and the rewritten header comes back out; the decision itself stays
        // in core.
        const header = response.getHeader(CSP_HEADER);
        const policy = Array.isArray(header) ? header.join("; ") : header;

        const result = transformHtml(html, {
          documentKey: url,
          ...(typeof policy === "string" ? { contentSecurityPolicy: policy } : {}),
          ...config,
          carrier,
        });
        output = result.html;

        // Additive and scoped: core returns the publisher's own policy with
        // `'nonce-...'` added to the directive that governs style elements and
        // nothing else changed. Never `'unsafe-inline'`, and never a directive
        // outside the style channel.
        const headerPolicy = result.stats.csp?.headerPolicy;
        if (typeof headerPolicy === "string") response.setHeader(CSP_HEADER, headerPolicy);

        response.setHeader(RESPONSE_HEADER, "1");
        // Request-scope randomization means every load differs, so a cached
        // copy would serve one victim's mapping to everyone.
        const transformed =
          result.stats.marks + result.stats.shuffles + result.stats.chaffNodes > 0;
        if (transformed && (config.randomization ?? "request") === "request") {
          response.setHeader("cache-control", "no-store");
        }
        onTransform?.(result.stats, url);
      } catch (error) {
        const refusal =
          error instanceof HeoCoverageError ||
          error instanceof HeoCarrierError ||
          error instanceof HeoHydrationError ||
          error instanceof HeoMarkupError ||
          error instanceof HeoCspError;
        if (!refusal) throw error;

        // A configuration refusal is wrong for every request, so passing the
        // page through is not "serve this one unprotected" — it is every page,
        // permanently, with nothing in the response to say so.
        const configuration = error instanceof HeoCarrierError && error.configuration;
        const reported =
          configuration && renderer === null ? new HeoCarrierError(MISSING_FONT, true) : error;
        onRefusal?.(reported as Error, url);

        if (onError === "fail" || configuration) {
          response.statusCode = 500;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.setHeader(RESPONSE_HEADER, "refused");
          // The name and nothing else. A refusal happens because a protected
          // value is somewhere it should not be, so the explanation quotes that
          // value — and the party most likely to be reading a 500 from a
          // protected route is the extractor. The detail goes to `onRefusal`,
          // which is the operator's channel.
          const body = Buffer.from(
            `HEO refused to serve this response. See the origin log for the reason ` +
              `(${(reported as Error).name}).\n`,
          );
          response.setHeader("content-length", String(body.length));
          return originalEnd(body, callback as never);
        }
      }

      const body = Buffer.from(output, "utf8");
      response.setHeader("content-length", String(body.length));
      response.removeHeader("etag");
      return originalEnd(body, callback as never);
    }) as typeof response.end;

    next();
  };
}
