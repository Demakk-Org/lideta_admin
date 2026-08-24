"use client";

import { useMemo, useState } from "react";
import { toEthiopian, toGregorian } from "ethiopian-date";
import { WithId, DailyVerse, VerseCoord } from "@/lib/api/dailyVerse";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import NotifyButton from "@/components/ui/NotifyButton";
import {
  AMHARIC_MONTHS,
  isEthiopianLeapYear,
  listBibleBooksAmharic,
} from "@/lib/api/books";

const WEEKDAYS_AM = ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];

const bookName = (index: number) =>
  listBibleBooksAmharic().find((b) => b.index === index)?.name ?? String(index);

const coord = (c: VerseCoord) => `${bookName(c.book)} ${c.chapter}:${c.verse}`;

const sectionLabel = (section: DailyVerse["section"]) => {
  if (!section?.from || !section?.to) return "-";
  const { from, to } = section;
  return from.book === to.book
    ? `${bookName(from.book)} ${from.chapter}:${from.verse} - ${to.chapter}:${to.verse}`
    : `${coord(from)} - ${coord(to)}`;
};

/** Days in an Ethiopian month: 30 for 1-12, 5 (or 6 in a leap year) for Pagume. */
const daysInEthiopianMonth = (year: number, month: number) =>
  month === 13 ? (isEthiopianLeapYear(year) ? 6 : 5) : 30;

export type EthiopianDate = { year: number; month: number; day: number };

