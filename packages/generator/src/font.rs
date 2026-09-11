//! The glyph table.
//!
//! Outlines are read once per character in font units and kept as owned command
//! lists. Font units rather than pixels because the table outlives any one
//! request and a carrier's size is a per-request input.
//!
//! Measured: this cache is worth about 20-30% of per-call time, not the order
//! of magnitude the decision record originally credited it with. It stays
//! because it is nearly free.
//!
//! The table is keyed by **face instance**, not by face. The same character at
//! two weights is two different outlines with two different advances, so one
//! table per face would hand out whichever weight was asked for first. A face
//! therefore holds a map of instances and each instance holds its own table.

use std::collections::BTreeMap;
use std::str::FromStr;

use skrifa::{
    instance::{Location, LocationRef, Size},
    metrics::GlyphMetrics,
    outline::{DrawSettings, OutlinePen},
    setting::VariationSetting,
    FontRef, MetadataProvider, Tag,
};

/// A path command in font units, y-up, relative to the glyph origin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Seg {
    Move(f32, f32),
    Line(f32, f32),
    Quad(f32, f32, f32, f32),
    Cubic(f32, f32, f32, f32, f32, f32),
    Close,
}

/// One closed contour. Contours are kept apart rather than flattened into one
/// list so they can be emitted in a shuffled order: fill is nonzero-winding and
/// therefore order-independent, which makes the permutation free.
pub type Contour = Vec<Seg>;

#[derive(Clone, Debug)]
pub struct Glyph {
    pub advance: f32,
    pub contours: Vec<Contour>,
}

#[derive(Debug)]
pub enum FontError {
    Unparsable,
    NoOutline(char),
    BadAxes(String),
}

impl std::fmt::Display for FontError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FontError::Unparsable => write!(f, "font data could not be parsed"),
            FontError::NoOutline(c) => write!(f, "font has no outline for {c:?}"),
            FontError::BadAxes(spec) => write!(f, "variation settings could not be read: {spec:?}"),
        }
    }
}

impl std::error::Error for FontError {}

/// A requested position in a font's variation space, in user coordinates.
///
/// The spelling is `wght=400` or `wght=400,wdth=87.5`, empty for the face's own
/// default instance — the same quantities CSS `font-variation-settings` names,
/// because the page is what the carrier has to match. A tag no axis matches is
/// ignored by the shaper below, which is what makes a static face and a
/// variable one take the same input; a tag that is not four characters, or a
/// value that is not a number, is a mistake rather than a no-op and is
/// reported.
///
/// The spec string is kept verbatim and doubles as the instance cache key. Two
/// spellings of one position (`wght=400` and `wght=400.0`) cost one duplicated
/// table and nothing else, which is cheaper than a canonicaliser that has to be
/// right.
#[derive(Clone, Debug, Default)]
pub struct Axes {
    spec: String,
    settings: Vec<VariationSetting>,
}

impl Axes {
    /// Reads a settings string. An empty one is the default instance.
    pub fn parse(spec: &str) -> Result<Self, FontError> {
        let bad = || FontError::BadAxes(spec.to_string());
        let mut settings = Vec::new();
        if !spec.trim().is_empty() {
            for field in spec.split(',') {
                let (tag, value) = field.split_once('=').ok_or_else(bad)?;
                let tag = Tag::from_str(tag.trim()).map_err(|_| bad())?;
                let value: f32 = value.trim().parse().map_err(|_| bad())?;
                if !value.is_finite() {
                    return Err(bad());
                }
                settings.push(VariationSetting::new(tag, value));
            }
        }
        Ok(Axes {
            spec: spec.to_string(),
            settings,
        })
    }
}

/// Collects `OutlinePen` callbacks into contours.
#[derive(Default)]
struct Collector {
    contours: Vec<Contour>,
    current: Contour,
}

impl Collector {
    fn flush(&mut self) {
        if !self.current.is_empty() {
            self.contours.push(std::mem::take(&mut self.current));
        }
    }
}

impl OutlinePen for Collector {
    fn move_to(&mut self, x: f32, y: f32) {
        self.flush();
        self.current.push(Seg::Move(x, y));
    }

