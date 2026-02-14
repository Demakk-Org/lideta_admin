import { db } from '@/lib/firebase/config';
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc } from 'firebase/firestore';

export enum NewsContentType {
  Title = 'title',
  Paragraph = 'paragraph',
  Banner = 'banner',
  Quote = 'quote',
  List = 'list',
}

export type NewsQuoteValue = { text: string; ref?: string };

export type NewsContentItem =
  | { type: NewsContentType.Title; value: string }
  | { type: NewsContentType.Paragraph; value: string }
  | { type: NewsContentType.Banner; value: string }
  | { type: NewsContentType.Quote; value: NewsQuoteValue }
  | { type: NewsContentType.List; value: string[] };

export type NewsStatus = 'draft' | 'published';

export type NewsDoc = {
  title: string;
  category: string;
  imageUrl?: string;
  createdAt?: string; // normalized to ISO string when reading
  status?: NewsStatus;
  tags?: string[];
  short_description?: string;
  content?: NewsContentItem[]; // content blocks similar to events.description
  author_id?: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'news');

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

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

const AllowedTypes = new Set<string>([
  NewsContentType.Title,
  NewsContentType.Paragraph,
  NewsContentType.Banner,
  NewsContentType.Quote,
  NewsContentType.List,
]);

function normalizeContent(raw: unknown): NewsContentItem[] | undefined {
  if (!raw) return undefined;
  const arr: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: NewsContentItem[] = [];
  for (const it of arr) {
    if (it == null) {
      out.push({ type: NewsContentType.Paragraph, value: '' });
      continue;
    }
    if (typeof it === 'string') {
      out.push({ type: NewsContentType.Paragraph, value: it });
      continue;
    }
    const typeStr = isRecord(it) && typeof it.type === 'string' ? it.type.toLowerCase() : '';
    const type: NewsContentType = AllowedTypes.has(typeStr) ? (typeStr as NewsContentType) : NewsContentType.Paragraph;
    const rawVal: unknown = isRecord(it) && 'value' in it ? (it as Record<string, unknown>).value : undefined;
    if (type === NewsContentType.List) {
      out.push({ type, value: toArrayOfStrings(rawVal) });
      continue;
    }
    if (type === NewsContentType.Quote) {
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
    if (type === NewsContentType.Banner) {
      const url =
        typeof rawVal === 'string'
          ? rawVal
          : isRecord(rawVal) && typeof (rawVal as Record<string, unknown>).url === 'string'
          ? ((rawVal as Record<string, unknown>).url as string)
          : '';
      out.push({ type, value: url });
      continue;
    }
    out.push({ type, value: String(rawVal ?? '') });
  }
  return out;
}

function sanitizeForWrite(data: Partial<NewsDoc>): Partial<NewsDoc> {
  const result: Partial<NewsDoc> = { ...data };
  if (result.content) {
    result.content = normalizeContent(result.content) ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'tags')) {
    const tRaw = (result as Record<string, unknown>).tags;
    (result as Record<string, unknown>).tags = Array.isArray(tRaw)
      ? tRaw.map((v) => String(v).trim()).filter(Boolean)
      : typeof tRaw === 'string'
      ? tRaw
          .split(/\r?\n|,/)
          .map((v) => v.trim())
          .filter(Boolean)
      : undefined;
  }
  return result;
}

export async function listNews(): Promise<WithId<NewsDoc>[]> {
  console.log('[newsApi] listNews: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const createdAt = normalizeTimestamp(data['createdAt']);
      const content = normalizeContent(data['content']);
      const normalized: NewsDoc = {
        ...(data as unknown as NewsDoc),
        createdAt,
        content,
      };
      return { id: d.id, ...normalized } as WithId<NewsDoc>;
    });
    return items;
  } catch (err) {
    console.error('[newsApi] listNews error', err);
    throw new Error('Failed to list news');
  }
}

export async function addNews(data: NewsDoc): Promise<string> {
  console.log('[newsApi] addNews payload', data);
  try {
    if (!data.title || !data.title.trim()) throw new Error('News title is required');
    if (!data.category || !data.category.trim()) throw new Error('News category is required');
    if (!data.author_id || !data.author_id.trim()) throw new Error('Author is required');
    const toWrite = sanitizeForWrite(data);
    const docRef = await addDoc(colRef, { ...toWrite, createdAt: Timestamp.now() });
    console.log('[newsApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[newsApi] addNews error', err);
    throw new Error('Failed to add news');
  }
}

export async function updateNews(id: string, data: Partial<NewsDoc>): Promise<void> {
  console.log('[newsApi] updateNews id', id, 'data', data);
  try {
    if (Object.prototype.hasOwnProperty.call(data, 'title')) {
      const val = (data.title ?? '').toString();
      if (!val.trim()) throw new Error('News title cannot be empty');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'category')) {
      const val = (data.category ?? '').toString();
      if (!val.trim()) throw new Error('News category cannot be empty');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'author_id')) {
      const val = (data.author_id ?? '').toString();
      if (!val.trim()) throw new Error('Author is required');
    }
    const toWrite = sanitizeForWrite(data);
    // Never allow updating createdAt via edit
    if (Object.prototype.hasOwnProperty.call(toWrite, 'createdAt')) {
      delete (toWrite as Record<string, unknown>).createdAt;
    }
    //TODO: this part is change for development purpose only
    // the update to act as
    // revert when done
    // await updateDoc(doc(colRef, id), { ...toWrite });
    await addDoc(colRef, { ...toWrite, createdAt: Timestamp.now() });
  } catch (err) {
    console.error('[newsApi] updateNews error', err);
    throw new Error('Failed to update news');
  }
}

export async function deleteNews(id: string): Promise<void> {
  console.log('[newsApi] deleteNews id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[newsApi] deleteNews error', err);
    throw new Error('Failed to delete news');
  }
}

