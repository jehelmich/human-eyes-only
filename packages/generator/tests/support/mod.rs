//! A minimal TrueType font, built in memory.
//!
//! The generator's tests need a font whose outlines are known exactly, so that
//! an assertion can be about the emitted path rather than about whether the
//! output looks plausible. A real face cannot do that, and vendoring one would
//! put a licence question and a few hundred kilobytes of binary in the
//! repository for no test value.
//!
//! Three glyphs: `.notdef` (empty), `A` (a square, straight lines only), and
//! `B` (one quadratic curve, so the `q` command is exercised).

pub const UPEM: u16 = 1000;
pub const ASCENDER: i16 = 800;
pub const DESCENDER: i16 = -200;
pub const ADVANCE: u16 = 600;

/// The square of `A`, counter-clockwise from the origin, in font units.
pub const SQUARE: [(i16, i16); 4] = [(100, 0), (500, 0), (500, 400), (100, 400)];

struct Glyph {
    contours: Vec<Vec<(i16, i16, bool)>>,
}

fn simple_glyph(g: &Glyph) -> Vec<u8> {
    if g.contours.is_empty() {
        return Vec::new();
    }
    let points: Vec<(i16, i16, bool)> = g.contours.iter().flatten().copied().collect();
    let x_min = points.iter().map(|p| p.0).min().unwrap_or(0);
    let y_min = points.iter().map(|p| p.1).min().unwrap_or(0);
    let x_max = points.iter().map(|p| p.0).max().unwrap_or(0);
    let y_max = points.iter().map(|p| p.1).max().unwrap_or(0);

    let mut out = Vec::new();
    out.extend_from_slice(&(g.contours.len() as i16).to_be_bytes());
    for v in [x_min, y_min, x_max, y_max] {
        out.extend_from_slice(&v.to_be_bytes());
    }

    let mut end = -1i32;
    for contour in &g.contours {
        end += contour.len() as i32;
        out.extend_from_slice(&(end as u16).to_be_bytes());
    }
    out.extend_from_slice(&0u16.to_be_bytes()); // instructionLength

    // Long form throughout: one flag byte per point, i16 deltas.
    for (_, _, on_curve) in &points {
        out.push(u8::from(*on_curve));
    }
    let mut prev = 0i16;
    for (x, _, _) in &points {
        out.extend_from_slice(&(x - prev).to_be_bytes());
        prev = *x;
    }
    let mut prev = 0i16;
    for (_, y, _) in &points {
        out.extend_from_slice(&(y - prev).to_be_bytes());
        prev = *y;
    }
    while out.len() % 4 != 0 {
        out.push(0);
    }
    out
}

fn table_head() -> Vec<u8> {
    let mut t = Vec::new();
    t.extend_from_slice(&0x0001_0000u32.to_be_bytes()); // version
    t.extend_from_slice(&0x0001_0000u32.to_be_bytes()); // fontRevision
    t.extend_from_slice(&0u32.to_be_bytes()); // checkSumAdjustment
    t.extend_from_slice(&0x5F0F_3CF5u32.to_be_bytes()); // magicNumber
    t.extend_from_slice(&0u16.to_be_bytes()); // flags
    t.extend_from_slice(&UPEM.to_be_bytes());
    t.extend_from_slice(&[0u8; 16]); // created, modified
    for v in [0i16, DESCENDER, 600, ASCENDER] {
        t.extend_from_slice(&v.to_be_bytes()); // xMin, yMin, xMax, yMax
    }
    t.extend_from_slice(&0u16.to_be_bytes()); // macStyle
    t.extend_from_slice(&8u16.to_be_bytes()); // lowestRecPPEM
    t.extend_from_slice(&2i16.to_be_bytes()); // fontDirectionHint
    t.extend_from_slice(&1i16.to_be_bytes()); // indexToLocFormat: long
    t.extend_from_slice(&0i16.to_be_bytes()); // glyphDataFormat
    t
}

fn table_hhea(num_glyphs: u16) -> Vec<u8> {
    let mut t = Vec::new();
    t.extend_from_slice(&0x0001_0000u32.to_be_bytes());
    t.extend_from_slice(&ASCENDER.to_be_bytes());
    t.extend_from_slice(&DESCENDER.to_be_bytes());
    t.extend_from_slice(&0i16.to_be_bytes()); // lineGap
    t.extend_from_slice(&ADVANCE.to_be_bytes()); // advanceWidthMax
    t.extend_from_slice(&[0u8; 20]); // bearings, extents, caret, reserved
    t.extend_from_slice(&0i16.to_be_bytes()); // metricDataFormat
    t.extend_from_slice(&num_glyphs.to_be_bytes()); // numberOfHMetrics
    t
}

