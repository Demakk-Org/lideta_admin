"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import { getChapterCount, listBibleBooksAmharic } from "@/lib/api/books";
import type { BibleBook } from "@/lib/api/books";
import { getVerseText } from "@/lib/api/bibleText";
import type { Verse } from "@/lib/api/bibleStudies";

export function emptyVerse(): Verse {
  return { bookName: "", book: 0, chapter: 0, verse: 0, text: "" };
}

const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

function VerseRow({
  verse,
  index,
  books,
  onChange,
  onRemove,
}: {
  verse: Verse;
  index: number;
  books: BibleBook[];
  onChange: (patch: Partial<Verse>) => void;
  onRemove: () => void;
}) {
  const chapterCount = getChapterCount(verse.book);

  // Keep the latest onChange without retriggering the auto-fill effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Auto-fill verse text from the local Amharic bible when book/chapter/verse
  // change. If the lookup misses, clear the field so it can be typed manually.
  const [textLoading, setTextLoading] = useState(false);
  useEffect(() => {
    const b = verse.book;
    const c = verse.chapter;
    const v = verse.verse;
    if (!b || !c || !v) return;
    let cancelled = false;
    setTextLoading(true);
    getVerseText(b, c, v)
      .then((text) => {
        if (!cancelled) onChangeRef.current({ text: text ?? "" });
      })
      .catch(() => {
        if (!cancelled) onChangeRef.current({ text: "" });
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verse.book, verse.chapter, verse.verse]);

  return (
    <div className="space-y-2 rounded-md border border-primary-200 bg-primary-50/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary-700">
          Verse {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-red-600 hover:text-red-700"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={verse.book || ""}
          onChange={(e) => {
            const bookIdx = num(e.target.value);
            const book = books.find((b) => b.index === bookIdx);
            const maxCh = getChapterCount(bookIdx);
            onChange({
              book: bookIdx,
              bookName: book?.name ?? "",
              // Clear chapter if it no longer fits the chosen book.
              chapter: verse.chapter > maxCh ? 0 : verse.chapter,
            });
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
          value={verse.chapter || ""}
          onChange={(e) => onChange({ chapter: num(e.target.value) })}
          disabled={!verse.book || chapterCount === 0}
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
          value={verse.verse || ""}
          onChange={(e) => onChange({ verse: num(e.target.value) })}
          className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Verse"
          title="Verse"
        />
      </div>
      <textarea
        value={verse.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className="block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder={textLoading ? "Loading verse text..." : "Verse text"}
        rows={2}
      />
    </div>
  );
}

export default function KeyVersesEditor({
  items,
  onChange,
}: {
  items: Verse[];
  onChange: (next: Verse[]) => void;
}) {
  const books = useMemo(() => listBibleBooksAmharic(), []);

  const update = (idx: number, patch: Partial<Verse>) => {
    onChange(items.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-primary-800">
          Key Verses
        </label>
        <AppButton
          type="button"
          variant={AppButtonVariant.Add}
          className="px-3 py-1 text-xs"
          onClick={() => onChange([...items, emptyVerse()])}
        >
          Add verse
        </AppButton>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-primary-600">No key verses added.</p>
      )}

      {items.map((v, idx) => (
        <VerseRow
          key={idx}
          verse={v}
          index={idx}
          books={books}
          onChange={(patch) => update(idx, patch)}
          onRemove={() => remove(idx)}
        />
      ))}
    </div>
  );
}
