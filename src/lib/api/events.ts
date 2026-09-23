import { db } from '@/lib/firebase/config';
import { bibleVerseFields } from '@/lib/api/quoteVerse';
import type { BibleVerseFields } from '@/lib/api/quoteVerse';
import type { Recurrence } from '@/lib/events/recurrence';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';

export enum EventDescriptionType {
  Title = 'title',
  Paragraph = 'paragraph',
  Banner = 'banner',
  Quote = 'quote',
  List = 'list',
}

export type QuoteValue = {
  text: string;
  ref?: string;
} & BibleVerseFields;

// Discriminated union for description blocks
export type EventDescriptionItem =
  | { type: EventDescriptionType.Title; value: string }
  | { type: EventDescriptionType.Paragraph; value: string }
  // Banner value must be an image URL (string)
  | { type: EventDescriptionType.Banner; value: string }
  | { type: EventDescriptionType.Quote; value: QuoteValue }
  | { type: EventDescriptionType.List; value: string[] };

export type EventDoc = {
  title: string;
  category: string; // required, stored as category name
  programme: string; // required programme field
  start_date_time?: string; // ISO or display string; we normalize timestamps to strings when reading
  end_date_time?: string;
  registration_deadline?: string;
  imageUrl?: string;
  // Simple location fields
  location?: { primary: string; secondary?: string };
  short_description?: string;
  tags?: string[];
  description?: EventDescriptionItem[];

  /**
   * Recurrence lives on the event itself: one document holds the rule and
   * always shows its NEXT occurrence, which a cron tick advances. There are no
   * per-date documents. `null` means "stop recurring" and removes the fields.
   * See docs/RECURRING_EVENTS_V3_PLAN.md.
   */
  recurrence?: Recurrence | null;
  /** False once paused by an admin, or once the rule has run out. */
  recurrence_active?: boolean;
  /** 1-based. The only record of how many occurrences have run, since rolling
   *  overwrites the start date. */
  recurrence_occurrence?: number;
  /** Written by the cron only, to keep a reminder from being sent twice. */
  recurrence_reminded_occurrence?: number;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'events');

function normalizeTimestamp(val: unknown): string | undefined {
  try {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (
      typeof val === 'object' &&
      val !== null &&
      'seconds' in val &&
      'nanoseconds' in val
    ) {
      const t = new Timestamp(
        (val as { seconds: number; nanoseconds: number }).seconds,
        (val as { seconds: number; nanoseconds: number }).nanoseconds,
      );
      return t.toDate().toISOString();
    }
    if (typeof val === 'string') return val;
  } catch {}
  return undefined;
}

function toTimestampValue(val: unknown): Timestamp | undefined {
  try {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val;
    if (val instanceof Date)
      return isNaN(val.getTime()) ? undefined : Timestamp.fromDate(val);
    if (
      typeof val === 'object' &&
      val !== null &&
      'seconds' in val &&
      'nanoseconds' in val
    ) {
      const t = new Timestamp(
        (val as { seconds: number; nanoseconds: number }).seconds,
        (val as { seconds: number; nanoseconds: number }).nanoseconds,
      );
      return t;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const localMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.exec(trimmed);
      if (localMatch) {
        const yyyy = Number(trimmed.slice(0, 4));
        const mm = Number(trimmed.slice(5, 7));
        const dd = Number(trimmed.slice(8, 10));
        const hh = Number(trimmed.slice(11, 13));
        const mi = Number(trimmed.slice(14, 16));
        const local = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
        return isNaN(local.getTime()) ? undefined : Timestamp.fromDate(local);
      }
      const asDate = new Date(trimmed);
      return isNaN(asDate.getTime()) ? undefined : Timestamp.fromDate(asDate);
    }
  } catch {}
  return undefined;
}

