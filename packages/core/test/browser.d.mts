/** Types for `browser.mjs`, which is plain JavaScript so both of its callers can load it. */

export interface Reader {
  /** Whitespace-normalised painted text of a document, or of HTML source. */
  readingText(input: string | object): string;
}

export function createReader(
  isConcealed: (node: { declarations?: string | null; hidden?: boolean }) => boolean,
): Reader;
