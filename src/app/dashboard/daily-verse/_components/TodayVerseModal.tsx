"use client";

import { AMHARIC_MONTHS, getChapterCount, isEthiopianLeapYear, listBibleBooksAmharic } from "@/lib/api/books";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import AppModal from "@/components/ui/AppModal";
import { useEffect, useMemo, useState } from "react";
import type { VerseForm } from "./types";

type Props = {
  isOpen: boolean;
  form: VerseForm;
  setForm: React.Dispatch<React.SetStateAction<VerseForm>>;
  submitting: boolean;
  submitLabel: string;
  submitVariant: AppButtonVariant;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export default function TodayVerseModal({ isOpen, form, setForm, submitting, submitLabel, submitVariant, onSubmit, onClose }: Props) {
  const books = useMemo(() => listBibleBooksAmharic(), []);
  const chapterCount = useMemo(() => getChapterCount(Number(form.book) || 0), [form.book]);
  const chapterOptions = useMemo(() => Array.from({ length: chapterCount }, (_, i) => String(i + 1)), [chapterCount]);
  const [verseCounts, setVerseCounts] = useState<Record<number, number[]>>({});
  const [vcLoading, setVcLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setVcLoading(true);
        const res = await fetch("/api/verse-counts");
        if (!res.ok) throw new Error("Failed to load verse counts");
        const json = await res.json();
        if (mounted) setVerseCounts(json);
      } catch {
        // keep empty, verse input will remain flexible if API fails
      } finally {
        if (mounted) setVcLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  const verseMax = useMemo(() => {
    const b = Number(form.book);
    const c = Number(form.chapter);
    if (Number.isNaN(b) || Number.isNaN(c) || !verseCounts[b]) return 0;
    return verseCounts[b]?.[c - 1] ?? 0;
  }, [form.book, form.chapter, verseCounts]);

  const verseOptions = useMemo(() => {
    return verseMax > 0 ? Array.from({ length: verseMax }, (_, i) => String(i + 1)) : [];
  }, [verseMax]);
  const daysInMonth = useMemo(() => {
    const m = Number(form.month);
    const y = Number(form.year);
    if (Number.isNaN(m)) return 30;
    if (m === 13) {
      if (Number.isNaN(y)) return 5; // default when year empty
      return isEthiopianLeapYear(y) ? 6 : 5;
    }
    return 30;
  }, [form.month, form.year]);
  useEffect(() => {
    const d = Number(form.day);
    if (!Number.isNaN(d) && d > daysInMonth) {
      setForm((s) => ({ ...s, day: String(daysInMonth) }));
    }
  }, [daysInMonth, form.day, setForm]);

  // Clamp verse when chapter/book changes
  useEffect(() => {
    if (!verseMax) return;
    const v = Number(form.verse);
    if (!Number.isNaN(v) && v > verseMax) {
      setForm((s) => ({ ...s, verse: String(verseMax) }));
    }
  }, [verseMax, form.verse, setForm]);
  if (!isOpen) return null;
  return (
    <AppModal
      open={isOpen}
      type={submitVariant === AppButtonVariant.Edit ? "edit" : "add"}
      title="Daily Verse"
      onClose={onClose}
      footer={
        <AppButton
          type="submit"
          disabled={submitting}
          variant={submitVariant}
          form="dailyVerseForm"
        >
          {submitting ? "Saving..." : submitLabel || "Save"}
        </AppButton>
      }
    >
      <form id="dailyVerseForm" onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">Book</label>
            <select
              value={form.book}
              onChange={(e) =>
                setForm((s) => {
                  const newBook = e.target.value;
                  const maxCh = getChapterCount(Number(newBook) || 0);
                  const chNum = Number(s.chapter);
                  const nextChapter = !Number.isNaN(chNum) && chNum > maxCh ? "" : s.chapter;
                  return { ...s, book: newBook, chapter: nextChapter };
                })
              }
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select a book</option>
              {books.map((b) => (
                <option key={b.index} value={String(b.index)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Chapter</label>
            <select
              value={form.chapter}
              onChange={(e) => setForm((s) => ({ ...s, chapter: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select chapter</option>
              {chapterOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Verse</label>
            <select
              value={form.verse}
              onChange={(e) => setForm((s) => ({ ...s, verse: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
              disabled={!form.book || !form.chapter || vcLoading || verseMax === 0}
            >
              <option value="">{vcLoading ? "Loading..." : "Select verse"}</option>
              {verseOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ReferencePreview form={form} books={books} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">EC Day</label>
            <select
              value={form.day}
              onChange={(e) => setForm((s) => ({ ...s, day: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Day</option>
              {Array.from({ length: daysInMonth }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">EC Month</label>
            <select
              value={form.month}
              onChange={(e) => setForm((s) => ({ ...s, month: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Month</option>
              {AMHARIC_MONTHS.map((m, idx) => (
                <option key={idx + 1} value={String(idx + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">EC Year</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="2017"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-primary-800">Text</label>
            <textarea
              value={form.text}
              onChange={(e) => setForm((s) => ({ ...s, text: e.target.value }))}
              rows={3}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="He gives strength to the weary..."
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">Tag</label>
            <input
              type="text"
              value={form.tag}
              onChange={(e) => setForm((s) => ({ ...s, tag: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Encouragement"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
        </div>

        <SectionRangeBlock
          form={form}
          setForm={setForm}
          books={books}
          verseCounts={verseCounts}
        />
      </form>
    </AppModal>
  );
}

function ReferencePreview({
  form,
  books,
}: {
  form: VerseForm;
  books: { index: number; name: string }[];
}) {
  const bookNum = Number(form.book);
  const chapNum = Number(form.chapter);
  const verseNum = Number(form.verse);
  const bookName = books.find((b) => b.index === bookNum)?.name ?? "";
  const ready =
    bookName && !Number.isNaN(chapNum) && chapNum > 0 && !Number.isNaN(verseNum) && verseNum > 0;
  return (
    <p className="text-xs text-primary-600">
      <span className="mr-1 font-medium text-primary-700">Reference preview:</span>
      {ready ? (
        <span className="text-primary-900">{`${bookName} ${chapNum}:${verseNum}`}</span>
      ) : (
        <span className="italic">choose book, chapter, verse</span>
      )}
    </p>
  );
}

function SectionRangeBlock({
  form,
  setForm,
  books,
  verseCounts,
}: {
  form: VerseForm;
  setForm: React.Dispatch<React.SetStateAction<VerseForm>>;
  books: { index: number; name: string }[];
  verseCounts: Record<number, number[]>;
}) {
  // Track which "to-*" fields the user has explicitly touched.
  // While untouched, they mirror the corresponding "from-*" value.
  const [toTouched, setToTouched] = useState<{ book: boolean; chapter: boolean }>({
    book: false,
    chapter: false,
  });

  const fromChapterMax = useMemo(
    () => getChapterCount(Number(form.sectionFromBook) || 0),
    [form.sectionFromBook],
  );
  const toChapterMax = useMemo(
    () => getChapterCount(Number(form.sectionToBook) || 0),
    [form.sectionToBook],
  );
  const fromVerseMax = useMemo(() => {
    const b = Number(form.sectionFromBook);
    const c = Number(form.sectionFromChapter);
    if (Number.isNaN(b) || Number.isNaN(c)) return 0;
    return verseCounts[b]?.[c - 1] ?? 0;
  }, [form.sectionFromBook, form.sectionFromChapter, verseCounts]);
  const toVerseMax = useMemo(() => {
    const b = Number(form.sectionToBook);
    const c = Number(form.sectionToChapter);
    if (Number.isNaN(b) || Number.isNaN(c)) return 0;
    return verseCounts[b]?.[c - 1] ?? 0;
  }, [form.sectionToBook, form.sectionToChapter, verseCounts]);

  // Auto-mirror to-book / to-chapter from the from-* fields until manually edited.
  useEffect(() => {
    if (!form.sectionEnabled) return;
    setForm((s) => {
      const next = { ...s };
      if (!toTouched.book) next.sectionToBook = s.sectionFromBook;
      if (!toTouched.chapter) next.sectionToChapter = s.sectionFromChapter;
      return next;
    });
  }, [
    form.sectionEnabled,
    form.sectionFromBook,
    form.sectionFromChapter,
    toTouched.book,
    toTouched.chapter,
    setForm,
  ]);

  const toggleSection = (enabled: boolean) => {
    if (!enabled) {
      setToTouched({ book: false, chapter: false });
      setForm((s) => ({
        ...s,
        sectionEnabled: false,
        sectionFromBook: "",
        sectionFromChapter: "",
        sectionFromVerse: "",
        sectionToBook: "",
        sectionToChapter: "",
        sectionToVerse: "",
      }));
    } else {
      setForm((s) => ({ ...s, sectionEnabled: true }));
    }
  };

  return (
    <div className="rounded-md border border-primary-200 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
        <input
          type="checkbox"
          checked={form.sectionEnabled}
          onChange={(e) => toggleSection(e.target.checked)}
        />
        Verse range / section (optional)
      </label>
      {form.sectionEnabled && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-primary-700">From</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={form.sectionFromBook}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    sectionFromBook: e.target.value,
                    sectionFromChapter: "",
                    sectionFromVerse: "",
                  }))
                }
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Book</option>
                {books.map((b) => (
                  <option key={b.index} value={String(b.index)}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={form.sectionFromChapter}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    sectionFromChapter: e.target.value,
                    sectionFromVerse: "",
                  }))
                }
                disabled={fromChapterMax === 0}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Chapter</option>
                {Array.from({ length: fromChapterMax }, (_, i) => String(i + 1)).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={form.sectionFromVerse}
                onChange={(e) =>
                  setForm((s) => ({ ...s, sectionFromVerse: e.target.value }))
                }
                disabled={fromVerseMax === 0}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Verse</option>
                {Array.from({ length: fromVerseMax }, (_, i) => String(i + 1)).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-primary-700">To</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={form.sectionToBook}
                onChange={(e) => {
                  setToTouched((t) => ({ ...t, book: true }));
                  setForm((s) => ({
                    ...s,
                    sectionToBook: e.target.value,
                    sectionToChapter: "",
                    sectionToVerse: "",
                  }));
                }}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Book</option>
                {books.map((b) => (
                  <option key={b.index} value={String(b.index)}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={form.sectionToChapter}
                onChange={(e) => {
                  setToTouched((t) => ({ ...t, chapter: true }));
                  setForm((s) => ({
                    ...s,
                    sectionToChapter: e.target.value,
                    sectionToVerse: "",
                  }));
                }}
                disabled={toChapterMax === 0}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Chapter</option>
                {Array.from({ length: toChapterMax }, (_, i) => String(i + 1)).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={form.sectionToVerse}
                onChange={(e) =>
                  setForm((s) => ({ ...s, sectionToVerse: e.target.value }))
                }
                disabled={toVerseMax === 0}
                className="rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Verse</option>
                {Array.from({ length: toVerseMax }, (_, i) => String(i + 1)).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-primary-600">
              Book and chapter auto-fill from the &ldquo;From&rdquo; row until you change them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
