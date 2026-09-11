//! What the generator promises: the outline the font holds, at the size asked
//! for, byte-identical for a seed, and never moving ink further than the jitter
//! amplitude allows.

mod support;

use heo_generator::{generate, Axes, Face, Params};

/// 1000 upem at 100 px puts one font unit on one tenth of a pixel, so every
/// expected coordinate below is a font unit and the arithmetic is visible.
fn clean() -> Params {
    Params {
        size_px: 100.0,
        jitter_px: 0.0,
        axes: Axes::default(),
    }
}

fn face() -> Face {
    Face::new(support::font()).expect("the test font parses")
}

#[test]
fn metrics_come_from_the_font() {
    let mut face = face();
    assert_eq!(face.units_per_em, f32::from(support::UPEM));
    let instance = face.prepare(&Axes::default(), "").expect("the default instance");
    assert_eq!(instance.ascent, f32::from(support::ASCENDER));
    assert_eq!(instance.descent, f32::from(support::DESCENDER));
}

#[test]
fn emits_the_outline_the_font_holds() {
    let carrier = generate(&mut face(), "A", &clean(), "seed").expect("generates");

    // The square, in the compact encoding: an implicit lineto after the
    // moveto, an elided repeat, and no separator before a negative number.
    assert!(
        carrier
            .svg
            .contains(r#"<path d="m100 0 400 0 0-400-400 0z"/>"#),
        "{}",
        carrier.svg
    );
    assert!(
        carrier.svg.contains(r#"viewBox="0 -800 600 1000""#),
        "{}",
        carrier.svg
    );
    assert!(
        carrier.svg.contains(r#"fill="currentColor""#),
        "{}",
        carrier.svg
    );
    assert_eq!(
        (carrier.advance, carrier.ascent, carrier.descent),
        (600, 800, -200)
    );
}

#[test]
fn a_run_advances_by_the_sum_of_its_glyphs() {
    let carrier = generate(&mut face(), "AB", &clean(), "seed").expect("generates");
    assert_eq!(carrier.advance, 2 * i32::from(support::ADVANCE));
}

#[test]
fn quadratics_survive_as_quadratics() {
    // Flattening a curve to line segments would be a silent size and fidelity
    // regression, and nothing else in the output would show it.
    let carrier = generate(&mut face(), "B", &clean(), "seed").expect("generates");
    assert!(path_of(&carrier.svg).contains('q'), "{}", carrier.svg);
}

#[test]
fn no_style_attribute_anywhere() {
    // A nonce authorises a <style> element and can never authorise an
    // attribute, so one attribute left behind reinstates a refusal for every
    // strict-CSP page.
    let carrier = generate(&mut face(), "AB", &clean(), "seed").expect("generates");
    assert!(!carrier.svg.contains("style="), "{}", carrier.svg);
}

#[test]
fn a_seed_reproduces_the_carrier_exactly() {
    let params = Params::default();
    let first = generate(&mut face(), "AB", &params, "heo/1").expect("generates");
    let again = generate(&mut face(), "AB", &params, "heo/1").expect("generates");
    assert_eq!(first.svg, again.svg);
}

#[test]
fn a_different_seed_changes_the_bytes() {
    let params = Params::default();
    let first = generate(&mut face(), "AB", &params, "heo/1").expect("generates");
    let other = generate(&mut face(), "AB", &params, "heo/2").expect("generates");
    assert_ne!(first.svg, other.svg);
}

#[test]
fn permutation_changes_the_bytes_and_not_the_ink() {
    // The contour order is shuffled per load. Fill is nonzero-winding, so the
    // permutation is free — this is the assertion that it stays free.
    let mut seen = std::collections::BTreeSet::new();
    let mut bytes = std::collections::BTreeSet::new();
    for seed in ["a", "b", "c", "d"] {
        let carrier = generate(&mut face(), "AB", &clean(), seed).expect("generates");
        bytes.insert(path_of(&carrier.svg).to_string());
        seen.insert(contours(path_of(&carrier.svg)));
    }
    assert_eq!(seen.len(), 1, "the ink moved: {seen:?}");
    assert!(bytes.len() > 1, "the permutation never changed the output");
}

#[test]
fn jitter_moves_no_point_further_than_its_amplitude() {
    // Jitter and quantisation are the same axis: at 0.05 px into a user space
    // of tenths, no coordinate may move by more than one unit. A larger
    // amplitude moves ink, and invariant 1 is what that costs.
    //
    // The size is deliberately off the grid. This font's outlines are round
    // hundreds of units, so at a whole-pixel size every coordinate quantises
    // exactly and jitter of half a unit can never cross a rounding boundary —
    // which is the same reason the axis is nearly free.
    let still = Params {
        size_px: 100.5,
        jitter_px: 0.0,
        axes: Axes::default(),
    };
    let moved = Params {
        size_px: 100.5,
        jitter_px: 0.05,
        axes: Axes::default(),
    };
    let plain = contours(path_of(
        &generate(&mut face(), "AB", &still, "s")
            .expect("generates")
            .svg,
    ));
    let jittered = contours(path_of(
        &generate(&mut face(), "AB", &moved, "s")
            .expect("generates")
            .svg,
    ));

    let flat = |set: &std::collections::BTreeSet<Vec<(i32, i32)>>| {
        let mut points: Vec<(i32, i32)> = set.iter().flatten().copied().collect();
        points.sort_unstable();
        points
    };
    let (a, b) = (flat(&plain), flat(&jittered));
    assert_eq!(a.len(), b.len());
    // Sorted point lists are comparable because a one-unit move cannot reorder
    // points that are hundreds of units apart in this font.
    for (p, q) in a.iter().zip(b.iter()) {
        assert!(
            (p.0 - q.0).abs() <= 1 && (p.1 - q.1).abs() <= 1,
            "{p:?} moved to {q:?}"
        );
    }
    assert_ne!(a, b, "jitter never fired");
}

#[test]
fn refuses_a_character_the_font_lacks() {
    // Fail closed. Invariant 7: there is no plaintext fallback path, so a
    // carrier that cannot be drawn is an error and never a run of text.
    let result = generate(&mut face(), "AZ", &clean(), "seed");
    assert!(result.is_err());
}

#[test]
fn rejects_data_that_is_not_a_font() {
    assert!(Face::new(b"not a font at all".to_vec()).is_err());
}

// -- variation instances ----------------------------------------------------

/// A malformed axis list is a mistake, not a no-op.
///
/// A tag skrifa cannot match is ignored on purpose — that is what lets a static
/// face and a variable one take the same input — so a typo in the *spelling*
/// has to be caught here or `wght` misspelt draws the default instance with
/// nothing in the output to say so.
#[test]
fn rejects_axis_settings_it_cannot_read() {
    assert!(Axes::parse("wght").is_err());
    assert!(Axes::parse("wght=heavy").is_err());
    assert!(Axes::parse("weight=400").is_err());
    assert!(Axes::parse("wght=inf").is_err());
    assert!(Axes::parse("").is_ok());
    assert!(Axes::parse("wght=400,wdth=87.5").is_ok());
}

/// A static face ignores the settings rather than refusing them, which is what
/// makes a fallback font usable without knowing whether it is variable.
#[test]
fn a_static_face_draws_the_same_at_any_weight() {
    let bold = Params {
        axes: Axes::parse("wght=700").expect("parses"),
        ..clean()
    };
    let plain = generate(&mut face(), "AB", &clean(), "s").expect("generates");
    let heavy = generate(&mut face(), "AB", &bold, "s").expect("generates");
    assert_eq!(plain.svg, heavy.svg);
}

/// The real thing, on a variable face.
///
/// This is the defect that prompted the work: `LocationRef::default()` drew the
/// face's default instance whatever the page asked for, and no assertion over a
/// static test font can see it. Advance as well as outline, because `HVAR`
/// moves one and `gvar` the other, and getting one without the other is a
/// carrier that sits right and draws wrong.
///
/// The face comes from `font-test-data`, which is Fontations' own test corpus
/// published to crates.io — a dev-dependency rather than a file in this
/// repository, and the same bytes skrifa is itself tested against. It is
/// trimmed to a handful of glyphs, which is why the run below is `A` and not a
/// figure: the axis is what is under test, not the charmap.
#[test]
fn a_variable_face_draws_the_instance_it_is_given() {
    let bytes = font_test_data::VAZIRMATN_VAR.to_vec();
    let at = |spec: &str| {
        let params = Params {
            axes: Axes::parse(spec).expect("parses"),
            ..clean()
        };
        generate(
            &mut Face::new(bytes.clone()).expect("parses"),
            "A",
            &params,
            "s",
        )
        .expect("generates")
    };

    let thin = at("wght=100");
    let regular = at("wght=400");
    let bold = at("wght=700");
    assert_ne!(thin.svg, regular.svg);
    assert_ne!(regular.svg, bold.svg);
    assert!(
        thin.advance < bold.advance,
        "{} !< {}",
        thin.advance,
        bold.advance
    );
    // An unset axis list draws the face's *default* instance, which is whatever
    // the font says and not what the page asked for. That is the whole defect:
    // Public Sans defaults to `wght` 100 and drew Thin under a 400 paragraph.
    // This face defaults to 400, so the same rule shows up as the opposite
    // coincidence — which is why the assertion is that unset follows the font,
    // not that unset is light.
    assert_eq!(at("").svg, regular.svg);
    assert_ne!(at("").svg, bold.svg);
}

// -- reading the output back ------------------------------------------------

fn path_of(svg: &str) -> &str {
    let start = svg.find(r#"<path d=""#).expect("a path") + r#"<path d=""#.len();
    let rest = &svg[start..];
    &rest[..rest.find('"').expect("a closing quote")]
}

/// Walks the compact encoding back into absolute contours.
///
/// Doubles as a check that the encoding is well-formed: an over-eager elision
/// produces a path that cannot be walked, and nothing else in the output would
/// say so.
fn contours(d: &str) -> std::collections::BTreeSet<Vec<(i32, i32)>> {
    let mut out = std::collections::BTreeSet::new();
    let mut current: Vec<(i32, i32)> = Vec::new();
    let (mut x, mut y) = (0i32, 0i32);
    let (mut sx, mut sy) = (0i32, 0i32);
    let mut command = b'm';

    let bytes = d.as_bytes();
    let mut i = 0;
    let number = |i: &mut usize| -> i32 {
        while *i < bytes.len() && (bytes[*i] == b' ' || bytes[*i] == b',') {
            *i += 1;
        }
        let start = *i;
        if *i < bytes.len() && bytes[*i] == b'-' {
            *i += 1;
        }
        while *i < bytes.len() && bytes[*i].is_ascii_digit() {
            *i += 1;
        }
        assert!(*i > start, "expected a number at byte {start} of {d}");
        d[start..*i].parse().expect("an integer")
    };

    while i < bytes.len() {
        match bytes[i] {
            b' ' | b',' => {
                i += 1;
                continue;
            }
            c if c.is_ascii_alphabetic() => {
                command = c;
                i += 1;
            }
            // An elided repeat: the previous command runs again, except after a
            // moveto, where an implicit continuation is a lineto.
            _ if command == b'm' => command = b'l',
            _ => {}
        }

        match command {
            b'm' => {
                if !current.is_empty() {
                    out.insert(std::mem::take(&mut current));
                }
                x += number(&mut i);
                y += number(&mut i);
                sx = x;
                sy = y;
                current.push((x, y));
            }
            b'l' => {
                x += number(&mut i);
                y += number(&mut i);
                current.push((x, y));
            }
            b'q' => {
                let (cx, cy) = (x + number(&mut i), y + number(&mut i));
                current.push((cx, cy));
                x += number(&mut i);
                y += number(&mut i);
                current.push((x, y));
            }
            b'z' => {
                out.insert(std::mem::take(&mut current));
                x = sx;
                y = sy;
            }
            other => panic!("unexpected command {:?} in {d}", other as char),
        }
    }
    if !current.is_empty() {
        out.insert(current);
    }
    out
}
