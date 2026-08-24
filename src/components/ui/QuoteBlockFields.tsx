"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getChapterCount, listBibleBooksAmharic } from "@/lib/api/books";
import { getVerseText } from "@/lib/api/bibleText";
import {
  decodeVerseRef,
  encodeVerseRef,
  formatVerseRef,
} from "@/lib/api/quoteVerse";
import type { BibleVerseFields } from "@/lib/api/quoteVerse";

export type QuoteFieldsValue = {
  text: string;
  ref: string;
} & BibleVerseFields;

const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

/**
 * Quote editor shared by news, events and lessons. A typed quote stores
 * `{ text, ref }` with `ref` as display text. A bible verse sets
 * `isBibleVerse: true` and puts the reference in `ref` as a JSON string the
 * app parses — `{"book":43,"chapter":1,"verse":1,"toVerse":1}`.
 */
export default function QuoteBlockFields({
  value,
  onChange,
  requireRef = false,
}: {
  value: QuoteFieldsValue;
  onChange: (next: QuoteFieldsValue) => void;
  /** Lessons throw in the app on a quote with no ref; news and events don't. */
  requireRef?: boolean;
}) {
  const books = useMemo(() => listBibleBooksAmharic(), []);

  // Persisted on the block, so reopening a saved verse quote keeps the flag.
  const isVerse = value.isBibleVerse === true;
  // Seeded by parsing the stored ref, so editing a saved verse quote reopens on
  // the same selection instead of an empty picker.
  const stored = useMemo(() => decodeVerseRef(value.ref), [value.ref]);
  const [book, setBook] = useState(stored?.book ?? 0);
  const [chapter, setChapter] = useState(stored?.chapter ?? 0);
  const [verse, setVerse] = useState(stored?.verse ?? 0);
  const [toVerse, setToVerse] = useState(
    stored && stored.toVerse > stored.verse ? stored.toVerse : 0,
  );
  const [loading, setLoading] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  const chapterCount = getChapterCount(book);
  const bookName = books.find((b) => b.index === book)?.name ?? "";

  // Keep the latest onChange without retriggering the lookup.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Fill text and ref from the local Amharic bible whenever the selection is
  // complete. A range concatenates its verses.
  useEffect(() => {
    if (!isVerse || !book || !chapter || !verse) return;
    const last = toVerse > verse ? toVerse : verse;
    const numbers = Array.from(
      { length: last - verse + 1 },
      (_, i) => verse + i,
    );
    let cancelled = false;
    setLoading(true);
    setLookupFailed(false);
    Promise.all(numbers.map((n) => getVerseText(book, chapter, n)))
      .then((texts) => {
        if (cancelled) return;
        const joined = texts.filter(Boolean).join(" ").trim();
        setLookupFailed(!joined);
        onChangeRef.current({
          text: joined,
          ref: encodeVerseRef(book, chapter, verse, toVerse),
          isBibleVerse: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLookupFailed(true);
        onChangeRef.current({
          text: "",
          ref: encodeVerseRef(book, chapter, verse, toVerse),
          isBibleVerse: true,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isVerse, book, chapter, verse, toVerse, bookName]);

  const refMissing = requireRef && !value.ref.trim();

  return (
    <div className="mt-2 space-y-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isVerse}
          onChange={(e) => {
            if (!e.target.checked) {
              // The JSON ref is meaningless without the flag, so clear it and
              // leave a plain quote behind.
              onChange({
                text: value.text,
                ref: decodeVerseRef(value.ref) ? "" : value.ref,
              });
              return;
            }
            onChange({
              text: value.text,
              ref: encodeVerseRef(book, chapter, verse, toVerse),
              isBibleVerse: true,
            });
          }}
          className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-xs font-medium text-primary-800">
          This quote is a bible verse
        </span>
      </label>

      {isVerse && (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-primary-200 bg-primary-50/40 p-2 sm:grid-cols-5">
          <select
            value={book || ""}
            onChange={(e) => {
              const idx = num(e.target.value);
              setBook(idx);
              // Clear a chapter that no longer fits the chosen book.
              if (chapter > getChapterCount(idx)) setChapter(0);
            }}
            className="col-span-2 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            title="Book"
          >
            <option value="">Select book</option>
            {books.map((b) => (
              <option key={b.index} value={b.index}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={chapter || ""}
            onChange={(e) => setChapter(num(e.target.value))}
            disabled={!book || chapterCount === 0}
            className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            title="Chapter"
          >
            <option value="">Chapter</option>
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={verse || ""}
            onChange={(e) => setVerse(num(e.target.value))}
            className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Verse"
            title="Verse"
          />
          <input
            type="number"
            min={0}
            value={toVerse || ""}
            onChange={(e) => setToVerse(num(e.target.value))}
            className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="To (opt.)"
            title="Last verse of the range"
          />
          {loading && (
            <p className="col-span-2 text-xs text-primary-600 sm:col-span-5">
              Loading verse text...
            </p>
          )}
          {!loading && lookupFailed && (
            <p className="col-span-2 text-xs text-amber-700 sm:col-span-5">
              No text found for that verse — type it in below.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Quote text"
          rows={2}
        />
        <input
          type="text"
          value={value.ref}
          onChange={(e) => onChange({ ...value, ref: e.target.value })}
          // A verse ref is generated JSON the app parses — editing it by hand
          // would only corrupt it.
          readOnly={isVerse}
          className={`block h-fit w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            isVerse ? "bg-primary-50 font-mono text-xs" : "bg-white"
          } ${
            refMissing
              ? "border-red-400 focus:ring-red-500"
              : "border-primary-300 focus:ring-primary-500"
          }`}
          placeholder={requireRef ? "John 1:1 (required)" : "Reference (optional)"}
        />
      </div>
      {isVerse && value.ref && (
        <p className="text-xs text-primary-600">
          Reference stored as JSON for the app to parse
          {formatVerseRef(bookName, decodeVerseRef(value.ref))
            ? ` — ${formatVerseRef(bookName, decodeVerseRef(value.ref))}`
            : ""}
        </p>
      )}
      {refMissing && (
        <p className="text-xs text-red-600">
          A quote without a reference crashes the lesson in the app.
        </p>
      )}
    </div>
  );
}