const todayEthiopian = (): EthiopianDate => {
  const now = new Date();
  const [y, m, d] = toEthiopian(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
  return { year: y, month: m, day: d };
};

type Props = {
  items: WithId<DailyVerse>[];
  loading: boolean;
  notifying?: boolean;
  onEdit: (v: WithId<DailyVerse>) => void;
  onDelete: (id: string) => void;
  onNotify?: (v: WithId<DailyVerse>) => void;
  onAddForDate?: (ec: EthiopianDate) => void;
};

export default function TodayVerseCalendar({
  items,
  loading,
  notifying,
  onEdit,
  onDelete,
  onNotify,
  onAddForDate,
}: Props) {
  const today = useMemo(todayEthiopian, []);
  const [cursor, setCursor] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState<EthiopianDate>(today);

  /** Verses bucketed by their stored Gregorian date, so lookup is a single key. */
  const byGregorianKey = useMemo(() => {
    const map = new Map<string, WithId<DailyVerse>[]>();
    for (const v of items) {
      const d = v.display_date;
      if (!d) continue;
      const key = `${d.year}-${d.month}-${d.day}`;
      const list = map.get(key);
      if (list) list.push(v);
      else map.set(key, [v]);
    }
    return map;
  }, [items]);

  const versesFor = (ec: EthiopianDate) => {
    try {
      const [gy, gm, gd] = toGregorian(ec.year, ec.month, ec.day);
      return byGregorianKey.get(`${gy}-${gm}-${gd}`) ?? [];
    } catch {
      return [];
    }
  };

  const gregorianOf = (ec: EthiopianDate) => {
    try {
      const [gy, gm, gd] = toGregorian(ec.year, ec.month, ec.day);
      return new Date(gy, gm - 1, gd);
    } catch {
      return null;
    }
  };

  const dayCount = daysInEthiopianMonth(cursor.year, cursor.month);

  /** Weekday (0=Sun) the 1st of the displayed Ethiopian month falls on. */
  const leadingBlanks = useMemo(() => {
    const first = gregorianOf({ ...cursor, day: 1 });
    return first ? first.getDay() : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.year, cursor.month]);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const total = c.month - 1 + delta;
      const yearDelta = Math.floor(total / 13);
      const month = ((total % 13) + 13) % 13;
      return { year: c.year + yearDelta, month: month + 1 };
    });
  };

  const selectedVerses = versesFor(selected);
  const selectedGregorian = gregorianOf(selected);
  const isSelected = (day: number) =>
    selected.year === cursor.year &&
    selected.month === cursor.month &&
    selected.day === day;
  const isToday = (day: number) =>
    today.year === cursor.year &&
    today.month === cursor.month &&
    today.day === day;

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-slate-200 bg-white/80 shadow-sm">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex h-11 w-12 items-center justify-center rounded-l-full pb-1 text-3xl leading-none text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                ‹
              </button>
              <span className="h-7 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="flex h-11 w-12 items-center justify-center rounded-r-full pb-1 text-3xl leading-none text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                ›
              </button>
            </div>
            <div className="leading-tight">
              <h2 className="text-xl font-semibold tracking-tight text-slate-800">
                {AMHARIC_MONTHS[cursor.month - 1]}
              </h2>
              <p className="text-xs text-slate-500">{cursor.year} ዓ.ም</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {loading && (
              <span className="text-sm text-slate-500">Loading...</span>
            )}
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              has verse
            </span>
            <button
              type="button"
              onClick={() => {
                setCursor({ year: today.year, month: today.month });
                setSelected(today);
              }}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              Today
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {WEEKDAYS_AM.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
              const ec = { year: cursor.year, month: cursor.month, day };
              const verses = versesFor(ec);
              const active = isSelected(day);
              const filled = verses.length > 0;
              const gregorian = gregorianOf(ec);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(ec)}
                  className={`group relative flex h-24 flex-col overflow-hidden rounded-xl border p-2 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                    active
                      ? "border-slate-500 bg-slate-100 text-slate-800 shadow-sm ring-1 ring-slate-400"
                      : filled
                      ? "border-slate-300 bg-gradient-to-b from-slate-50 to-white text-slate-800 shadow-sm hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
                      : "border-slate-300 bg-white/70 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm"
                  }`}
                >
                  {filled && (
                    <span
                      className={`absolute inset-x-0 top-0 h-0.5 ${
                        active ? "bg-slate-400" : "bg-slate-300"
                      }`}
                    />
                  )}
                  <div className="flex items-start justify-between gap-1">
                    <span className="flex min-w-0 items-baseline gap-1">
                      <span
                        className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                          isToday(day) ? "bg-slate-600 text-white" : ""
                        }`}
                      >
                        {day}
                      </span>
                      {gregorian && (
                        <span className="truncate text-[10px] tabular-nums text-slate-400">
                          {gregorian.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </span>
                    {verses.length > 1 && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] font-medium ${
                          active
                            ? "bg-slate-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        +{verses.length - 1}
                      </span>
                    )}
                  </div>

                  {filled && (
                    <div className="mt-auto min-w-0">
                      <div
                        className="truncate text-[11px] font-medium text-slate-700"
                        title={verses.map((v) => v.reference).join(", ")}
                      >
                        {verses[0].reference}
                      </div>
                      {verses[0].section && (
                        <div
                          className="truncate text-[10px] text-slate-500"
                          title={sectionLabel(verses[0].section)}
                        >
                          {sectionLabel(verses[0].section)}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail view for the selected day */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="truncate bg-slate-600 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                {AMHARIC_MONTHS[selected.month - 1]}
              </div>
              <div className="py-1 text-center text-2xl font-semibold leading-tight tabular-nums text-slate-800">
                {selected.day}
              </div>
            </div>
            <div className="leading-tight">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {AMHARIC_MONTHS[selected.month - 1]} {selected.day}, {selected.year}
              </h2>
              {selectedGregorian && (
                <p className="text-[11px] text-slate-500">
                  {selectedGregorian.toDateString()}
                </p>
              )}
            </div>
          </div>
          {onAddForDate && (
            <AppButton
              variant={AppButtonVariant.Add}
              onClick={() => onAddForDate(selected)}
              className="rounded-full px-4 py-1.5"
            >
              Add Verse
            </AppButton>
          )}
        </div>

        <div className="space-y-4 p-5">
          {selectedVerses.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                No verse set for this day.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Use “Add Verse” above to create one for this date.
              </p>
            </div>
          )}
          {selectedVerses.map((v) => (
            <div
              key={v.id}
              className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold tracking-tight text-slate-800">
                  {v.reference}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    v.status === "active"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      v.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  {v.status}
                </span>
                {v.tag && (
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                    {v.tag}
                  </span>
                )}
              </div>

              <blockquote className="whitespace-pre-wrap border-l-2 border-slate-300 pl-4 text-[15px] leading-relaxed text-slate-700">
                {v.text}
              </blockquote>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Paragraph
                </span>
                <span>{sectionLabel(v.section)}</span>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                <AppButton
                  variant={AppButtonVariant.Edit}
                  onClick={() => onEdit(v)}
                  className="rounded-full px-4 py-1.5"
                >
                  Edit
                </AppButton>
                <AppButton
                  variant={AppButtonVariant.Delete}
                  onClick={() => onDelete(v.id)}
                  className="rounded-full px-4 py-1.5"
                >
                  Delete
                </AppButton>
                {onNotify && (
                  <NotifyButton
                    onClick={() => onNotify(v)}
                    disabled={loading || notifying}
                    className="rounded-full px-4 py-1.5"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