function toArrayOfStrings(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((v) => String(v));
  if (typeof input === 'string')
    return input
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

const AllowedDescTypes = new Set<string>([
  EventDescriptionType.Title,
  EventDescriptionType.Paragraph,
  EventDescriptionType.Banner,
  EventDescriptionType.Quote,
  EventDescriptionType.List,
]);

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function normalizeDescription(
  raw: unknown,
): EventDescriptionItem[] | undefined {
  if (!raw) return undefined;
  const arr: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: EventDescriptionItem[] = [];
  for (const it of arr) {
    if (it == null) {
      out.push({ type: EventDescriptionType.Paragraph, value: '' });
      continue;
    }
    if (typeof it === 'string') {
      out.push({ type: EventDescriptionType.Paragraph, value: it });
      continue;
    }
    const typeStr =
      isRecord(it) && typeof it.type === 'string' ? it.type.toLowerCase() : '';
    const type: EventDescriptionType = AllowedDescTypes.has(typeStr)
      ? (typeStr as EventDescriptionType)
      : EventDescriptionType.Paragraph;
    const rawVal: unknown =
      isRecord(it) && 'value' in it
        ? (it as Record<string, unknown>).value
        : undefined;
    if (type === EventDescriptionType.List) {
      out.push({ type, value: toArrayOfStrings(rawVal) });
      continue;
    }
    if (type === EventDescriptionType.Quote) {
      if (isRecord(rawVal)) {
        const textRaw =
          (rawVal as Record<string, unknown>).text ??
          (rawVal as Record<string, unknown>).quote ??
          (rawVal as Record<string, unknown>).content;
        const text = typeof textRaw === 'string' ? textRaw : '';
        const r =
          (rawVal as Record<string, unknown>).ref ??
          (rawVal as Record<string, unknown>).reference ??
          (rawVal as Record<string, unknown>).citation;
        const ref = typeof r === 'string' && r.trim() ? r : undefined;
        out.push({
          type,
          value: {
            text,
            ...(ref ? { ref } : {}),
            ...bibleVerseFields(rawVal),
          },
        });
      } else {
        out.push({ type, value: { text: String(rawVal ?? '') } });
      }
      continue;
    }
    if (type === EventDescriptionType.Banner) {
      // Accept string or object with url field
      const url =
        typeof rawVal === 'string'
          ? rawVal
          : isRecord(rawVal) &&
              typeof (rawVal as Record<string, unknown>).url === 'string'
            ? ((rawVal as Record<string, unknown>).url as string)
            : '';
      out.push({ type, value: url });
      continue;
    }
    // Title / Paragraph default to simple string
    out.push({ type, value: String(rawVal ?? '') });
  }
  return out;
}

const RECURRENCE_FREQS = new Set(['weekly', 'monthly']);
const RECURRENCE_END_MODES = new Set(['never', 'until', 'count']);

function toIntList(raw: unknown, min: number, max: number): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = [
    ...new Set(
      raw
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v >= min && v <= max),
    ),
  ].sort((a, b) => a - b);
  return out.length ? out : undefined;
}

/**
 * Keeps a rule the cron can trust: the roll runs unattended every 15 minutes,
 * so a malformed interval or an out-of-range weekday would strand an event
 * rather than surface an error to anyone.
 */
