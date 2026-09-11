/**
 * A TrueType font, built in memory, for the carrier check.
 *
 * The check has to render the *same face* twice: once as native text through
 * Chromium's own text stack, and once as outlines the generator read out of a
 * font file. Any other arrangement measures the difference between two fonts
 * rather than the difference between two ways of drawing one.
 *
 * That rules out the two obvious sources. A system font is not the same file on
 * two machines, and the renderer answers every subresource request with a 404
 * by design, so a web font cannot be fetched. What is left is a font embedded
 * in the document as a `data:` URL and handed to the generator as the same
 * bytes — which means building one, because vendoring a real face would put a
 * few hundred kilobytes of binary and a licence question in the repository for
 * one test.
 *
 * The glyphs are rectangles. That is not a shortcut: the question this font
 * exists to answer is whether a carrier lands on the baseline at the right
 * advance, and a rectangle answers it exactly while making the expected ink
 * computable by hand. Legibility is not under test here and could not be tested
 * by a pixel comparison anyway.
 *
 * `packages/generator/tests/support/mod.rs` builds a smaller font for the same
 * reason on the other side of the boundary. The duplication is deliberate: that
 * one is three glyphs with known outlines for asserting on emitted path data,
 * this one has to survive OpenType sanitisation and be laid out by a browser,
 * and merging them would make each worse at its own job.
 */

export const UPEM = 1000;
export const ASCENDER = 800;
export const DESCENDER = -200;

/** Characters the font covers. Anything else is a refusal, which is tested. */
export const COVERAGE = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$%.,:-()";

/** Glyphs that hang below the baseline, so the descent shift is under test. */
const DESCENDING = new Set([..."gjpqy,()$"]);

interface Glyph {
  advance: number;
  /** Closed contour as on-curve points, or empty for a blank glyph. */
  contour: [number, number][];
}

/**
 * Advances vary per character rather than being uniform. A carrier's width is
 * the sum of the advances it drew, so a uniform font would let an off-by-one in
 * that sum pass unnoticed.
 */
function glyphFor(char: string): Glyph {
  if (char === " ") return { advance: 500, contour: [] };
  const code = char.codePointAt(0) as number;
  const advance = 420 + (code % 6) * 70;
  const left = 60;
  const right = advance - 60;
  const [bottom, top] = DESCENDING.has(char) ? [DESCENDER + 20, 520] : [0, 700];
  return {
    advance,
    contour: [
      [left, bottom],
      [right, bottom],
      [right, top],
      [left, top],
    ],
  };
}

