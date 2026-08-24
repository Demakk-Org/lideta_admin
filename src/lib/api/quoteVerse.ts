/**
 * Bible-verse support for `quote` content blocks, shared by news, events and
 * lessons.
 *
 * A verse quote stores `isBibleVerse: true` and puts the reference in `ref` as
 * a **JSON string** — `{"book":43,"chapter":1,"verse":1,"toVerse":1}` — which
 * the app parses back into a map of ints. A plain quote keeps `ref` as ordinary
 * display text, so the flag is what tells the two apart.
 */
export type BibleVerseFields = {
  isBibleVerse?: boolean;
};

/** All four values are ints; `toVerse` equals `verse` for a single verse. */
export type VerseRefJson = {
  book: number;
  chapter: number;
  verse: number;
  toVerse: number;
};

function toInt(val: unknown): number | undefined {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

/** Builds the `ref` string for a verse quote. Empty when the pick is partial. */
export function encodeVerseRef(
  book: number,
  chapter: number,
  verse: number,
  toVerse: number,
): string {
  const b = toInt(book);
  const c = toInt(chapter);
  const v = toInt(verse);
  if (!b || !c || !v) return '';
  const to = toInt(toVerse);
  const payload: VerseRefJson = {
    book: b,
    chapter: c,
    verse: v,
    toVerse: to && to > v ? to : v,
  };
  return JSON.stringify(payload);
}

/**
 * Parses a `ref` written by {@link encodeVerseRef}. Returns null for ordinary
 * reference text, malformed JSON, or a reference missing book/chapter/verse.
 */
export function decodeVerseRef(ref: string | undefined): VerseRefJson | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const book = toInt(parsed.book);
    const chapter = toInt(parsed.chapter);
    const verse = toInt(parsed.verse);
    if (!book || !chapter || !verse) return null;
    const toVerse = toInt(parsed.toVerse);
    return {
      book,
      chapter,
      verse,
      toVerse: toVerse && toVerse > verse ? toVerse : verse,
    };
  } catch {
    return null;
  }
}

/** Human-readable label for a parsed reference, for display in the admin. */
export function formatVerseRef(
  bookName: string,
  parsed: VerseRefJson | null,
): string {
  if (!parsed) return '';
  const range =
    parsed.toVerse > parsed.verse
      ? `${parsed.verse}-${parsed.toVerse}`
      : `${parsed.verse}`;
  return `${bookName || `Book ${parsed.book}`} ${parsed.chapter}:${range}`;
}

/** Reads the flag off a stored quote value. */
export function bibleVerseFields(raw: unknown): BibleVerseFields {
  if (typeof raw !== 'object' || raw === null) return {};
  return (raw as Record<string, unknown>).isBibleVerse === true
    ? { isBibleVerse: true }
    : {};
}
