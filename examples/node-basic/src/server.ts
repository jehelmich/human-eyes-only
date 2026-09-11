/**
 * Minimal end-to-end demonstration: a plain `node:http` server with the HEO
 * middleware in front of it. No framework, on purpose — the middleware is meant
 * to work anywhere a Node response object exists, and a framework here would
 * hide it if that stopped being true.
 *
 *   pnpm --filter @heo/generator build     # once; the module is not committed
 *   pnpm --filter @heo/example-node-basic start
 *
 * Routes:
 *   /            index
 *   /report      the demo article, transformed
 *   /raw/report  the same bytes, untouched, for a side-by-side diff
 *
 * Two things this file exists to show, beyond wiring.
 *
 * **The publisher supplies one font and nothing else**. `@heo/middleware`
 * depends on `@heo/generator`, instantiates it, and hands core the renderer, so
 * installing one package is enough to draw carriers. Core still loads neither —
 * that boundary is what keeps a Python or edge adapter possible — but it was
 * never an argument for making the publisher assemble the parts.
 *
 * **The font cannot be defaulted and neither can its size.** A carrier is drawn
 * from the face the marked text actually renders in, and working out which face
 * that is needs the CSS cascade, which needs layout. Both are configuration, and
 * a marked page without them is a refusal rather than a page that quietly serves
 * its figures as text.
 */

import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heoMiddleware } from "@heo/middleware";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, "..", "pages");
const PORT = Number(process.env.PORT ?? 8787);

/**
 * The type size of the protected article, in CSS pixels.
 *
 * It is a required piece of publisher configuration: `transformHtml` is a pure
 * function over a string with no layout engine behind it, so nothing can infer
 * the computed size, and a carrier drawn at the wrong one is visible on the
 * line. The stylesheet is served with this number substituted into it, so the
 * CSS and the config cannot drift apart.
 */
const ARTICLE_FONT_PX = 19;

/**
 * The weight the protected article is set in.
 *
 * Public Sans is variable and its default instance is `wght` 100, so the page
 * used to pin itself to Thin to match what the generator drew — the publisher
 * bending their typography around our limitation, which is backwards. The
 * generator takes the instance now, so this is a weight somebody would actually
 * choose and the same constant reaches the stylesheet and `fontVariations`.
 */
const ARTICLE_WEIGHT = 400;

/**
 * Public Sans Regular, from a declared dependency rather than a file in this
 * repository.
 *
 * A font is a dependency like any other, so it arrives through the package
 * manager: the lockfile carries its integrity hash, the store caches it, and an
 * offline install already has it. That is strictly better than vendoring the
 * bytes, and better than a setup script fetching them — a script would be
 * reimplementing integrity checking and caching that pnpm already does.
 *
 * `@expo-google-fonts/public-sans` is used because it publishes **TrueType**.
 * Fontsource publishes the same family as `woff2`, which the generator cannot
 * read: skrifa parses OpenType and TrueType, and WOFF2 is a compressed
 * container with a transformed `glyf` table. That is a real constraint on
 * publishers too and it is in the README, not just here.
 *
 * The same bytes go to the browser as a `@font-face` source and to the
 * generator as a glyph source. Anything else and the two disagree: the
 * generator has no rasteriser and no shaper, so the page's own text has to come
 * from the file the outlines came from.
 */
const FONT_PATH = createRequire(import.meta.url).resolve(
  "@expo-google-fonts/public-sans/400Regular/PublicSans_400Regular.ttf",
);
const font = new Uint8Array(readFileSync(FONT_PATH));

/** What the browser asks for. Stable, and not where the file happens to live. */
const FONT_ROUTE = "/fonts/public-sans-400.ttf";

const page = (name: string): string => readFileSync(join(PAGES, name), "utf8");

/**
 * The middleware, or a refusal to start.
 *
 * The generator module is a cargo artifact, derivable and deliberately not
 * committed, so a repository clone does not have one until it is built. There is
 * no fallback and there is not going to be: a carrier that cannot be drawn is a
 * refused page, never a run of readable text.
 */
