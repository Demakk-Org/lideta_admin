/**
 * Ethiopian-calendar helpers for the date pickers.
 *
 * Kept out of the component so the month arithmetic — which is where the
 * off-by-one bugs live (Pagumē's short month, leap years, which weekday column
 * day 1 falls in) — can be unit tested without a DOM.
 */
import { toEthiopian, toGregorian } from 'ethiopian-date';
import { isEthiopianLeapYear } from '@/lib/api/books';

export type EthDate = { y: number; m: number; d: number };

/** Sunday-first, matching JS `Date#getDay()`. */
export const AMHARIC_WEEKDAYS_SHORT = ['እሑ', 'ሰኞ', 'ማክ', 'ረቡ', 'ሐሙ', 'ዓር', 'ቅዳ'];

/** Ethiopian months are 30 days except Pagumē (13), which is 5 or 6. */
export function daysInEthiopianMonth(year: number, month: number): number {
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 30;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Accepts the local `YYYY-MM-DDTHH:mm` string this picker emits, or anything
 * `Date` can parse (stored ISO values). Returns null for empty/unparseable.
 */
export function parseToDate(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (m) {
    // Built field-by-field so it is unambiguously local, never UTC.
    const dt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function toEth(dt: Date): EthDate {
  const [y, m, d] = toEthiopian(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  return { y, m, d };
}

/** Ethiopian y/m/d + `HH:mm` -> the local `YYYY-MM-DDTHH:mm` the picker emits. */
export function toLocalString(eth: EthDate, time: string): string {
  const [gy, gm, gd] = toGregorian(eth.y, eth.m, eth.d);
  const [hh, mi] = (time || '00:00').split(':');
  return `${gy}-${pad2(gm)}-${pad2(gd)}T${pad2(Number(hh) || 0)}:${pad2(Number(mi) || 0)}`;
}

/** Weekday column (0=Sun) that day 1 of the given Ethiopian month falls in. */
export function leadingBlanks(year: number, month: number): number {
  const [gy, gm, gd] = toGregorian(year, month, 1);
  return new Date(gy, gm - 1, gd).getDay();
}

/** Previous/next month, wrapping across Pagumē (13) into the adjacent year. */
export function shiftMonth(view: { y: number; m: number }, delta: number): { y: number; m: number } {
  const raw = view.m + delta;
  if (raw < 1) return { y: view.y - 1, m: 13 };
  if (raw > 13) return { y: view.y + 1, m: 1 };
  return { y: view.y, m: raw };
}

/** A start/end pair as the event form holds them: local `YYYY-MM-DDTHH:mm`, or "". */
export type DateRange = { start: string; end: string };

/** Day-level comparison key, so clicks compare dates without time getting in the way. */
function dayOrdinal(eth: EthDate): number {
  const [gy, gm, gd] = toGregorian(eth.y, eth.m, eth.d);
  return Date.UTC(gy, gm - 1, gd);
}

function timeOf(value: string, fallback: string): string {
  const dt = parseToDate(value);
  return dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : fallback;
}

/**
 * What clicking [clicked] does to the current range.
 *
 * Three cases, in the order a user meets them:
 *   nothing selected, or a complete range  -> start over: this becomes the start,
 *                                             end is cleared (a one-day event
 *                                             until a second day is chosen)
 *   start chosen, clicked on/after it      -> this becomes the end; clicking the
 *                                             same day again gives a same-day
 *                                             range, which is how you set an end
 *                                             time without spanning days
 *   start chosen, clicked before it        -> the user is re-picking the start
 *
 * Times are preserved: the start keeps its clock time, and a newly chosen end
 * lands [defaultDurationMs] after the start's clock time, matching what the form
 * derives when End is left blank.
 */
export function applyDayClick(
  current: DateRange,
  clicked: EthDate,
  defaultDurationMs: number,
): DateRange {
  const startTime = timeOf(current.start, '00:00');
  const restart = { start: toLocalString(clicked, startTime), end: '' };

  const startDt = parseToDate(current.start);
  if (!startDt || current.end) return restart;

  if (dayOrdinal(clicked) < dayOrdinal(toEth(startDt))) return restart;

  const endClock = new Date(startDt.getTime() + defaultDurationMs);
  return {
    start: current.start,
    end: toLocalString(clicked, `${pad2(endClock.getHours())}:${pad2(endClock.getMinutes())}`),
  };
}

/** True when [day] sits inside the chosen range (or the one being previewed). */
export function isWithinRange(day: EthDate, from: EthDate | null, to: EthDate | null): boolean {
  if (!from || !to) return false;
  const [lo, hi] = [dayOrdinal(from), dayOrdinal(to)].sort((a, b) => a - b);
  const d = dayOrdinal(day);
  return d > lo && d < hi;
}
