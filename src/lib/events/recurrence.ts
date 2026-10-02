/**
 * Recurrence rules for events.
 *
 * A recurring event is a single `events` document that always holds its *next*
 * occurrence; a cron tick advances it once the current occurrence ends. This
 * module is the one piece of real logic in that design, and it is deliberately
 * pure — no Firestore, no clock reads except the ones callers pass in — so both
 * the cron route and the "next dates" preview in the event form share it.
 *
 * See docs/RECURRING_EVENTS_V3_PLAN.md.
 *
 * TIMEZONE. The church states its times on the Addis Ababa clock, while Vercel
 * and Firebase both run in UTC. Ethiopia is UTC+3 all year with no DST, so every
 * calendar question here ("which weekday is this?", "which day is this?") is
 * answered against a fixed +03:00 offset rather than the runtime's timezone.
 * Getting this wrong shifts every programme by three hours, silently.
 */

export type RecurrenceFreq = 'weekly' | 'monthly';

export type Recurrence = {
  freq: RecurrenceFreq;
  /** Every N weeks/months. Values below 1 are treated as 1. */
  interval: number;
  /** 0 = Sunday .. 6 = Saturday. Weekly only; defaults to the current day. */
  byWeekday?: number[];
  /** 1..31. Monthly only; defaults to the current day of the month. */
  byMonthDay?: number[];
  endMode: 'never' | 'until' | 'count';
  /** ISO date or datetime, inclusive to the end of that day. */
  until?: string;
  /** Total occurrences. Enforced by the caller via recurrence_occurrence. */
  count?: number;
  /** 'YYYY-MM-DD' days to skip, in Addis local time. */
  exceptions?: string[];
};

const OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Addis_Ababa, UTC+3, no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many candidate dates to examine before giving up. Reached only by a rule
 * that can never produce another date — every weekday excepted forever, say —
 * which callers treat the same as a finished series.
 */
const MAX_SEARCH = 500;

/** Civil (wall-clock) fields in Addis, read off an absolute instant. */
type Civil = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
  second: number;
  ms: number;
};

function toCivil(instant: Date): Civil {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  };
}

/** The instant at which the given Addis wall-clock date and time occurs. */
function toInstant(
  year: number,
  month: number,
  day: number,
  time: Pick<Civil, 'hour' | 'minute' | 'second' | 'ms'>,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, time.hour, time.minute, time.second, time.ms) -
      OFFSET_MS,
  );
}

/**
 * The instant at which `day`'s Addis date falls at the given wall-clock time.
 *
 * Used to turn "Sundays at 03:00" into a real anchor date without the browser's
 * timezone getting a vote — an admin abroad must still schedule church time.
 */
export function atAddisTime(day: Date, hour: number, minute: number): Date {
  const c = toCivil(day);
  return toInstant(c.year, c.month, c.day, { hour, minute, second: 0, ms: 0 });
}

