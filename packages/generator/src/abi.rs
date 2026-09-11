//! The C ABI.
//!
//! A plain `cdylib` with four functions and no `wasm-bindgen`. Ten lines of
//! loader on the host side, no glue crate, no CJS/ESM packaging question, and
//! full control of the memory protocol.
//!
//! Font bytes are passed in by the host and never embedded: a font compiled in
//! would be ~300 KB of incompressible data segment, and it forecloses the one
//! integration requirement the generator already has — using the publisher's
//! actual font. It also keeps the file pristine, which is what OFL clause 5's
//! document exemption rests on.
//!
//! `heo_generate` returns one buffer: twelve bytes of little-endian metrics
//! (advance, ascent, descent, in tenths of a pixel) followed by UTF-8 SVG. One
//! call, one copy, one free.

use std::cell::RefCell;

use crate::{generate, Axes, Face, Params};

pub const METRICS_BYTES: usize = 12;

thread_local! {
    static FACE: RefCell<Option<Face>> = const { RefCell::new(None) };
}

/// Reserves `len` bytes for the host to write into. Pair with `heo_free`.
///
/// # Safety
/// The returned pointer is valid for `len` bytes and must be released with
/// `heo_free` passing the same length.
#[no_mangle]
pub extern "C" fn heo_alloc(len: usize) -> *mut u8 {
    // A boxed slice rather than a `Vec`, because `heo_free` has to reconstruct
    // the allocation and can only be told a length. `Vec::with_capacity(n)`
    // guarantees capacity *at least* n and the allocator may round up, so
    // rebuilding it as `from_raw_parts(ptr, n, n)` would claim a capacity the
    // allocation might not have — undefined behaviour that happens to work
    // until something changes the allocator. A boxed slice's capacity is its
    // length by construction, which is the invariant the free side needs.
    Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>()
}

/// Releases a buffer from `heo_alloc` or `heo_generate`.
///
/// # Safety
/// `ptr` must come from this module and `len` must be the length it was
/// created with.
#[no_mangle]
pub unsafe extern "C" fn heo_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        // Both producers hand out a boxed slice — `heo_alloc` directly and
        // `heo_generate` through `into_boxed_slice` — so length is capacity and
        // this reconstructs exactly what was allocated.
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}

/// Parses a font and installs it as the active face. Returns 0 on success.
///
/// # Safety
/// `ptr` must be valid for `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn heo_init(ptr: *const u8, len: usize) -> i32 {
    if ptr.is_null() {
        return -1;
    }
    let data = std::slice::from_raw_parts(ptr, len).to_vec();
    match Face::new(data) {
        Ok(face) => {
            FACE.with(|slot| *slot.borrow_mut() = Some(face));
            0
        }
        Err(_) => -1,
    }
}

/// Generates a carrier. Returns a pointer to a metrics-prefixed buffer and
/// writes its length to `out_len`, or null on failure.
///
/// `axes` is the position in the font's variation space, spelled the way CSS
/// spells it — `wght=400`, or `wght=400,wdth=87.5`, empty for the face's own
/// default instance. It rides on the call rather than on `heo_init` because it
/// describes the text and not the file: the same font at two weights is one
/// face with two cached glyph tables, not two modules with two memories, and a
/// per-mark override needs no new entry point.
///
/// # Safety
/// The text, seed and axes pointers must be valid UTF-8 for their given
/// lengths, and `out_len` must be writable. The returned buffer is released
/// with `heo_free`.
#[no_mangle]
pub unsafe extern "C" fn heo_generate(
    text_ptr: *const u8,
    text_len: usize,
    seed_ptr: *const u8,
    seed_len: usize,
    axes_ptr: *const u8,
    axes_len: usize,
    size_px: f64,
    jitter_px: f64,
    out_len: *mut usize,
) -> *mut u8 {
    if text_ptr.is_null() || seed_ptr.is_null() || out_len.is_null() {
        return std::ptr::null_mut();
    }
    if axes_ptr.is_null() && axes_len != 0 {
        return std::ptr::null_mut();
    }
    let Ok(text) = std::str::from_utf8(std::slice::from_raw_parts(text_ptr, text_len)) else {
        return std::ptr::null_mut();
    };
    let Ok(seed) = std::str::from_utf8(std::slice::from_raw_parts(seed_ptr, seed_len)) else {
        return std::ptr::null_mut();
    };
    let axes_bytes: &[u8] = if axes_len == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(axes_ptr, axes_len)
    };
    let Ok(axes_spec) = std::str::from_utf8(axes_bytes) else {
        return std::ptr::null_mut();
    };
    let Ok(axes) = Axes::parse(axes_spec) else {
        return std::ptr::null_mut();
    };
    let params = Params {
        size_px,
        jitter_px,
        axes,
    };

    let result = FACE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let face = slot.as_mut()?;
        generate(face, text, &params, seed).ok()
    });

    let Some(carrier) = result else {
        return std::ptr::null_mut();
    };

    let mut buf = Vec::with_capacity(METRICS_BYTES + carrier.svg.len());
    buf.extend_from_slice(&carrier.advance.to_le_bytes());
    buf.extend_from_slice(&carrier.ascent.to_le_bytes());
    buf.extend_from_slice(&carrier.descent.to_le_bytes());
    buf.extend_from_slice(carrier.svg.as_bytes());

    let mut buf = buf.into_boxed_slice();
    *out_len = buf.len();
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}