function normalizeRecurrence(raw: unknown): Recurrence | undefined {
  if (!isRecord(raw)) return undefined;

  const freq = String(raw.freq ?? '').toLowerCase();
  if (!RECURRENCE_FREQS.has(freq)) return undefined;

  const endModeRaw = String(raw.endMode ?? 'never').toLowerCase();
  const endMode = RECURRENCE_END_MODES.has(endModeRaw)
    ? (endModeRaw as Recurrence['endMode'])
    : 'never';

  const intervalRaw = Number(raw.interval);
  const interval =
    Number.isFinite(intervalRaw) && intervalRaw >= 1 ? Math.floor(intervalRaw) : 1;

  const out: Recurrence = {
    freq: freq as Recurrence['freq'],
    interval,
    endMode,
  };

  if (freq === 'weekly') {
    const byWeekday = toIntList(raw.byWeekday, 0, 6);
    if (byWeekday) out.byWeekday = byWeekday;
  } else {
    const byMonthDay = toIntList(raw.byMonthDay, 1, 31);
    if (byMonthDay) out.byMonthDay = byMonthDay;
  }

  if (endMode === 'until') {
    const until = toTimestampValue(raw.until);
    if (until) out.until = until.toDate().toISOString();
    else out.endMode = 'never';
  }
  if (endMode === 'count') {
    const countRaw = Number(raw.count);
    if (Number.isFinite(countRaw) && countRaw >= 1) out.count = Math.floor(countRaw);
    else out.endMode = 'never';
  }

  const exceptions = Array.isArray(raw.exceptions)
    ? [
        ...new Set(
          raw.exceptions
            .map((v) => String(v))
            .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)),
        ),
      ].sort()
    : [];
  if (exceptions.length) out.exceptions = exceptions;

  return out;
}

export async function listEvents(): Promise<WithId<EventDoc>[]> {
  console.log('[eventsApi] listEvents: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const startRaw = data['start_date_time'];
      const endRaw = data['end_date_time'];
      const deadlineRaw = data['registration_deadline'];
      const descRaw = data['description'];
      const locRaw = data['location'];
      const normalized: EventDoc = {
        ...(data as unknown as EventDoc),
        start_date_time:
          normalizeTimestamp(startRaw) ??
          (typeof startRaw === 'string' ? startRaw : undefined),
        end_date_time:
          normalizeTimestamp(endRaw) ??
          (typeof endRaw === 'string' ? endRaw : undefined),
        registration_deadline:
          normalizeTimestamp(deadlineRaw) ??
          (typeof deadlineRaw === 'string' ? deadlineRaw : undefined),
        description: normalizeDescription(descRaw),
        recurrence: normalizeRecurrence(data['recurrence']),
        // Map legacy location shapes to { primary, secondary? }
        location: (() => {
          if (!locRaw) return undefined;
          if (typeof locRaw === 'string') return { primary: locRaw };
          if (isRecord(locRaw)) {
            const pVal = (locRaw as Record<string, unknown>).primary;
            const sVal = (locRaw as Record<string, unknown>).secondary;
            const primary = typeof pVal === 'string' ? pVal : undefined;
            const secondary = typeof sVal === 'string' ? sVal : undefined;
            if (primary || secondary)
              return {
                ...(primary ? { primary } : { primary: '' }),
                ...(secondary ? { secondary } : {}),
              } as {
                primary: string;
                secondary?: string;
              };
          }
          return undefined;
        })(),
      };
      return { id: d.id, ...normalized } as WithId<EventDoc>;
    });
    return items;
  } catch (err) {
    console.error('[eventsApi] listEvents error', err);
    throw new Error('Failed to list events');
  }
}