class Writer {
  private bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }
  u16(value: number): this {
    return this.u8(value >> 8).u8(value);
  }
  i16(value: number): this {
    return this.u16(value < 0 ? value + 0x10000 : value);
  }
  u32(value: number): this {
    return this.u16(value >>> 16).u16(value & 0xffff);
  }
  tag(value: string): this {
    for (const char of value) this.u8(char.charCodeAt(0));
    return this;
  }
  raw(values: Uint8Array | number[]): this {
    for (const value of values) this.u8(value);
    return this;
  }
  zeros(count: number): this {
    for (let i = 0; i < count; i++) this.u8(0);
    return this;
  }
  align4(): this {
    while (this.bytes.length % 4 !== 0) this.u8(0);
    return this;
  }
  get length(): number {
    return this.bytes.length;
  }
  finish(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function simpleGlyph(glyph: Glyph): Uint8Array {
  if (glyph.contour.length === 0) return new Uint8Array(0);
  const xs = glyph.contour.map(([x]) => x);
  const ys = glyph.contour.map(([, y]) => y);

  const out = new Writer();
  out.i16(1);
  out
    .i16(Math.min(...xs))
    .i16(Math.min(...ys))
    .i16(Math.max(...xs))
    .i16(Math.max(...ys));
  out.u16(glyph.contour.length - 1);
  out.u16(0); // instructionLength

  // Long form throughout: one flag byte per point, i16 deltas. Nothing here is
  // trying to be small, and the short forms are where hand-built fonts go wrong.
  for (let i = 0; i < glyph.contour.length; i++) out.u8(0x01);
  let previous = 0;
  for (const x of xs) {
    out.i16(x - previous);
    previous = x;
  }
  previous = 0;
  for (const y of ys) {
    out.i16(y - previous);
    previous = y;
  }
  return out.align4().finish();
}

/** Format 4, which is the subtable every rasteriser is guaranteed to read. */
function cmapTable(codes: number[]): Uint8Array {
  // Sorted by code point, not by glyph order: format 4's segments have to
  // ascend, and the coverage string is written in reading order.
  const mapping = codes
    .map((code, index) => ({ code, gid: index + 1 }))
    .sort((a, b) => a.code - b.code);

  const segments: { start: number; end: number; gid: number }[] = [];
  for (const { code, gid } of mapping) {
    const last = segments[segments.length - 1];
    if (last !== undefined && code === last.end + 1 && gid === last.gid + (code - last.start)) {
      last.end = code;
      continue;
    }
    segments.push({ start: code, end: code, gid });
  }
  segments.push({ start: 0xffff, end: 0xffff, gid: 0 });

  const count = segments.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 * 2 ** entrySelector;

  const sub = new Writer();
  sub
    .u16(4)
    .u16(16 + count * 8)
    .u16(0);
  sub
    .u16(count * 2)
    .u16(searchRange)
    .u16(entrySelector)
    .u16(count * 2 - searchRange);
  for (const segment of segments) sub.u16(segment.end);
  sub.u16(0); // reservedPad
  for (const segment of segments) sub.u16(segment.start);
  for (const segment of segments) {
    let delta = (segment.gid - segment.start) % 0x10000;
    if (delta > 0x7fff) delta -= 0x10000;
    if (delta < -0x8000) delta += 0x10000;
    sub.i16(delta);
  }
  for (const _ of segments) sub.u16(0); // idRangeOffset

  const table = new Writer();
  table.u16(0).u16(1);
  table.u16(3).u16(1).u32(12);
  return table.raw(sub.finish()).finish();
}

function nameTable(family: string): Uint8Array {
  const records: [number, string][] = [
    [1, family],
    [2, "Regular"],
    [3, `${family};HEO;1.0`],
    [4, family],
    [5, "Version 1.0"],
    [6, family.replace(/\s+/gu, "")],
  ];

  const storage = new Writer();
  const offsets: [number, number][] = [];
  for (const [, value] of records) {
    const start = storage.length;
    for (const char of value) storage.u16(char.charCodeAt(0));
    offsets.push([start, storage.length - start]);
  }

  const table = new Writer();
  table
    .u16(0)
    .u16(records.length)
    .u16(6 + records.length * 12);
  for (let index = 0; index < records.length; index++) {
    const [nameId] = records[index] as [number, string];
    const [offset, length] = offsets[index] as [number, number];
    table.u16(3).u16(1).u16(0x0409).u16(nameId).u16(length).u16(offset);
  }
  return table.raw(storage.finish()).finish();
}

/**
 * OS/2 version 4, with the typographic, window and `hhea` metrics all set to
 * the same numbers.
 *
 * Which of the three a shaper believes depends on the platform and on the
 * `USE_TYPO_METRICS` bit, and the generator and the browser need not make the
 * same choice. Making them identical removes the question instead of betting on
 * the answer.
 */
function os2Table(): Uint8Array {
  const out = new Writer();
  out.u16(4).i16(600).u16(400).u16(5).u16(0);
  for (const value of [650, 700, 0, 140, 650, 700, 0, 480]) out.i16(value);
  out.i16(50).i16(300).i16(0);
  out.zeros(10); // panose
  out.u32(0x0000_000f).u32(0).u32(0).u32(0);
  out.tag("HEO ");
  out.u16(0x0040); // fsSelection: REGULAR, and deliberately not USE_TYPO_METRICS
  out.u16(0x0020).u16(0xffff);
  out.i16(ASCENDER).i16(DESCENDER).i16(0);
  out.u16(ASCENDER).u16(-DESCENDER);
  out.u32(1).u32(0);
  out.i16(500).i16(700).u16(0).u16(0x0020).u16(1);
  return out.finish();
}

function assemble(tables: [string, Uint8Array][]): Uint8Array {
  const sorted = [...tables].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const count = sorted.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 16;

  const out = new Writer();
  out
    .u32(0x0001_0000)
    .u16(count)
    .u16(searchRange)
    .u16(entrySelector)
    .u16(count * 16 - searchRange);

  let offset = 12 + count * 16;
  const body = new Writer();
  for (const [tag, data] of sorted) {
    out.tag(tag).u32(0).u32(offset).u32(data.length);
    body.raw(data);
    offset += data.length;
    while (body.length % 4 !== 0) {
      body.u8(0);
      offset += 1;
    }
  }
  return out.raw(body.finish()).finish();
}

/** The font file. Same bytes for the browser and for the generator. */
export function buildTestFont(family = "HeoRect", coverage = COVERAGE): Uint8Array {
  const chars = [...coverage];
  const glyphs: Glyph[] = [{ advance: 500, contour: [] }, ...chars.map(glyphFor)];

  const glyf = new Writer();
  const loca = new Writer();
  for (const glyph of glyphs) {
    loca.u32(glyf.length);
    glyf.raw(simpleGlyph(glyph));
  }
  loca.u32(glyf.length);

  const head = new Writer();
  head.u32(0x0001_0000).u32(0x0001_0000).u32(0).u32(0x5f0f_3cf5);
  head.u16(0x000b).u16(UPEM).zeros(16);
  head.i16(0).i16(DESCENDER).i16(1000).i16(ASCENDER);
  head.u16(0).u16(8).i16(2).i16(1).i16(0);

  const hhea = new Writer();
  hhea.u32(0x0001_0000).i16(ASCENDER).i16(DESCENDER).i16(0);
  hhea.u16(Math.max(...glyphs.map((glyph) => glyph.advance)));
  hhea.i16(0).i16(0).i16(1000).i16(1).i16(0).i16(0).zeros(8).i16(0).u16(glyphs.length);

  const maxp = new Writer();
  maxp.u32(0x0001_0000).u16(glyphs.length).zeros(26);

  const hmtx = new Writer();
  for (const glyph of glyphs) hmtx.u16(glyph.advance).i16(glyph.contour.length === 0 ? 0 : 60);

  const post = new Writer();
  post.u32(0x0003_0000).u32(0).i16(-100).i16(50).u32(0).zeros(16);

  return assemble([
    ["OS/2", os2Table()],
    ["cmap", cmapTable(chars.map((char) => char.codePointAt(0) as number))],
    ["glyf", glyf.finish()],
    ["head", head.finish()],
    ["hhea", hhea.finish()],
    ["hmtx", hmtx.finish()],
    ["loca", loca.finish()],
    ["maxp", maxp.finish()],
    ["name", nameTable(family)],
    ["post", post.finish()],
  ]);
}

/** The `@font-face` rule that puts the same bytes in front of the browser. */
export function fontFaceRule(font: Uint8Array, family = "HeoRect"): string {
  const base64 = Buffer.from(font).toString("base64");
  return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${base64}) format('truetype')}`;
}
