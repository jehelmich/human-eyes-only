import type { CarrierRenderer } from "@human-eyes-only/core";

export interface CarrierRendererOptions {
  /** Font file bytes, passed through to the module untouched. */
  font: Uint8Array;
  /**
   * Faces to try, in order, for a run `font` has no outline for.
   *
   * A different face is not a plaintext fallback: the carrier is still drawn
   * and the value is still out of the DOM, so invariant 7 is untouched and what
   * is lost is cosmetic. The result of such a call carries `fallback: true`.
   */
  fallbacks?: Uint8Array[];
  /** The compiled module. Read from `defaultWasmPath()` when absent. */
  wasm?: Uint8Array;
}

/** Where `cargo build --release --target wasm32-unknown-unknown` puts the module. */
export function defaultWasmPath(): string;

/** Instantiates the generator over one font, plus any faces to fall back to. */
export function createCarrierRenderer(options: CarrierRendererOptions): CarrierRenderer;
