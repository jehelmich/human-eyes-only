//! heo-generator — text to randomised SVG carrier.
//!
//! Contract: `(text, style, params, seed) -> SVG`.
//!
//! Deliberately not a rendering engine. Glyph outlines come from a parsed font
//! and are serialized as paths with per-instance randomization; nothing is ever
//! rasterized. See the package README and decisions D16 and D19.

/// Placeholder until the glyph table and emitter land.
pub const VERSION: &str = "0.0.0";
