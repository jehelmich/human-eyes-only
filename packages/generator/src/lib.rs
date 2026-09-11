//! heo-generator — text to randomised SVG carrier.
//!
//! Contract: `(text, style, params, seed) -> SVG`.
//!
//! Deliberately not a rendering engine. Glyph outlines come from a parsed font
//! and are serialized as paths with per-instance randomization; nothing is ever
//! rasterized. See the package README.

pub mod abi;
mod emit;
mod font;
mod prng;

pub use font::{Axes, Face, FontError, Glyph, Seg};

use emit::{tenths_to_px, PathWriter};
use prng::Rng;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Per-carrier inputs that are not the text and not the seed.
#[derive(Clone, Debug)]
pub struct Params {
    /// Type size in CSS pixels. Must match the surrounding native text or the
    /// carrier visibly jumps on the line.
    pub size_px: f64,
    /// Control-point jitter amplitude in CSS pixels.
    ///
    /// Jitter and quantisation are the same axis: the user space is tenths of a
    /// pixel, so an amplitude of 0.05 px perturbs the rounding and nothing else.
    /// Larger amplitudes move ink.
    pub jitter_px: f64,
    /// Where in the font's variation space to draw, in user coordinates.
    ///
    /// Per call rather than per face, for the same reason the size is: it is a
    /// property of the text being drawn and not of the file it is drawn from. A
    /// page that sets `font-weight: 400` on one block and 600 on another is one
    /// font and two instances, and the glyph tables for the two are cached
    /// apart.
    pub axes: Axes,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            size_px: 16.0,
            jitter_px: 0.05,
            axes: Axes::default(),
        }
    }
}

/// A generated carrier. Metrics are in tenths of a pixel, the same user space
/// the path data uses, so the caller can align the element on the baseline
/// without reparsing the `viewBox`.
#[derive(Clone, Debug)]
pub struct Carrier {
    pub svg: String,
    /// Total advance width: what the run would have occupied as native text.
    pub advance: i32,
    /// Baseline to the top of the box.
    pub ascent: i32,
    /// Baseline to the bottom of the box. Negative.
    pub descent: i32,
}

/// Renders `text` as one inline SVG element.
///
/// One `<path>` for the whole run rather than one per glyph: it is smaller, and
/// it leaves no glyph boundary in the markup for a segmenter to key on.
pub fn generate(
    face: &mut Face,
    text: &str,
    params: &Params,
    seed: &str,
) -> Result<Carrier, FontError> {
    let mut rng = Rng::new(seed);

    // Font units to tenths of a pixel.
    let scale = params.size_px * 10.0 / f64::from(face.units_per_em);
    let jitter = params.jitter_px * 10.0;

    // Metrics and outlines come from one instance together: reading the ascent
    // at one position in variation space and the outlines at another draws a
    // carrier that sits right and is the wrong weight.
    let instance = face.prepare(&params.axes, text)?;

    let mut pen = 0.0_f64;
    let mut contours: Vec<(f64, &font::Contour)> = Vec::new();
    for c in text.chars() {
        let glyph = instance.get(c).ok_or(FontError::NoOutline(c))?;
        for contour in &glyph.contours {
            contours.push((pen, contour));
        }
        pen += f64::from(glyph.advance);
    }
    // Nonzero winding is order-independent, so permuting contours changes the
    // bytes and not the ink.
    rng.shuffle(&mut contours);

    let mut path = PathWriter::new();
    for (offset, contour) in contours {
        for seg in contour {
            emit_seg(&mut path, *seg, offset, scale, jitter, &mut rng);
        }
    }

    let advance = (pen * scale).round() as i32;
    let ascent = (f64::from(instance.ascent) * scale).round() as i32;
    let descent = (f64::from(instance.descent) * scale).round() as i32;

    Ok(Carrier {
        svg: element(&path.finish(), advance, ascent, descent, &mut rng),
        advance,
        ascent,
        descent,
    })
}

fn emit_seg(path: &mut PathWriter, seg: Seg, offset: f64, scale: f64, jitter: f64, rng: &mut Rng) {
    let point = |x: f32, y: f32, rng: &mut Rng| -> (i32, i32) {
        let jx = rng.signed() * jitter;
        let jy = rng.signed() * jitter;
        (
            ((offset + f64::from(x)) * scale + jx).round() as i32,
            (-f64::from(y) * scale + jy).round() as i32,
        )
    };

    match seg {
        Seg::Move(x, y) => {
            let (x, y) = point(x, y, rng);
            path.move_to(x, y);
        }
        Seg::Line(x, y) => {
            let (x, y) = point(x, y, rng);
            path.line_to(x, y);
        }
        Seg::Quad(cx, cy, x, y) => {
            let (cx, cy) = point(cx, cy, rng);
            let (x, y) = point(x, y, rng);
            path.quad_to(cx, cy, x, y);
        }
        Seg::Cubic(cx0, cy0, cx1, cy1, x, y) => {
            let c0 = point(cx0, cy0, rng);
            let c1 = point(cx1, cy1, rng);
            let (x, y) = point(x, y, rng);
            path.cubic_to(c0, c1, x, y);
        }
        Seg::Close => path.close(),
    }
}

// / Assembles the element. / / `fill="currentColor"` rather than a CSS mask
// over a `data:` URL: the mask is / an image fetch governed by CSP `img-src`,
// which is the directive strict / policies forbid and the reason vector was
// made mandatory. No `style` / attribute, ever — a nonce authorises a `<style>`
// element and can never / authorise an attribute.
fn element(path: &str, advance: i32, ascent: i32, descent: i32, rng: &mut Rng) -> String {
    let height = ascent - descent;
    let mut attributes = vec![
        ("xmlns", "http://www.w3.org/2000/svg".to_string()),
        ("viewBox", format!("0 {} {} {}", -ascent, advance, height)),
        ("width", tenths_to_px(advance)),
        ("height", tenths_to_px(height)),
        ("fill", "currentColor".to_string()),
    ];
    rng.shuffle(&mut attributes);

    let mut out = String::from("<svg");
    for (name, value) in attributes {
        out.push(' ');
        out.push_str(name);
        out.push_str("=\"");
        out.push_str(&value);
        out.push('"');
    }
    out.push('>');
    if !path.is_empty() {
        out.push_str("<path d=\"");
        out.push_str(path);
        out.push_str("\"/>");
    }
    out.push_str("</svg>");
    out
}