export function sanitizeEventForWrite(data: Partial<EventDoc>): Partial<EventDoc> {
  const result: Partial<EventDoc> = { ...data };
  if (Object.prototype.hasOwnProperty.call(result, 'start_date_time')) {
    (result as Record<string, unknown>).start_date_time = toTimestampValue(
      result.start_date_time,
    );
  }
  if (Object.prototype.hasOwnProperty.call(result, 'end_date_time')) {
    (result as Record<string, unknown>).end_date_time = toTimestampValue(
      result.end_date_time,
    );
  }
  if (Object.prototype.hasOwnProperty.call(result, 'registration_deadline')) {
    (result as Record<string, unknown>).registration_deadline =
      toTimestampValue(result.registration_deadline);
  }
  if (result.description) {
    result.description = normalizeDescription(result.description) ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'recurrence')) {
    // `null` is the form's way of saying "this is no longer recurring". The
    // fields are removed rather than left behind, so nothing half-configured
    // survives for the cron to act on. Safe to delete: unlike the fields in
    // docs/RECURRING_EVENTS_V3_PLAN.md §3.1, the published app never reads
    // these, so their absence cannot break the events list.
    if (result.recurrence === null) {
      const r = result as Record<string, unknown>;
      r.recurrence = deleteField();
      r.recurrence_active = deleteField();
      r.recurrence_occurrence = deleteField();
      r.recurrence_reminded_occurrence = deleteField();
    } else {
      const normalized = normalizeRecurrence(result.recurrence);
      if (normalized) result.recurrence = normalized;
      else delete result.recurrence;
    }
  }
  if (Object.prototype.hasOwnProperty.call(result, 'location')) {
    const locRaw = (result as Record<string, unknown>).location;
    let out: { primary: string; secondary?: string } | undefined = undefined;
    if (typeof locRaw === 'string') {
      out = { primary: locRaw.trim() };
    } else if (isRecord(locRaw)) {
      const p =
        typeof (locRaw as Record<string, unknown>).primary === 'string'
          ? ((locRaw as Record<string, unknown>).primary as string).trim()
          : '';
      const s =
        typeof (locRaw as Record<string, unknown>).secondary === 'string'
          ? ((locRaw as Record<string, unknown>).secondary as string).trim()
          : '';
      // Always an object, even when both parts are blank. The published app
      // does `Location.fromJson(json['location'] as Map<String, dynamic>)` — a
      // missing key is `null as Map`, which throws inside the `.map()` over the
      // whole query, so ONE event saved without a location empties the entire
      // events list rather than just losing its own venue line. Storing
      // `{ primary: '' }` is what EventsFormModal's payload comment already
      // promises; this used to quietly undo it.
      out = { primary: p, ...(s ? { secondary: s } : {}) };
    }
    (result as Record<string, unknown>).location = out;
  }
  return result;
}

/**
 * Firestore rejects `undefined` outright — `addDoc` throws before it reaches the
 * network — so a caller that omits an optional field would fail with an opaque
 * error rather than saving. Dropping the key is the correct reading of "not
 * provided".
 */
function stripUndefined<T extends object>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out as T;
}

export async function addEvent(data: EventDoc): Promise<string> {
  console.log('[eventsApi] addEvent payload', data);
  try {
    if (!data.category || !data.category.trim()) {
      throw new Error('Event category is required');
    }
    if (!data.title || !data.title.trim()) {
      throw new Error('Event title is required');
    }
    if (!data.programme || !data.programme.trim()) {
      throw new Error('Event programme is required');
    }
    const toWrite = stripUndefined(sanitizeEventForWrite(data));
    const docRef = await addDoc(colRef, { ...toWrite });
    console.log('[eventsApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[eventsApi] addEvent error', err);
    throw new Error('Failed to add event');
  }
}

export async function updateEvent(
  id: string,
  data: Partial<EventDoc>,
): Promise<void> {
  console.log('[eventsApi] updateEvent id', id, 'data', data);
  try {
    if (Object.prototype.hasOwnProperty.call(data, 'category')) {
      const val = (data.category ?? '').toString();
      if (!val.trim()) {
        throw new Error('Event category cannot be empty');
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'title')) {
      const val = (data.title ?? '').toString();
      if (!val.trim()) {
        throw new Error('Event title cannot be empty');
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'programme')) {
      const val = (data.programme ?? '').toString();
      if (!val.trim()) {
        throw new Error('Event programme cannot be empty');
      }
    }
    const toWrite = stripUndefined(sanitizeEventForWrite(data));
    await updateDoc(doc(colRef, id), { ...toWrite });
    console.log('[eventsApi] updated id', id);
  } catch (err) {
    console.error('[eventsApi] updateEvent error', err);
    throw new Error('Failed to update event');
  }
}

export async function deleteEvent(id: string): Promise<void> {
  console.log('[eventsApi] deleteEvent id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[eventsApi] deleteEvent error', err);
    throw new Error('Failed to delete event');
  }
}