function middleware(): ReturnType<typeof heoMiddleware> {
  try {
    return heoMiddleware(options);
  } catch (error) {
    process.stderr.write(
      `heo example: the middleware could not be started.\n` +
        `  ${(error as Error).message}\n\n` +
        `If the generator module is missing, build it first:\n\n` +
        `  rustup target add wasm32-unknown-unknown\n` +
        `  pnpm --filter @heo/generator build\n\n` +
        `The server does not start without it. Serving this page with carriers ` +
        `disabled would publish every marked value in the clear.\n`,
    );
    process.exit(1);
  }
}

const options = {
  // An explicit seed pins the output so two runs can be diffed. Leave it unset
  // in production: request-scope randomization is the point.
  ...(process.env.HEO_SEED === undefined ? {} : { seed: process.env.HEO_SEED }),
  // The publisher's face, and the computed size of the text it draws. There is
  // nothing else to configure: what each element on the page does is written on
  // the element.
  font,
  fontSizePx: ARTICLE_FONT_PX,
  fontVariations: { wght: ARTICLE_WEIGHT },
  debug: process.env.HEO_DEBUG === "1",
  onTransform(stats, url) {
    process.stdout.write(
      `transform ${url} marks=${stats.marks} ` +
        `carriers=${stats.carriers} fallbacks=${stats.carrierFallbacks} ` +
        `shuffles=${stats.shuffles} chaff=${stats.chaffNodes} ` +
        `bytes=${stats.inputBytes}->${stats.outputBytes} ` +
        `${stats.durationMs.toFixed(2)}ms seed=${stats.seed}\n`,
    );
  },
  onRefusal(error, url) {
    // The reason belongs here and not in the 500 body: it names the value that
    // could not be contained, and the reader of a 500 from a protected route is
    // as likely to be an extractor as an operator.
    process.stdout.write(`refused ${url}: ${error.name}\n${error.message}\n`);
  },
};

const heo = middleware();

const INDEX = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>HEO example</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css"></head>
<body>
<p class="eyebrow">Human eyes only</p>
<h1>Example server</h1>
<p class="standfirst">A publisher marks the figures that matter. HEO draws them
as vector outlines and leaves a substitute the publisher wrote in the text
channel, differently on every load.</p>
<nav class="routes">
<ul>
  <li><a href="/report">/report</a> — transformed: carriers and substitutes</li>
  <li><a href="/raw/report">/raw/report</a> — the same page, untouched</li>
</ul>
</nav>
<p>Open <a href="/report">/report</a> beside <a href="/raw/report">/raw/report</a>:
they read the same. Then use the browser's own reader — view source, select the
paragraph and copy it, or run it through an extractor. The marked figures are not
there, and what is there instead is wrong on purpose.</p>
<p>Reload a few times. The substitutes change, the outlines are redrawn, and the
words on screen do not move.</p>
</body></html>
`;

function route(request: IncomingMessage, response: ServerResponse): void {
  const url = (request.url ?? "/").split("?")[0];

  if (url === "/style.css") {
    response.setHeader("content-type", "text/css; charset=utf-8");
    // Two constants, two consumers each. See ARTICLE_FONT_PX and
    // ARTICLE_WEIGHT: a stylesheet and a config that disagree about either one
    // is a defect nothing catches by reading one of them alone.
    response.end(
      page("style.css")
        .replaceAll("__ARTICLE_FONT_PX__", String(ARTICLE_FONT_PX))
        .replaceAll("__ARTICLE_WEIGHT__", String(ARTICLE_WEIGHT)),
    );
    return;
  }

  if (url === FONT_ROUTE) {
    response.setHeader("content-type", "font/ttf");
    response.setHeader("cache-control", "public, max-age=3600");
    response.end(font);
    return;
  }

  response.setHeader("content-type", "text/html; charset=utf-8");

  switch (url) {
    case "/":
      response.end(INDEX);
      return;
    case "/report":
      response.end(page("report.html"));
      return;
    default:
      response.statusCode = 404;
      response.end("<!doctype html><p>Not found");
  }
}

const server = createServer((request, response) => {
  // `/raw/*` bypasses the middleware entirely, so the two responses can be
  // compared byte for byte.
  if ((request.url ?? "").startsWith("/raw/")) {
    const name = (request.url as string).slice("/raw/".length);
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(page(`${name}.html`));
    return;
  }

  heo(request, response, () => route(request, response));
});

server.listen(PORT, () => {
  process.stdout.write(`heo example server on http://localhost:${PORT}\n`);
});
