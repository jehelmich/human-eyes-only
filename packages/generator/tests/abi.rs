//! The C ABI, exercised the way the host uses it: bytes in, one buffer out.

mod support;

use heo_generator::abi::{heo_alloc, heo_free, heo_generate, heo_init, METRICS_BYTES};

fn copy_in(bytes: &[u8]) -> *mut u8 {
    let ptr = heo_alloc(bytes.len());
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len()) };
    ptr
}

#[test]
fn generates_through_the_boundary() {
    let font = support::font();
    let font_ptr = copy_in(&font);
    assert_eq!(unsafe { heo_init(font_ptr, font.len()) }, 0);
    unsafe { heo_free(font_ptr, font.len()) };

    let text = b"AB";
    let seed = b"heo/1";
    // A well-formed axis list a static face has no axis for: ignored, which is
    // what lets one call site serve a variable face and a static fallback.
    let axes = b"wght=400";
    let mut len: usize = 0;
    let out = unsafe {
        heo_generate(
            text.as_ptr(),
            text.len(),
            seed.as_ptr(),
            seed.len(),
            axes.as_ptr(),
            axes.len(),
            100.0,
            0.0,
            &mut len,
        )
    };
    assert!(!out.is_null());

    let buf = unsafe { std::slice::from_raw_parts(out, len) };
    let metric = |i: usize| i32::from_le_bytes(buf[i * 4..i * 4 + 4].try_into().unwrap());
    assert_eq!((metric(0), metric(1), metric(2)), (1200, 800, -200));

    let svg = std::str::from_utf8(&buf[METRICS_BYTES..]).expect("utf-8");
    assert!(svg.starts_with("<svg "), "{svg}");
    assert!(svg.ends_with("</svg>"), "{svg}");

    unsafe { heo_free(out, len) };
}

#[test]
fn refuses_before_a_font_is_installed() {
    // Each test gets its own thread, and the face is thread-local, so this one
    // starts with an empty slot.
    let mut len: usize = 0;
    let out = unsafe {
        heo_generate(
            b"A".as_ptr(),
            1,
            b"s".as_ptr(),
            1,
            std::ptr::null(),
            0,
            16.0,
            0.05,
            &mut len,
        )
    };
    assert!(out.is_null());
}

#[test]
fn refuses_an_axis_list_it_cannot_read() {
    let font = support::font();
    let font_ptr = copy_in(&font);
    assert_eq!(unsafe { heo_init(font_ptr, font.len()) }, 0);
    unsafe { heo_free(font_ptr, font.len()) };

    let axes = b"wght";
    let mut len: usize = 0;
    let out = unsafe {
        heo_generate(
            b"A".as_ptr(),
            1,
            b"s".as_ptr(),
            1,
            axes.as_ptr(),
            axes.len(),
            16.0,
            0.05,
            &mut len,
        )
    };
    assert!(out.is_null());
}
