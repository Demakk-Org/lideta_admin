"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DailyVerse, WithId } from "@/lib/api/dailyVerse";
import { Timestamp } from "firebase/firestore";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import TodayVerseHeader from "./_components/TodayVerseHeader";
import TodayVerseModal from "./_components/TodayVerseModal";
import TodayVerseList from "./_components/TodayVerseList";
import TodayVerseCalendar, { EthiopianDate } from "./_components/TodayVerseCalendar";
import type { VerseForm } from "./_components/types";
import { toEthiopian, toGregorian } from "ethiopian-date";
import { isEthiopianLeapYear, listBibleBooksAmharic } from "@/lib/api/books";
import { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import {
  fetchDailyVerses,
  createDailyVerse,
  editDailyVerse,
  removeDailyVerse,
} from "@/lib/redux/features/dailyVerseSlice";
import { useContentNotification } from "@/lib/notifications/useContentNotification";

const emptyForm: VerseForm = {
  book: "",
  chapter: "",
  verse: "",
  reference: "",
  text: "",
  tag: "",
  status: "active",
  day: "",
  month: "",
  year: "",
  sectionEnabled: false,
  sectionFromBook: "",
  sectionFromChapter: "",
  sectionFromVerse: "",
  sectionToBook: "",
  sectionToChapter: "",
  sectionToVerse: "",
};

export default function TodayVerseClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.dailyVerse);
  const loading = status === "loading";
  const { notifying, notify } = useContentNotification();
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VerseForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("calendar");


  const load = useCallback(async () => {
    try {
      await dispatch(fetchDailyVerses()).unwrap();
    } catch {
      toast.error("Failed to load verses");
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  /** Opens the Add form, prefilled with `ec` when given, otherwise today (EC). */
  const openNew = (ec?: EthiopianDate) => {
    setEditingId(null); // ensure Add mode
    try {
      let year = ec?.year;
      let month = ec?.month;
      let day = ec?.day;
      if (!ec) {
        const now = new Date();
        [year, month, day] = toEthiopian(
          now.getFullYear(),
          now.getMonth() + 1,
          now.getDate()
        );
      }
      setForm({ ...emptyForm, year: String(year), month: String(month), day: String(day) });
    } catch {
      reset();
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const parseNumbers = (f: VerseForm) => {
    const book = Number(f.book);
    const chapter = Number(f.chapter);
    const verse = Number(f.verse);
    if ([book, chapter, verse].some(Number.isNaN)) {
      throw new Error("Book, Chapter, and Verse must be filled correctly");
    }
    return { book, chapter, verse };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { book, chapter, verse } = parseNumbers(form);
      // Build reference from Amharic book name + chapter:verse
      const bookNameAm = listBibleBooksAmharic().find((b) => b.index === book)?.name ?? "";
      const reference = bookNameAm ? `${bookNameAm} ${chapter}:${verse}` : `${chapter}:${verse}`;
      // Convert Ethiopian date (form.year, form.month, form.day) -> Gregorian
      const ey = Number(form.year);
      const em = Number(form.month);
      const ed = Number(form.day);
      if ([ey, em, ed].some(Number.isNaN)) throw new Error("ቀን መረጃ ያልተሟላ ነው");
      // Basic bounds check for EC
      if (em < 1 || em > 13) throw new Error("ወር 1-13 መሆን ይገባል");
      const maxDay = em === 13 ? (isEthiopianLeapYear(ey) ? 6 : 5) : 30;
      if (ed < 1 || ed > maxDay) throw new Error("ቀን ትክክል አይደለም");
      const [gy, gm, gd] = toGregorian(ey, em, ed);
      const day = gd;
      const month = gm;
      const year = gy;
      let section: DailyVerse["section"] = null;
      if (form.sectionEnabled) {
        const fb = Number(form.sectionFromBook);
        const fc = Number(form.sectionFromChapter);
        const fv = Number(form.sectionFromVerse);
        const tb = Number(form.sectionToBook);
        const tc = Number(form.sectionToChapter);
        const tv = Number(form.sectionToVerse);
        if ([fb, fc, fv, tb, tc, tv].some(Number.isNaN)) {
          throw new Error("Section: book, chapter, and verse are required for both From and To");
        }
        section = {
          from: { book: fb, chapter: fc, verse: fv },
          to: { book: tb, chapter: tc, verse: tv },
        };
      }
      const base: Omit<DailyVerse, "createdAt" | "updatedAt"> = {
        book,
        chapter,
        verse,
        reference,
        text: form.text.trim(),
        status: form.status || "active",
        display_date: { day, month, year },
        display_date_key: `${year}-${month}-${day}`,
        display_timestamp: Timestamp.fromDate(new Date(year, month - 1, day)),
        section,
      };
      const tagVal = form.tag.trim();
      const payload: Omit<DailyVerse, "createdAt" | "updatedAt"> = tagVal ? { ...base, tag: tagVal } : base;

      if (editingId) {
        await dispatch(
          editDailyVerse({ id: editingId, data: payload })
        ).unwrap();
        toast.success("Verse updated");
      } else {
        await dispatch(createDailyVerse(payload)).unwrap();
        toast.success("Verse added");
      }
      reset();
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (v: WithId<DailyVerse>) => {
    setEditingId(v.id);
    // Convert saved Gregorian date to Ethiopian for editing UI
    const gy = v.display_date?.year ?? new Date().getFullYear();
    const gm = v.display_date?.month ?? new Date().getMonth() + 1;
    const gd = v.display_date?.day ?? new Date().getDate();
    let ey = "";
    let em = "";
    let ed = "";
    try {
      const conv = toEthiopian(gy, gm, gd);
      ey = String(conv[0]);
      em = String(conv[1]);
      ed = String(conv[2]);
    } catch {}
    const sec = v.section ?? null;
    setForm({
      book: String(v.book ?? ""),
      chapter: String(v.chapter ?? ""),
      verse: String(v.verse ?? ""),
      reference: "",
      text: v.text ?? "",
      tag: v.tag ?? "",
      status: v.status ?? "active",
      day: ed,
      month: em,
      year: ey,
      sectionEnabled: !!sec,
      sectionFromBook: sec ? String(sec.from.book) : "",
      sectionFromChapter: sec ? String(sec.from.chapter) : "",
      sectionFromVerse: sec ? String(sec.from.verse) : "",
      sectionToBook: sec ? String(sec.to.book) : "",
      sectionToChapter: sec ? String(sec.to.chapter) : "",
      sectionToVerse: sec ? String(sec.to.verse) : "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await dispatch(removeDailyVerse(deleteId)).unwrap();
      toast.success("Verse deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const submitLabel = editingId ? "Update Verse" : "Add Verse";
  const submitVariant = editingId ? AppButtonVariant.Edit : AppButtonVariant.Add;

  return (
    <div className="space-y-6">
      <TodayVerseHeader view={view} onViewChange={setView} />

      <TodayVerseModal
        isOpen={isModalOpen}
        form={form}
        setForm={setForm}
        submitting={submitting}
        submitLabel={submitLabel}
        submitVariant={submitVariant}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {view === "calendar" ? (
        <TodayVerseCalendar
          items={items}
          loading={loading}
          notifying={notifying}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNotify={(v) =>
            notify({ type: "daily_verse", id: v.id, title: v.reference })
          }
          onAddForDate={openNew}
        />
      ) : (
        <TodayVerseList
          items={items}
          loading={loading}
          notifying={notifying}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNotify={(v) =>
            notify({ type: "daily_verse", id: v.id, title: v.reference })
          }
          onAdd={() => openNew()}
        />
      )}

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          setIsDeleteOpen(false);
          setDeleteId(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