/** 'YYYY-MM-DD' for an instant, in Addis local time. */
export function ymdInAddis(instant: Date): string {
  const c = toCivil(instant);
  const mm = String(c.month).padStart(2, '0');
  const dd = String(c.day).padStart(2, '0');
  return `${c.year}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeInterval(interval: number): number {
  return Number.isFinite(interval) && interval >= 1 ? Math.floor(interval) : 1;
}

function normalizeWeekdays(raw: number[] | undefined, fallback: number): number[] {
  const valid = (raw ?? [])
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  const unique = [...new Set(valid)];
  return unique.length ? unique : [fallback];
}

function normalizeMonthDays(raw: number[] | undefined, fallback: number): number[] {
  const valid = (raw ?? [])
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
    .sort((a, b) => a - b);
  const unique = [...new Set(valid)];
  return unique.length ? unique : [fallback];
}

/**
 * The next weekly date strictly after `from`, ignoring exceptions and `until`.
 * Weeks start on Sunday, matching the 0 = Sunday convention used across the app.
 */
function nextWeekly(from: Civil, rule: Recurrence): { year: number; month: number; day: number } {
  const interval = normalizeInterval(rule.interval);
  const targets = normalizeWeekdays(rule.byWeekday, from.weekday);

  // Midnight-anchored day arithmetic; the time of day is reapplied by the caller.
  const fromMidnightUtc = Date.UTC(from.year, from.month - 1, from.day);
  const weekStartUtc = fromMidnightUtc - from.weekday * DAY_MS;

  const laterThisWeek = targets.find((t) => t > from.weekday);
  const resultUtc =
    laterThisWeek !== undefined
      ? weekStartUtc + laterThisWeek * DAY_MS
      : weekStartUtc + interval * 7 * DAY_MS + targets[0] * DAY_MS;

  const d = new Date(resultUtc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The next monthly date strictly after `from`, ignoring exceptions and `until`.
 * A target day that does not exist in a month (the 31st of February) is skipped
 * rather than rolled into the following month, so "the 31st" never silently
 * becomes "the 1st".
 */
function nextMonthly(
  from: Civil,
  rule: Recurrence,
): { year: number; month: number; day: number } | null {
  const interval = normalizeInterval(rule.interval);
  const targets = normalizeMonthDays(rule.byMonthDay, from.day);

  const laterThisMonth = targets.find(
    (t) => t > from.day && t <= daysInMonth(from.year, from.month),
  );
  if (laterThisMonth !== undefined) {
    return { year: from.year, month: from.month, day: laterThisMonth };
  }

  let year = from.year;
  let month = from.month;
  for (let hop = 0; hop < MAX_SEARCH; hop += 1) {
    const advanced = new Date(Date.UTC(year, month - 1 + interval, 1));
    year = advanced.getUTCFullYear();
    month = advanced.getUTCMonth() + 1;

    const fits = targets.find((t) => t <= daysInMonth(year, month));
    if (fits !== undefined) return { year, month, day: fits };
  }
  return null;
}

/** Inclusive to the end of the `until` day, in Addis local time. */
function isAfterUntil(candidate: Date, rule: Recurrence): boolean {
  if (rule.endMode !== 'until' || !rule.until) return false;
  const until = new Date(rule.until);
  if (Number.isNaN(until.getTime())) return false;
  return ymdInAddis(candidate) > ymdInAddis(until);
}

/**
 * The next occurrence strictly after `currentStart`, at the same Addis
 * wall-clock time of day, or null when the rule has no further dates.
 *
 * Takes the occurrence's START, not its end: a 03:00-06:00 service must roll to
 * 03:00 next week, not 06:00. Callers derive the new end by adding the previous
 * occurrence's duration.
 *
 * Returns null when `until` has passed, when a monthly rule can never match
 * again, or when the search bound is hit. `count` is not enforced here — the
 * caller owns the occurrence counter.
 */
export function nextOccurrenceAfter(currentStart: Date, rule: Recurrence): Date | null {
  if (Number.isNaN(currentStart.getTime())) return null;

  const exceptions = new Set(rule.exceptions ?? []);
  let cursor = toCivil(currentStart);
  const timeOfDay = {
    hour: cursor.hour,
    minute: cursor.minute,
    second: cursor.second,
    ms: cursor.ms,
  };

  for (let step = 0; step < MAX_SEARCH; step += 1) {
    const next =
      rule.freq === 'monthly' ? nextMonthly(cursor, rule) : nextWeekly(cursor, rule);
    if (!next) return null;

    const candidate = toInstant(next.year, next.month, next.day, timeOfDay);
    if (isAfterUntil(candidate, rule)) return null;

    if (!exceptions.has(ymdInAddis(candidate))) return candidate;

    cursor = toCivil(candidate);
  }
  return null;
}

/**
 * Repeatedly advances until the occurrence is in the future, so a series that
 * missed ticks — the scheduler is external and best-effort — catches up in one
 * pass instead of stranding in the past. Returns null if the rule runs out.
 */
export function catchUpFrom(
  currentStart: Date,
  rule: Recurrence,
  now: Date,
): Date | null {
  let next = nextOccurrenceAfter(currentStart, rule);
  for (let step = 0; next && next <= now && step < MAX_SEARCH; step += 1) {
    next = nextOccurrenceAfter(next, rule);
  }
  return next && next > now ? next : next;
}

/**
 * The next `n` occurrences after `currentStart`, for the form's preview. Shares
 * the expansion above so the preview can never disagree with the cron tick.
 */
export function upcomingOccurrences(
  currentStart: Date,
  rule: Recurrence,
  n: number,
): Date[] {
  const out: Date[] = [];
  let cursor = currentStart;
  for (let i = 0; i < n; i += 1) {
    const next = nextOccurrenceAfter(cursor, rule);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The rule in plain words, for the form summary and the list badge — so an
 * admin can confirm what they built without reading the preview dates.
 *
 * `fallbackStart` supplies the day the rule defaults to when no weekday or
 * month day was chosen, matching what expansion actually does.
 */
export function describeRecurrence(rule: Recurrence, fallbackStart?: Date): string {
  const interval = normalizeInterval(rule.interval);

  let base: string;
  if (rule.freq === 'weekly') {
    const fallback = fallbackStart ? toCivil(fallbackStart).weekday : 0;
    const days = normalizeWeekdays(rule.byWeekday, fallback);
    const names = joinWords(days.map((d) => (days.length > 2 ? WEEKDAY_SHORT[d] : WEEKDAY_NAMES[d])));
    base = interval === 1 ? `Weekly on ${names}` : `Every ${interval} weeks on ${names}`;
  } else {
    const fallback = fallbackStart ? toCivil(fallbackStart).day : 1;
    const days = normalizeMonthDays(rule.byMonthDay, fallback);
    const names = joinWords(days.map(ordinal));
    base = interval === 1 ? `Monthly on the ${names}` : `Every ${interval} months on the ${names}`;
  }

  if (rule.endMode === 'until' && rule.until) {
    const until = new Date(rule.until);
    if (!Number.isNaN(until.getTime())) return `${base}, until ${ymdInAddis(until)}`;
  }
  if (rule.endMode === 'count' && rule.count) {
    return `${base}, ${rule.count} time${rule.count === 1 ? '' : 's'}`;
  }
  return base;
}
