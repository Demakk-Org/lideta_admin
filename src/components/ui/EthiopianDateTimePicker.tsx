"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AMHARIC_MONTHS } from "@/lib/api/books";
import {
  AMHARIC_WEEKDAYS_SHORT,
  daysInEthiopianMonth,
  leadingBlanks as leadingBlanksFor,
  pad2,
  parseToDate,
  shiftMonth as shiftMonthBy,
  toEth,
  toLocalString,
} from "@/lib/calendar/ethiopian";

export type EthiopianDateTimePickerProps = {
  label?: string;
  // Accepts ISO string or local `YYYY-MM-DDTHH:mm` string; undefined or empty for none
  value?: string;
  // Emits local `YYYY-MM-DDTHH:mm` string (no timezone) when a day has been picked
  onChange: (v: string) => void;
  required?: boolean;
};

export default function EthiopianDateTimePicker({
  label,
  value,
  onChange,
  required,
}: EthiopianDateTimePickerProps) {
  const selected = useMemo(() => {
    const dt = parseToDate(value);
    return dt ? { eth: toEth(dt), time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` } : null;
  }, [value]);

  const todayEth = useMemo(() => toEth(new Date()), []);

  // Which month the grid shows. Follows the selection, but paging away from it
  // is not itself a change of selection.
  const [view, setView] = useState<{ y: number; m: number }>(
    selected ? { y: selected.eth.y, m: selected.eth.m } : { y: todayEth.y, m: todayEth.m },
  );

  const [open, setOpen] = useState(false);

  // Re-centre the grid when a different month arrives from outside (opening the
  // modal to edit, or the form resetting). Keyed so paging within the same month
  // is not undone on every render.
  const selectedMonthKey = selected ? `${selected.eth.y}-${selected.eth.m}` : "";
  const lastMonthKey = useRef(selectedMonthKey);
  useEffect(() => {
    if (selectedMonthKey && selectedMonthKey !== lastMonthKey.current) {
      const [y, m] = selectedMonthKey.split("-").map(Number);
      setView({ y, m });
    }
    lastMonthKey.current = selectedMonthKey;
  }, [selectedMonthKey]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Stop Escape here so it closes only the calendar, not the event modal
      // underneath it.
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  const dayCount = daysInEthiopianMonth(view.y, view.m);
  const leadingBlanks = useMemo(() => leadingBlanksFor(view.y, view.m), [view]);

  const summary = selected
    ? `${selected.eth.d} ${AMHARIC_MONTHS[selected.eth.m - 1]} ${selected.eth.y}`
    : "Pick a date";

  const pickDay = (day: number) => {
    // Keep any time already chosen; a fresh pick starts at midnight.
    onChange(toLocalString({ y: view.y, m: view.m, d: day }, selected?.time ?? "00:00"));
    close();
  };

  const changeTime = (time: string) => {
    // Time alone means nothing without a day.
    if (!selected) return;
    onChange(toLocalString(selected.eth, time || "00:00"));
  };

  const isSelected = (day: number) =>
    !!selected && selected.eth.y === view.y && selected.eth.m === view.m && selected.eth.d === day;

  const isToday = (day: number) =>
    todayEth.y === view.y && todayEth.m === view.m && todayEth.d === day;

  // Rendered into document.body: AppModal's scrolling body would otherwise clip
  // it, and anchoring it inline pushed every field below it down the form.
  const overlay = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? "Choose a date"}
        className="relative z-10 w-full max-w-sm rounded-md border border-primary-200 bg-white p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView((v) => shiftMonthBy(v, -1))}
            aria-label="Previous month"
            className="rounded-md px-2 py-1 text-primary-700 hover:bg-primary-50"
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary-800">
              {AMHARIC_MONTHS[view.m - 1]}
            </span>
            <input
              type="number"
              value={view.y}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (Number.isFinite(y)) setView((v) => ({ ...v, y }));
              }}
              aria-label="Year"
              className="w-20 rounded-md border border-primary-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setView((v) => shiftMonthBy(v, 1))}
            aria-label="Next month"
            className="rounded-md px-2 py-1 text-primary-700 hover:bg-primary-50"
          >
            ›
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
          {AMHARIC_WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="pb-1 text-xs font-medium text-primary-600">
              {w}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} className="h-10" />
          ))}
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
            const active = isSelected(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => pickDay(day)}
                aria-label={`${day} ${AMHARIC_MONTHS[view.m - 1]} ${view.y}`}
                aria-pressed={active}
                className={[
                  "flex h-10 items-center justify-center rounded-md text-sm",
                  active
                    ? "bg-primary-600 font-semibold text-white"
                    : "text-primary-800 hover:bg-primary-50",
                  !active && isToday(day) ? "ring-1 ring-primary-400" : "",
                ].join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-primary-200 pt-3">
          <button
            type="button"
            onClick={close}
            className="rounded-md px-3 py-1 text-sm text-primary-700 hover:bg-primary-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-primary-800">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}

      {/* One fixed-height row. The calendar itself is an overlay, so opening it
          never reflows the form. Time stays inline because it is small and the
          app never renders it — only the recurrence roll reads it. */}
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center justify-between rounded-md border border-primary-300 bg-white px-3 py-2 text-left text-sm hover:bg-primary-50"
        >
          <span className={selected ? "text-primary-800" : "text-primary-400"}>{summary}</span>
          <span aria-hidden className="text-primary-500">
            📅
          </span>
        </button>
        <input
          type="time"
          value={selected?.time ?? ""}
          onChange={(e) => changeTime(e.target.value)}
          disabled={!selected}
          aria-label="Time (optional)"
          title="Time (optional)"
          className="w-28 rounded-md border border-primary-300 px-2 py-2 text-sm disabled:bg-primary-50 disabled:text-primary-400"
        />
        {selected && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-md px-2 py-2 text-xs text-primary-600 hover:bg-primary-50"
          >
            Clear
          </button>
        )}
      </div>

      {open && typeof document !== "undefined" && createPortal(overlay, document.body)}
    </div>
  );
}
