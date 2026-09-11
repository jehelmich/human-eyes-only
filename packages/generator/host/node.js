/**
 * The Node host for the generator.
 *
 * `@heo/core` never loads this and never loads the `.wasm`. A carrier generator
 * is a compiled artifact built by cargo, and core is a synchronous,
 * framework-neutral, toolchain-neutral pure function; the module
 * and the publisher's font are both the host's to supply, exactly as the ABI
 * already requires font bytes to be passed in rather than embedded.
 *
 * What crosses the boundary is small enough to state here in full: four
 * functions, one buffer in, one buffer out. That is the whole reason there is
 * no `wasm-bindgen`, no glue crate and no packaging question.
 *
 * Plain JavaScript rather than TypeScript, so it needs no build step of its own
 * and can be loaded by anything that runs Node — including the benchmark, which
 * strips types from its own sources and cannot strip them from a dependency.
 * Types live alongside it in `node.d.ts`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Twelve bytes of little-endian metrics precede the SVG. See `src/abi.rs`. */
const METRICS_BYTES = 12;

/**
 * Where to find the module, published copy first.
 *
 * Two locations because there are two ways to arrive here. Installed from npm,
 * the tarball carries `dist/heo_generator.wasm`, built from the `src/` beside
 * it by `prepack` — so a publisher needs no Rust toolchain. Working in the
 * repository, that copy does not exist and cargo's output does.
 *
 * The artifact is never committed either way: it is derivable, `check:artifacts`
 * says so, and half a megabyte rebuilt on every generator change does not
 * belong in git history. Shipped in the tarball, reconstructible from source,
 * absent from the repo — all three at once.
 */
export function defaultWasmPath() {
  const published = join(HERE, "..", "dist", "heo_generator.wasm");
  if (existsSync(published)) return published;
  return join(HERE, "..", "target", "wasm32-unknown-unknown", "release", "heo_generator.wasm");
}

/**
 * The wire spelling of a position in variation space: `wght=400`, or
 * `wght=400,wdth=87.5`, or empty for the face's own default instance.
 *
 * Tags are sorted so that two config objects written in a different order
 * produce the same string — and therefore the same instance cache entry inside
 * the module — and numbers go through `String(value)`, which is the one
 * float-to-decimal formatting invariant 5 already depends on elsewhere.
 *
 * @param {Record<string, number> | undefined} variations
 */
function axisSpec(variations) {
  if (variations === undefined) return "";
  return Object.keys(variations)
    .sort()
    .map((tag) => `${tag}=${String(variations[tag])}`)
    .join(",");
}

/**
 * One WebAssembly instance over one font file.
 *
 * The face is module state — `src/abi.rs` keeps it in a thread-local — so one
 * instance serves one file. What it does *not* pin is the weight: the variation
 * instance rides on `heo_generate`, and the module caches a glyph table per
 * position in variation space, so a page setting two weights costs two tables
 * rather than two modules.
 *
 * @param {WebAssembly.Module} module
 * @param {Uint8Array} font
 */
function createFace(module, font) {
  const instance = new WebAssembly.Instance(module, {});
  const api = /** @type {Record<string, CallableFunction>} */ (instance.exports);
  const memory = /** @type {WebAssembly.Memory} */ (instance.exports.memory);

  // A view is only valid until the module grows its memory, so every read takes
  // a fresh one. This is the single most common way to corrupt output through a
  // hand-written ABI, and it fails intermittently rather than immediately.
  const view = () => new Uint8Array(memory.buffer);

  /** Copies `data` into module memory. The caller frees. */
  const copyIn = (data) => {
    const ptr = api.heo_alloc(data.length);
    view().set(data, ptr);
    return ptr;
  };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const fontPtr = copyIn(font);
  const ok = api.heo_init(fontPtr, font.length);
  api.heo_free(fontPtr, font.length);
  if (ok !== 0) throw new Error("heo-generator: the supplied font could not be parsed");

  return function draw(text, params, seed) {
    const textBytes = encoder.encode(text);
    const seedBytes = encoder.encode(seed);
    const axesBytes = encoder.encode(axisSpec(params.variations));
    const textPtr = copyIn(textBytes);
    const seedPtr = copyIn(seedBytes);
    const axesPtr = copyIn(axesBytes);
    const lenPtr = api.heo_alloc(4);

    let result = null;
    try {
      const ptr = api.heo_generate(
        textPtr,
        textBytes.length,
        seedPtr,
        seedBytes.length,
        axesPtr,
        axesBytes.length,
        params.sizePx,
        params.jitterPx,
        lenPtr,
      );
      if (ptr !== 0) {
        const len = new DataView(memory.buffer).getUint32(lenPtr, true);
        const buffer = view().subarray(ptr, ptr + len);
        const metrics = new DataView(buffer.buffer, buffer.byteOffset, METRICS_BYTES);
        result = {
          advance: metrics.getInt32(0, true),
          ascent: metrics.getInt32(4, true),
          descent: metrics.getInt32(8, true),
          svg: decoder.decode(buffer.subarray(METRICS_BYTES)),
        };
        api.heo_free(ptr, len);
      }
    } finally {
      api.heo_free(textPtr, textBytes.length);
      api.heo_free(seedPtr, seedBytes.length);
      api.heo_free(axesPtr, axesBytes.length);
      api.heo_free(lenPtr, 4);
    }
    return result;
  };
}

/**
 * Instantiates the generator over a font and, optionally, faces to fall back to.
 *
 * **A fallback face is not a plaintext fallback.** Invariant 7 forbids a span
 * failing back to readable text, because that is the bypass a scraper triggers
 * by declining to fetch an asset. Drawing the same word from a different face
 * is not that: the carrier still exists, the value is still out of the DOM, and
 * what is lost is cosmetic. So a glyph the publisher's font has no outline for
 * is drawn by the next face in the list rather than taking the page down, and
 * the result says which face drew it so the choice is visible rather than
 * silent.
 *
 * Fallbacks share one compiled `WebAssembly.Module` and cost one instance each,
 * which is memory rather than compilation.
 *
 * @param {object} options
 * @param {Uint8Array} options.font Font file bytes, passed through untouched.
 * @param {Uint8Array[]} [options.fallbacks] Faces to try, in order, when the
 *   first cannot draw a run.
 * @param {Uint8Array} [options.wasm] The module. Read from disk when absent.
 * @returns {import("@heo/core").CarrierRenderer}
 */
export function createCarrierRenderer(options) {
  const bytes = options.wasm ?? new Uint8Array(readFileSync(defaultWasmPath()));
  const module = new WebAssembly.Module(bytes);

  const primary = createFace(module, options.font);
  const fallbacks = (options.fallbacks ?? []).map((font) => createFace(module, font));

  return {
    render(text, params, seed) {
      const drawn = primary(text, params, seed);
      if (drawn !== null) return drawn;
      for (const fallback of fallbacks) {
        // The same seed: the carrier drawn is still a function of the seed and
        // the run, so invariant 5 holds whichever face ends up drawing it.
        const substitute = fallback(text, params, seed);
        if (substitute !== null) return { ...substitute, fallback: true };
      }
      // Null only when nothing can draw this run at all. Core decides what
      // that means; it is not a fallback to text here.
      return null;
    },
  };
}
