//! The path serializer.
//!
//! Every size decision in the generator lives in this file, and there is no
//! crate worth taking for it: `kurbo::to_svg` emits absolute commands at full
//! `f64` precision with a separator before every coordinate, which is the
//! largest encoding of the smallest useful information.
//!
//! Four techniques compose to 40% of the naive output, measured:
//!
//! - coordinates are integers in a user space of tenths of a pixel, so the
//!   precision lives in the `viewBox` and no number carries a decimal point;
//! - commands are relative, so deltas between adjacent control points are small
//!   integers where absolute coordinates are not;
//! - a repeated command letter is elided;
//! - the separator before a negative number is elided, because the minus sign
//!   is one.
//!
//! Integers also make invariant 5 cheap across hosts: float-to-decimal
//! formatting differs between Rust, JavaScript and Python and integers do not,
//! so quantisation happens before serialization and never after.

/// Writes SVG path data in the compact encoding.
pub struct PathWriter {
    out: String,
    cur: (i32, i32),
    subpath_start: (i32, i32),
    prev: u8,
    needs_sep: bool,
}

impl PathWriter {
    pub fn new() -> Self {
        PathWriter {
            out: String::new(),
            cur: (0, 0),
            subpath_start: (0, 0),
            prev: 0,
            needs_sep: false,
        }
    }

    pub fn finish(self) -> String {
        self.out
    }

    pub fn move_to(&mut self, x: i32, y: i32) {
        self.command(b'm');
        self.delta(x, y);
        self.subpath_start = (x, y);
    }

    pub fn line_to(&mut self, x: i32, y: i32) {
        self.command(b'l');
        self.delta(x, y);
    }

    pub fn quad_to(&mut self, cx: i32, cy: i32, x: i32, y: i32) {
        let from = self.cur;
        self.command(b'q');
        self.number(cx - from.0);
        self.number(cy - from.1);
        self.delta(x, y);
    }

    pub fn cubic_to(&mut self, c0: (i32, i32), c1: (i32, i32), x: i32, y: i32) {
        let from = self.cur;
        self.command(b'c');
        self.number(c0.0 - from.0);
        self.number(c0.1 - from.1);
        self.number(c1.0 - from.0);
        self.number(c1.1 - from.1);
        self.delta(x, y);
    }

    pub fn close(&mut self) {
        self.command(b'z');
        self.cur = self.subpath_start;
    }

    /// Emits a coordinate pair relative to the current point and advances it.
    fn delta(&mut self, x: i32, y: i32) {
        let from = self.cur;
        self.number(x - from.0);
        self.number(y - from.1);
        self.cur = (x, y);
    }

    fn command(&mut self, c: u8) {
        // A coordinate pair following a moveto is an implicit lineto, so `l`
        // after `m` is free.
        let implicit = if self.prev == b'm' { b'l' } else { self.prev };
        if c != implicit {
            self.out.push(c as char);
            self.needs_sep = false;
        }
        self.prev = c;
    }

    fn number(&mut self, mut v: i32) {
        if v < 0 {
            // The minus sign separates as well as any comma.
            self.out.push('-');
            self.needs_sep = false;
            v = -v;
        } else if self.needs_sep {
            self.out.push(' ');
        }

        let mut buf = [0u8; 10];
        let mut n = 0;
        loop {
            buf[n] = b'0' + (v % 10) as u8;
            v /= 10;
            n += 1;
            if v == 0 {
                break;
            }
        }
        while n > 0 {
            n -= 1;
            self.out.push(buf[n] as char);
        }
        self.needs_sep = true;
    }
}

/// Formats a value in tenths of a pixel as a CSS pixel length, with at most one
/// decimal place and no trailing zero.
pub fn tenths_to_px(v: i32) -> String {
    let whole = v / 10;
    let frac = (v % 10).abs();
    if frac == 0 {
        whole.to_string()
    } else if v < 0 && whole == 0 {
        format!("-0.{frac}")
    } else {
        format!("{whole}.{frac}")
    }
}
