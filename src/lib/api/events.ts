import { db } from '@/lib/firebase/config';
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc } from 'firebase/firestore';

export enum EventDescriptionType {
  Title = 'title',
  Paragraph = 'paragraph',
  Banner = 'banner',
  Quote = 'quote',
  List = 'list',
}

export type QuoteValue = { text: string; ref?: string };

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
  imageUrl?: string;
  // Simple location fields
  location?: { primary: string; secondary?: string };
  short_description?: string;
  tags?: string[];
  description?: EventDescriptionItem[];
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'events');

function normalizeTimestamp(val: unknown): string | undefined {
  try {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (typeof val === 'object' && val !== null && 'seconds' in val && 'nanoseconds' in val) {
      const t = new Timestamp(
        (val as { seconds: number; nanoseconds: number }).seconds,
        (val as { seconds: number; nanoseconds: number }).nanoseconds
      );
      return t.toDate().toISOString();
    }
    if (typeof val === 'string') return val;
  } catch {}
  return undefined;
}

function toArrayOfStrings(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((v) => String(v));
  if (typeof input === 'string') return input.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean);
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

function normalizeDescription(raw: unknown): EventDescriptionItem[] | undefined {
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
    const typeStr = isRecord(it) && typeof it.type === 'string' ? it.type.toLowerCase() : '';
    const type: EventDescriptionType = AllowedDescTypes.has(typeStr)
      ? (typeStr as EventDescriptionType)
      : EventDescriptionType.Paragraph;
    const rawVal: unknown = isRecord(it) && 'value' in it ? (it as Record<string, unknown>).value : undefined;
    if (type === EventDescriptionType.List) {
      out.push({ type, value: toArrayOfStrings(rawVal) });
      continue;
    }
    if (type === EventDescriptionType.Quote) {
      if (isRecord(rawVal)) {
        const textRaw = (rawVal as Record<string, unknown>).text ?? (rawVal as Record<string, unknown>).quote ?? (rawVal as Record<string, unknown>).content;
        const text = typeof textRaw === 'string' ? textRaw : '';
        const r = (rawVal as Record<string, unknown>).ref ?? (rawVal as Record<string, unknown>).reference ?? (rawVal as Record<string, unknown>).citation;
        const ref = typeof r === 'string' && r.trim() ? r : undefined;
        out.push({ type, value: { text, ...(ref ? { ref } : {}) } });
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
          : isRecord(rawVal) && typeof (rawVal as Record<string, unknown>).url === 'string'
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

export async function listEvents(): Promise<WithId<EventDoc>[]> {
  console.log('[eventsApi] listEvents: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const startRaw = data['start_date_time'];
      const endRaw = data['end_date_time'];
      const descRaw = data['description'];
      const locRaw = data['location'];
      const normalized: EventDoc = {
        ...(data as unknown as EventDoc),
        start_date_time: normalizeTimestamp(startRaw) ?? (typeof startRaw === 'string' ? startRaw : undefined),
        end_date_time: normalizeTimestamp(endRaw) ?? (typeof endRaw === 'string' ? endRaw : undefined),
        description: normalizeDescription(descRaw),
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
              return { ...(primary ? { primary } : { primary: '' }), ...(secondary ? { secondary } : {}) } as {
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

function sanitizeEventForWrite(data: Partial<EventDoc>): Partial<EventDoc> {
  const result: Partial<EventDoc> = { ...data };
  if (result.description) {
    result.description = normalizeDescription(result.description) ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'location')) {
    const locRaw = (result as Record<string, unknown>).location;
    let out: { primary: string; secondary?: string } | undefined = undefined;
    if (typeof locRaw === 'string') {
      const p = locRaw.trim();
      out = p ? { primary: p } : undefined;
    } else if (isRecord(locRaw)) {
      const p = typeof (locRaw as Record<string, unknown>).primary === 'string' ? ((locRaw as Record<string, unknown>).primary as string).trim() : '';
      const s = typeof (locRaw as Record<string, unknown>).secondary === 'string' ? ((locRaw as Record<string, unknown>).secondary as string).trim() : '';
      if (p || s) out = { primary: p, ...(s ? { secondary: s } : {}) };
    }
    (result as Record<string, unknown>).location = out;
  }
  return result;
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
    const toWrite = sanitizeEventForWrite(data);
    const docRef = await addDoc(colRef, { ...toWrite });
    console.log('[eventsApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[eventsApi] addEvent error', err);
    throw new Error('Failed to add event');
  }
}

export async function updateEvent(id: string, data: Partial<EventDoc>): Promise<void> {
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
    const toWrite = sanitizeEventForWrite(data);
    //TODO: this part is change for development purpose only
    // the update to act as
    // revert when done
    // await updateDoc(doc(colRef, id), { ...toWrite });
    const docRef = await addDoc(colRef, { ...toWrite });
    console.log('[eventsApi] updated id', docRef.id);
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
