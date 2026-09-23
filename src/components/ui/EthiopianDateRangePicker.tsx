"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AMHARIC_MONTHS } from "@/lib/api/books";
import {
  AMHARIC_WEEKDAYS_SHORT,
  applyDayClick,
  daysInEthiopianMonth,
  isWithinRange,
  leadingBlanks as leadingBlanksFor,
  pad2,
  parseToDate,
  shiftMonth as shiftMonthBy,
  toEth,
  toLocalString,
  type EthDate,
} from "@/lib/calendar/ethiopian";

export type EthiopianDateRangePickerProps = {
  label?: string;
  /** Local `YYYY-MM-DDTHH:mm`, or "" for none. */
  start?: string;
  end?: string;
  onChange: (next: { start: string; end: string }) => void;
  required?: boolean;
  /** Where a newly picked end lands relative to the start's clock time. */
  defaultDurationMs: number;
};

function ethOf(value?: string): EthDate | null {
  const dt = parseToDate(value);
  return dt ? toEth(dt) : null;
}

function timeOf(value?: string): string {
  const dt = parseToDate(value);
  return dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : "";
}

function dayLabel(e: EthDate): string {
  return `${e.d} ${AMHARIC_MONTHS[e.m - 1]} ${e.y}`;
}

function summarise(from: EthDate | null, to: EthDate | null): string {
  if (!from) return "Pick dates";
  if (!to) return dayLabel(from);
  if (from.y === to.y && from.m === to.m && from.d === to.d) return dayLabel(from);
  if (from.y === to.y && from.m === to.m) {
    return `${from.d} – ${to.d} ${AMHARIC_MONTHS[from.m - 1]} ${from.y}`;
  }
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

export default function EthiopianDateRangePicker({
  label,
  start = "",
  end = "",
  onChange,
  required,
  defaultDurationMs,
}: EthiopianDateRangePickerProps) {
  const from = useMemo(() => ethOf(start), [start]);
  const to = useMemo(() => ethOf(end), [end]);
  const todayEth = useMemo(() => toEth(new Date()), []);

  const [view, setView] = useState<{ y: number; m: number }>(
    from ? { y: from.y, m: from.m } : { y: todayEth.y, m: todayEth.m },
  );
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<EthDate | null>(null);

  // Re-centre when a different start arrives from outside (editing an event, or
  // the form resetting), without undoing paging within the same month.
  const monthKey = from ? `${from.y}-${from.m}` : "";
  const lastMonthKey = useRef(monthKey);
  useEffect(() => {
    if (monthKey && monthKey !== lastMonthKey.current) {
      const [y, m] = monthKey.split("-").map(Number);
      setView({ y, m });
    }
    lastMonthKey.current = monthKey;
  }, [monthKey]);

  const close = useCallback(() => {
    setOpen(false);
    setHover(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Captured so Escape closes the calendar, not the event modal beneath it.
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

  const awaitingEnd = !!start && !end;

  const pickDay = (day: number) => {
    const next = applyDayClick({ start, end }, { y: view.y, m: view.m, d: day }, defaultDurationMs);
    onChange(next);
    // Stay open while the second half of the range is still outstanding.
    if (next.end) close();
    else setHover(null);
  };

  const setTime = (which: "start" | "end", time: string) => {
    const target = which === "start" ? start : end;
    const eth = ethOf(target);
    if (!eth) return;
    const updated = toLocalString(eth, time || "00:00");
    onChange(which === "start" ? { start: updated, end } : { start, end: updated });
  };

  const same = (a: EthDate | null, day: number) =>
    !!a && a.y === view.y && a.m === view.m && a.d === day;

  const overlay = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? "Choose dates"}
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

        <p className="mt-2 text-center text-xs text-primary-600">
          {awaitingEnd
            ? "Pick the end day, or the same day again for a one-day event."
            : "Pick the start day."}
        </p>

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
            const cell: EthDate = { y: view.y, m: view.m, d: day };
            const isFrom = same(from, day);
            const isTo = same(to, day);
            const edge = isFrom || isTo;
            // While waiting for the second click, shade what the range would be.
            const inRange = isWithinRange(cell, from, to ?? (awaitingEnd ? hover : null));
            return (
              <button
                key={day}
                type="button"
                onClick={() => pickDay(day)}
                onMouseEnter={() => awaitingEnd && setHover(cell)}
                aria-label={dayLabel(cell)}
                aria-pressed={edge}
                className={[
                  "flex h-10 items-center justify-center rounded-md text-sm",
                  edge
                    ? "bg-primary-600 font-semibold text-white"
                    : inRange
                      ? // A tint of the accent, not the grey ramp: primary-100 is
                        // near-white in light mode and a dark surface in dark mode,
                        // so it read as "not selected" in both.
                        "bg-primary-500/30 font-medium text-primary-800"
                      : "text-primary-800 hover:bg-primary-50",
                  !edge && !inRange && same(todayEth, day) ? "ring-1 ring-primary-400" : "",
                ].join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* The app never renders these; the recurring-events roll reads the end
            time to decide whether an occurrence has finished. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-primary-200 pt-3">
          <label className="text-xs text-primary-600">From</label>
          <input
            type="time"
            value={timeOf(start)}
            onChange={(e) => setTime("start", e.target.value)}
            disabled={!from}
            aria-label="Start time"
            className="w-24 rounded-md border border-primary-300 px-2 py-1 text-sm disabled:bg-primary-50 disabled:text-primary-400"
          />
          <label className="text-xs text-primary-600">to</label>
          <input
            type="time"
            value={timeOf(end)}
            onChange={(e) => setTime("end", e.target.value)}
            disabled={!to}
            aria-label="End time"
            className="w-24 rounded-md border border-primary-300 px-2 py-1 text-sm disabled:bg-primary-50 disabled:text-primary-400"
          />
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-md px-3 py-1 text-sm text-primary-700 hover:bg-primary-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  const times = [timeOf(start), timeOf(end)].filter(Boolean).join(" – ");

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-primary-800">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}

      {/* Fixed-height row: the calendar is an overlay, so opening it never
          reflows the fields below. */}
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center justify-between rounded-md border border-primary-300 bg-white px-3 py-2 text-left text-sm hover:bg-primary-50"
        >
          <span className={from ? "text-primary-800" : "text-primary-400"}>
            {summarise(from, to)}
            {times && <span className="ml-2 text-primary-500">· {times}</span>}
          </span>
          <span aria-hidden className="text-primary-500">
            📅
          </span>
        </button>
        {from && (
          <button
            type="button"
            onClick={() => onChange({ start: "", end: "" })}
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
