"use client";

import { useMemo } from "react";
import EthiopianDateTimePicker from "@/components/ui/EthiopianDateTimePicker";
import { describeRecurrence, upcomingOccurrences } from "@/lib/events/recurrence";
import {
  deriveAnchor,
  emptyRecurrenceForm,
  toRecurrence,
  type RecurrenceForm,
} from "@/lib/events/recurrenceForm";

export {
  anchorInputsEqual,
  deriveAnchor,
  emptyRecurrenceForm,
  fromRecurrence,
  toRecurrence,
  type RecurrenceForm,
} from "@/lib/events/recurrenceForm";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputClass =
  "mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500";
const labelClass = "block text-sm font-medium text-primary-800";

function Chip({
  active,
  label,
  onClick,
  title,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "rounded-md border px-2.5 py-1 text-sm transition " +
        (active
          ? "border-primary-600 bg-primary-600 text-white"
          : "border-primary-300 bg-white text-primary-800 hover:bg-primary-50")
      }
    >
      {label}
    </button>
  );
}

export default function RecurrenceEditor({
  value,
  onChange,
  startWeekdayHint,
}: {
  value: RecurrenceForm;
  onChange: (next: RecurrenceForm) => void;
  /** Weekday to pre-tick when weekly is first chosen. Defaults to today. */
  startWeekdayHint?: number;
}) {
  const set = (patch: Partial<RecurrenceForm>) => onChange({ ...value, ...patch });

  // Turning the toggle on pre-selects today's day, so the preview is never
  // empty and an admin who wants exactly that can just save.
  const enable = (on: boolean) => {
    if (!on) return set({ mode: "off" });
    const today = new Date();
    const weekday = startWeekdayHint ?? today.getDay();
    set({
      mode: "weekly",
      weekdays: value.weekdays.length ? value.weekdays : [weekday],
      monthDays: value.monthDays.length ? value.monthDays : [today.getDate()],
      startTime: value.startTime || emptyRecurrenceForm.startTime,
      durationMinutes: value.durationMinutes || emptyRecurrenceForm.durationMinutes,
    });
  };

  const toggle = (list: number[], n: number): number[] =>
    list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b);

  const rule = toRecurrence(value);
  const anchor = useMemo(() => (rule ? deriveAnchor(value) : null), [rule, value]);

  // Built from the same expansion the app uses to derive occurrences, so the
  // preview cannot promise dates members will not be shown.
  const preview = useMemo(
    () => (rule && anchor ? upcomingOccurrences(anchor.start, rule, 4) : []),
    [rule, anchor],
  );

  const dayList = value.mode === "weekly" ? value.weekdays : value.monthDays;
  const noDaysChosen = value.mode !== "off" && dayList.length === 0;

  const hours = Math.floor(value.durationMinutes / 60);
  const minutes = value.durationMinutes % 60;
  const setDuration = (h: number, m: number) =>
    set({ durationMinutes: Math.max(1, h * 60 + m) });

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="sm:col-span-2 rounded-md border border-primary-200 bg-primary-50/40 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
        <input
          type="checkbox"
          checked={value.mode !== "off"}
          onChange={(e) => enable(e.target.checked)}
          className="h-4 w-4 rounded border-primary-300 accent-primary-600"
        />
        This event repeats
      </label>

      {value.mode === "off" ? (
        <p className="mt-1 text-xs text-primary-600">
          Set the start and end above for a one-off event.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-primary-600">
            The dates are worked out from the rule below — the first occurrence is
            stored, and the app derives the rest.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Repeats</label>
              <select
                value={value.mode}
                onChange={(e) => set({ mode: e.target.value as RecurrenceForm["mode"] })}
                className={inputClass}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Every {value.mode === "weekly" ? "N weeks" : "N months"}
              </label>
              <input
                type="number"
                min={1}
                max={52}
                value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
                className={inputClass}
              />
            </div>
          </div>

          {value.mode === "weekly" && (
            <div className="mt-3">
              <label className={labelClass}>On these days</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((name, idx) => (
                  <Chip
                    key={name}
                    label={name}
                    active={value.weekdays.includes(idx)}
                    onClick={() => set({ weekdays: toggle(value.weekdays, idx) })}
                  />
                ))}
              </div>
            </div>
          )}

          {value.mode === "monthly" && (
            <div className="mt-3">
              <label className={labelClass}>On these days of the month</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <Chip
                    key={day}
                    label={String(day)}
                    active={value.monthDays.includes(day)}
                    onClick={() => set({ monthDays: toggle(value.monthDays, day) })}
                    title={day > 28 ? `Months without a ${day}th are skipped` : undefined}
                  />
                ))}
              </div>
              {value.monthDays.some((d) => d > 28) && (
                <p className="mt-1 text-xs text-primary-600">
                  Months without that day are skipped, never moved to the 1st.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Starts at (church clock)</label>
              <input
                type="time"
                value={value.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Runs for</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={(e) => setDuration(Number(e.target.value) || 0, minutes)}
                  className="w-20 rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-primary-700">h</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  value={minutes}
                  onChange={(e) => setDuration(hours, Number(e.target.value) || 0)}
                  className="w-20 rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-primary-700">min</span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Ends</label>
              <select
                value={value.endMode}
                onChange={(e) => set({ endMode: e.target.value as RecurrenceForm["endMode"] })}
                className={inputClass}
              >
                <option value="never">Never</option>
                <option value="until">On a date</option>
                <option value="count">After a number of times</option>
              </select>
            </div>
            {value.endMode === "until" && (
              <div>
                <EthiopianDateTimePicker
                  label="Until (Ethiopian Calendar)"
                  value={value.until}
                  onChange={(v) => set({ until: v })}
                />
              </div>
            )}
            {value.endMode === "count" && (
              <div>
                <label className={labelClass}>Number of occurrences</label>
                <input
                  type="number"
                  min={1}
                  value={value.count}
                  onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-primary-200 pt-3">
            {noDaysChosen ? (
              <p className="text-xs text-red-600">
                Choose at least one day, or this event will never repeat.
              </p>
            ) : !anchor ? (
              <p className="text-xs text-red-600">
                This rule produces no upcoming date — check the end condition.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-primary-800">
                  {describeRecurrence(rule!, anchor.start)}
                </p>
                <p className="mt-1 text-xs text-primary-700">
                  First: {fmt(anchor.start)} — {fmt(anchor.end)}
                </p>
                {preview.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-primary-600">
                    {preview.map((d) => (
                      <li key={d.toISOString()}>Then: {fmt(d)}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
