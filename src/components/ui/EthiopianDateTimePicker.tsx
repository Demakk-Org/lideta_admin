"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toEthiopian, toGregorian } from "ethiopian-date";
import { AMHARIC_MONTHS, isEthiopianLeapYear } from "@/lib/api/books";

export type EthiopianDateTimePickerProps = {
  label?: string;
  // Accepts ISO string or local `YYYY-MM-DDTHH:mm` string; undefined or empty for none
  value?: string;
  // Emits local `YYYY-MM-DDTHH:mm` string (no timezone) when input is complete
  onChange: (v: string) => void;
  required?: boolean;
};

function parseToDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  // Try parsing local datetime "YYYY-MM-DDTHH:mm"
  const m = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.exec(value);
  if (m) {
    const [yyyy, mm, dd, hh, mi] = [
      Number(value.slice(0, 4)),
      Number(value.slice(5, 7)),
      Number(value.slice(8, 10)),
      Number(value.slice(11, 13)),
      Number(value.slice(14, 16)),
    ];
    // Construct a local date
    const dt = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocal(dt: Date) {
  const yyyy = dt.getFullYear();
  const mm = pad2(dt.getMonth() + 1);
  const dd = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mi = pad2(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function EthiopianDateTimePicker({ label, value, onChange, required }: EthiopianDateTimePickerProps) {
  const [y, setY] = useState<string>("");
  const [m, setM] = useState<string>(""); // 1..13
  const [d, setD] = useState<string>("");
  const [t, setT] = useState<string>(""); // HH:mm
  const lastOutRef = useRef<string | undefined>(undefined);

  // Initialize from incoming value
  useEffect(() => {
    const dt = parseToDate(value);
    if (!dt) {
      // Do not force-clear while user is editing; only clear if value becomes empty and local state is also empty
      if (y || m || d || t) return;
      setY(""); setM(""); setD(""); setT("");
      lastOutRef.current = undefined;
      return;
    }
    try {
      const [ey, em, ed] = toEthiopian(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      const ty = String(ey);
      const tm = String(em);
      const td = String(ed);
      const tt = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
      // Only update if different to avoid loops/flicker
      if (y !== ty) setY(ty);
      if (m !== tm) setM(tm);
      if (d !== td) setD(td);
      if (t !== tt) setT(tt);
      // Keep last emitted aligned with external value to avoid re-emitting the same value
      lastOutRef.current = formatLocal(dt);
    } catch {
      // ignore parse errors
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Emit whenever parts change
  useEffect(() => {
    // Only emit when we have a complete, plausible date (year must be 4 digits)
    if (y && y.length === 4 && m && d) {
      try {
        const [gy, gm, gd] = toGregorian(Number(y), Number(m), Number(d));
        const [hh, mi] = (t || "00:00").split(":");
        const out = `${pad2(gy)}-${pad2(gm)}-${pad2(gd)}T${pad2(Number(hh))}:${pad2(Number(mi))}`;
        if (lastOutRef.current !== out) {
          lastOutRef.current = out;
          onChange(out);
        }
      } catch {
        // ignore invalid combos
      }
    }
    // Do NOT emit undefined for partial input to avoid parent resetting our state
  }, [y, m, d, t, onChange]);

  const dayCount = useMemo(() => {
    const month = Number(m);
    const year = Number(y);
    if (!month) return 30;
    if (month === 13) return !Number.isNaN(year) && isEthiopianLeapYear(year) ? 6 : 5;
    return 30;
  }, [m, y]);

  return (
    <div>
      {label && <label className="block text-sm font-medium text-primary-800">{label}</label>}
      <div className="mt-1 grid grid-cols-4 gap-2">
        <select
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="rounded-md border border-primary-300 px-2 py-2"
          required={required}
        >
          <option value="">Day</option>
          {Array.from({ length: dayCount }, (_, i) => String(i + 1)).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={m}
          onChange={(e) => setM(e.target.value)}
          className="rounded-md border border-primary-300 px-2 py-2 col-span-2"
          required={required}
        >
          <option value="">Month</option>
          {AMHARIC_MONTHS.map((mm, idx) => (
            <option key={idx + 1} value={String(idx + 1)}>
              {mm}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={y}
          onChange={(e) => setY(e.target.value)}
          placeholder="2017"
          className="rounded-md border border-primary-300 px-2 py-2"
          required={required}
        />
        <input
          type="time"
          value={t}
          onChange={(e) => setT(e.target.value)}
          className="col-span-4 rounded-md border border-primary-300 px-2 py-2"
        />
      </div>
    </div>
  );
}
