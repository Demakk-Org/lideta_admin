/**
 * The recurrence rule as the event form holds it, and the conversions to and
 * from the stored `Recurrence`.
 *
 * Separate from the editor component so it can be tested directly: a mistake
 * here writes a wrong rule to Firestore, which the cron then applies silently
 * every 15 minutes.
 */
import { atAddisTime, catchUpFrom, type Recurrence } from './recurrence';

/**
 * Kept distinct from `Recurrence` because a half-filled form is a normal state.
 * `until` and `count` persist while switching between end modes, so toggling
 * back and forth does not discard what was typed.
 */
export type RecurrenceForm = {
  mode: 'off' | 'weekly' | 'monthly';
  interval: number;
  weekdays: number[];
  monthDays: number[];
  endMode: 'never' | 'until' | 'count';
  until: string;
  count: number;
  /** Church clock, 'HH:MM'. When the occurrence starts, every time. */
  startTime: string;
  /** How long each occurrence runs. With the anchor start, this is the whole
   *  of what the app needs: it derives every later end as start + duration. */
  durationMinutes: number;
};

export const emptyRecurrenceForm: RecurrenceForm = {
  mode: 'off',
  interval: 1,
  weekdays: [],
  monthDays: [],
  endMode: 'never',
  until: '',
  count: 10,
  startTime: '03:00',
  durationMinutes: 120,
};

/** The rule the form currently describes, or null when switched off. */
export function toRecurrence(form: RecurrenceForm): Recurrence | null {
  if (form.mode === 'off') return null;
  return {
    freq: form.mode,
    interval: form.interval,
    ...(form.mode === 'weekly'
      ? { byWeekday: form.weekdays }
      : { byMonthDay: form.monthDays }),
    endMode: form.endMode,
    ...(form.endMode === 'until' && form.until ? { until: form.until } : {}),
    ...(form.endMode === 'count' ? { count: form.count } : {}),
  };
}

/**
 * Rebuilds the form from a stored event, for the edit modal.
 *
 * Time of day and duration are not in the rule — they are read back off the
 * anchor dates, which is where the app reads them from too.
 */
export function fromRecurrence(
  rule: Recurrence | null | undefined,
  start?: Date | null,
  end?: Date | null,
): RecurrenceForm {
  if (!rule) return emptyRecurrenceForm;

  const startTime =
    start && !Number.isNaN(start.getTime())
      ? addisClock(start)
      : emptyRecurrenceForm.startTime;

  const durationMinutes =
    start && end && end > start
      ? Math.round((end.getTime() - start.getTime()) / 60000)
      : emptyRecurrenceForm.durationMinutes;

  return {
    mode: rule.freq,
    interval: rule.interval ?? 1,
    weekdays: rule.byWeekday ?? [],
    monthDays: rule.byMonthDay ?? [],
    endMode: rule.endMode ?? 'never',
    until: rule.until ?? '',
    count: rule.count ?? 10,
    startTime,
    durationMinutes,
  };
}

/** 'HH:MM' on the church clock for an instant. */
export function addisClock(instant: Date): string {
  const shifted = new Date(instant.getTime() + 3 * 60 * 60 * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * The anchor a repeating event is stored with: occurrence 1.
 *
 * A repeating event has no start and end of its own to type — they follow from
 * the rule. This finds the first date the rule produces that is still ahead,
 * at the chosen church-clock time, and gives it the chosen duration.
 *
 * The app treats the stored dates exactly this way: `start_date_time` is the
 * anchor for the life of the series, and every later occurrence is derived as
 * that date advanced by the rule, running for `end - start`. So these two
 * values are the entire contract — nothing else needs storing.
 *
 * Returns null when the rule yields no future date at all (an `until` already
 * past, say), which the caller should surface rather than store.
 */
export function deriveAnchor(
  form: RecurrenceForm,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const rule = toRecurrence(form);
  if (!rule) return null;

  const [hourRaw, minuteRaw] = form.startTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  // Seed a day back so today still qualifies when its time has not yet passed;
  // catchUpFrom then walks forward to the first occurrence genuinely ahead.
  const seed = atAddisTime(new Date(now.getTime() - 24 * 60 * 60 * 1000), hour, minute);
  const start = catchUpFrom(seed, rule, now);
  if (!start || start <= now) return null;

  const minutes = Number.isFinite(form.durationMinutes) && form.durationMinutes > 0
    ? Math.floor(form.durationMinutes)
    : 1;
  return { start, end: new Date(start.getTime() + minutes * 60 * 1000) };
}

/**
 * Whether two forms would anchor on the same date.
 *
 * The anchor is occurrence 1 and the app keeps it for the life of the series,
 * so it must survive an edit that does not change the schedule. Without this,
 * renaming an event would re-derive the anchor against "now" and silently
 * renumber every occurrence.
 *
 * End conditions are deliberately excluded: `until` and `count` decide where a
 * series stops, never where it starts. So does `interval` — the first matching
 * date is the same whether it repeats every week or every third.
 */
export function anchorInputsEqual(a: RecurrenceForm, b: RecurrenceForm): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'off') return true;
  if (a.startTime !== b.startTime) return false;
  if (a.durationMinutes !== b.durationMinutes) return false;

  const days = (f: RecurrenceForm) => (f.mode === 'weekly' ? f.weekdays : f.monthDays);
  const x = days(a);
  const y = days(b);
  return x.length === y.length && x.every((d, i) => d === y[i]);
}
