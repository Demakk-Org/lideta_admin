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
      </form>
    </AppModal>
  );
}