fn table_maxp(num_glyphs: u16) -> Vec<u8> {
    let mut t = Vec::new();
    t.extend_from_slice(&0x0001_0000u32.to_be_bytes());
    t.extend_from_slice(&num_glyphs.to_be_bytes());
    t.extend_from_slice(&[0u8; 26]);
    t
}

fn table_hmtx(bearings: &[i16]) -> Vec<u8> {
    let mut t = Vec::new();
    for lsb in bearings {
        t.extend_from_slice(&ADVANCE.to_be_bytes());
        t.extend_from_slice(&lsb.to_be_bytes());
    }
    t
}

/// Format 12, which is far easier to write correctly than format 4 and is what
/// skrifa reaches for first.
fn table_cmap(groups: &[(char, u32)]) -> Vec<u8> {
    let sub_len = 16 + 12 * groups.len() as u32;
    let mut sub = Vec::new();
    sub.extend_from_slice(&12u16.to_be_bytes());
    sub.extend_from_slice(&0u16.to_be_bytes()); // reserved
    sub.extend_from_slice(&sub_len.to_be_bytes());
    sub.extend_from_slice(&0u32.to_be_bytes()); // language
    sub.extend_from_slice(&(groups.len() as u32).to_be_bytes());
    for (c, gid) in groups {
        sub.extend_from_slice(&(*c as u32).to_be_bytes());
        sub.extend_from_slice(&(*c as u32).to_be_bytes());
        sub.extend_from_slice(&gid.to_be_bytes());
    }

    let mut t = Vec::new();
    t.extend_from_slice(&0u16.to_be_bytes()); // version
    t.extend_from_slice(&1u16.to_be_bytes()); // numTables
    t.extend_from_slice(&3u16.to_be_bytes()); // platformID: Windows
    t.extend_from_slice(&10u16.to_be_bytes()); // encodingID: UCS-4
    t.extend_from_slice(&12u32.to_be_bytes()); // subtable offset
    t.extend_from_slice(&sub);
    t
}

fn assemble(tables: Vec<(&str, Vec<u8>)>) -> Vec<u8> {
    let mut tables = tables;
    tables.sort_by(|a, b| a.0.cmp(b.0));

    let n = tables.len() as u16;
    let entry_selector = (15 - (n | 1).leading_zeros()) as u16;
    let search_range = (1u16 << entry_selector) * 16;

    let mut dir = Vec::new();
    dir.extend_from_slice(&0x0001_0000u32.to_be_bytes());
    dir.extend_from_slice(&n.to_be_bytes());
    dir.extend_from_slice(&search_range.to_be_bytes());
    dir.extend_from_slice(&entry_selector.to_be_bytes());
    dir.extend_from_slice(&(n * 16 - search_range).to_be_bytes());

    let mut offset = 12 + 16 * tables.len() as u32;
    let mut body = Vec::new();
    for (tag, data) in &tables {
        dir.extend_from_slice(tag.as_bytes());
        dir.extend_from_slice(&0u32.to_be_bytes()); // checkSum
        dir.extend_from_slice(&offset.to_be_bytes());
        dir.extend_from_slice(&(data.len() as u32).to_be_bytes());
        offset += data.len() as u32;
        body.extend_from_slice(data);
        while body.len() % 4 != 0 {
            body.push(0);
            offset += 1;
        }
    }
    dir.extend_from_slice(&body);
    dir
}

/// Builds the test font.
pub fn font() -> Vec<u8> {
    let glyphs = vec![
        Glyph { contours: vec![] },
        Glyph {
            contours: vec![SQUARE.iter().map(|(x, y)| (*x, *y, true)).collect()],
        },
        Glyph {
            // A triangle with one off-curve point, so `q` appears in the output.
            contours: vec![vec![
                (100, 0, true),
                (500, 0, true),
                (500, 400, false),
                (100, 400, true),
            ]],
        },
    ];

    let mut glyf = Vec::new();
    let mut loca = Vec::new();
    for glyph in &glyphs {
        loca.extend_from_slice(&(glyf.len() as u32).to_be_bytes());
        glyf.extend_from_slice(&simple_glyph(glyph));
    }
    loca.extend_from_slice(&(glyf.len() as u32).to_be_bytes());

    let bearings: Vec<i16> = glyphs
        .iter()
        .map(|g| g.contours.iter().flatten().map(|p| p.0).min().unwrap_or(0))
        .collect();

    let n = glyphs.len() as u16;
    assemble(vec![
        ("cmap", table_cmap(&[('A', 1), ('B', 2)])),
        ("glyf", glyf),
        ("head", table_head()),
        ("hhea", table_hhea(n)),
        ("hmtx", table_hmtx(&bearings)),
        ("loca", loca),
        ("maxp", table_maxp(n)),
    ])
}