    fn line_to(&mut self, x: f32, y: f32) {
        self.current.push(Seg::Line(x, y));
    }

    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        self.current.push(Seg::Quad(cx, cy, x, y));
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        self.current.push(Seg::Cubic(cx0, cy0, cx1, cy1, x, y));
    }

    fn close(&mut self) {
        self.current.push(Seg::Close);
        self.flush();
    }
}

/// One face at one position in variation space, plus its glyph table.
///
/// Metrics live here rather than on the face because they vary with the
/// instance: `MVAR` moves ascent and descent, `HVAR` moves advances. Reading
/// the metrics at one location and the outlines at another is a carrier that
/// sits right on the line and draws the wrong weight, which is the specific
/// failure this split exists to make impossible.
pub struct Instance {
    location: Location,
    pub ascent: f32,
    pub descent: f32,
    glyphs: BTreeMap<char, Glyph>,
}

impl Instance {
    fn new(data: &[u8], axes: &Axes) -> Result<Self, FontError> {
        let font = FontRef::new(data).map_err(|_| FontError::Unparsable)?;
        let location = font.axes().location(&axes.settings);
        let metrics = font.metrics(Size::unscaled(), &location);
        Ok(Instance {
            location,
            ascent: metrics.ascent,
            descent: metrics.descent,
            glyphs: BTreeMap::new(),
        })
    }

    /// Draws and caches the glyph for `c` if it is not already in the table.
    fn ensure(&mut self, data: &[u8], c: char) -> Result<(), FontError> {
        if !self.glyphs.contains_key(&c) {
            let glyph = draw(data, LocationRef::from(&self.location), c)?;
            self.glyphs.insert(c, glyph);
        }
        Ok(())
    }

    /// The cached glyph for `c`, if it has been drawn.
    pub fn get(&self, c: char) -> Option<&Glyph> {
        self.glyphs.get(&c)
    }
}

/// A parsed font and the instances drawn from it.
///
/// Instances fill on first use rather than at process start, because the
/// publisher's font — and the weight their page sets — are configuration.
pub struct Face {
    data: Box<[u8]>,
    pub units_per_em: f32,
    instances: BTreeMap<String, Instance>,
}

impl Face {
    pub fn new(data: Vec<u8>) -> Result<Self, FontError> {
        let data = data.into_boxed_slice();
        let font = FontRef::new(&data).map_err(|_| FontError::Unparsable)?;
        let units_per_em = font.metrics(Size::unscaled(), LocationRef::default()).units_per_em;
        if units_per_em == 0 {
            return Err(FontError::Unparsable);
        }
        Ok(Face {
            data,
            units_per_em: f32::from(units_per_em),
            instances: BTreeMap::new(),
        })
    }

    /// The instance for `axes`, with every character of `text` drawn into it.
    ///
    /// One call rather than a lookup and a loop because laying a run out needs
    /// every glyph at once, and drawing one takes the table mutably.
    pub fn prepare(&mut self, axes: &Axes, text: &str) -> Result<&Instance, FontError> {
        if !self.instances.contains_key(&axes.spec) {
            let instance = Instance::new(&self.data, axes)?;
            self.instances.insert(axes.spec.clone(), instance);
        }
        // Disjoint fields, so the data borrow and the table borrow coexist.
        let data = &self.data;
        let instance = self
            .instances
            .get_mut(&axes.spec)
            .expect("the instance was just inserted");
        for c in text.chars() {
            instance.ensure(data, c)?;
        }
        Ok(instance)
    }
}

fn draw(data: &[u8], location: LocationRef<'_>, c: char) -> Result<Glyph, FontError> {
    let font = FontRef::new(data).map_err(|_| FontError::Unparsable)?;
    let gid = font.charmap().map(c).ok_or(FontError::NoOutline(c))?;

    let advance = GlyphMetrics::new(&font, Size::unscaled(), location)
        .advance_width(gid)
        .ok_or(FontError::NoOutline(c))?;

    let outlines = font.outline_glyphs();
    let mut collector = Collector::default();
    if let Some(outline) = outlines.get(gid) {
        let settings = DrawSettings::unhinted(Size::unscaled(), location);
        outline
            .draw(settings, &mut collector)
            .map_err(|_| FontError::NoOutline(c))?;
    }
    collector.flush();

    Ok(Glyph {
        advance,
        contours: collector.contours,
    })
}
