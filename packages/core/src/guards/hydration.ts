/**
 * Hydration detection.
 *
 * v0.1 targets server-rendered, non-hydrated pages. Hydrated SSR is refused with
 * a clear message rather than transformed badly, for two reasons that both
 * matter:
 *
 * - React discards server markup on a hydration mismatch and re-renders from the
 *   client's own tree, so the transformation is undone in the browser while the
 *   page still pays for it;
 * - the framework's serialized payload carries the original text verbatim, and
 * element-shaped carriers cannot round-trip through a serialized element tree
 * without per-format node synthesis. Serving it would break invariant 6.
 *
 * Refusing is the honest behaviour. Transforming a page whose text also ships in
 * a flight payload protects nothing.
 */

const SIGNATURES: { pattern: RegExp; framework: string }[] = [
  { pattern: /<script[^>]+id=["']__NEXT_DATA__["']/i, framework: "Next.js (Pages Router)" },
  { pattern: /self\.__next_f\.push/, framework: "Next.js (App Router RSC payload)" },
  { pattern: /window\.__NUXT__\s*=/, framework: "Nuxt" },
  { pattern: /window\.__remixContext\s*=/, framework: "Remix" },
  { pattern: /window\.__sveltekit_/, framework: "SvelteKit" },
  { pattern: /<[^>]+\sdata-reactroot\b/i, framework: "React (legacy hydration root)" },
  { pattern: /window\.__APOLLO_STATE__\s*=/, framework: "Apollo client state" },
];

export interface HydrationFinding {
  framework: string;
}

export function detectHydration(html: string): HydrationFinding | null {
  for (const signature of SIGNATURES) {
    if (signature.pattern.test(html)) return { framework: signature.framework };
  }
  return null;
}

export class HeoHydrationError extends Error {
  readonly framework: string;

  constructor(framework: string) {
    super(
      `HEO refused to transform a hydrated page (${framework}). ` +
        "Client-side hydration discards the transformed markup and the framework's " +
        "serialized payload ships the original text, so the page would pay the cost " +
        "and gain nothing. Pre-render the protected route without hydration, or " +
        "exclude it from HEO.",
    );
    this.name = "HeoHydrationError";
    this.framework = framework;
  }
}
