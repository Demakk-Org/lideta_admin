import { db } from '@/lib/firebase/config';
import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { extractYouTubeVideoId, youtubeThumbnailUrl } from '@/lib/api/videos';
import { bibleVerseFields } from '@/lib/api/quoteVerse';
import type { BibleVerseFields } from '@/lib/api/quoteVerse';
import { deleteQuiz, lessonQuizId } from '@/lib/api/quizzes';
import { syncLessonCount } from '@/lib/api/courses';
import type { PublishStatus } from '@/lib/api/courses';

export enum LessonContentType {
  Title = 'title',
  Paragraph = 'paragraph',
  Banner = 'banner',
  Quote = 'quote',
  List = 'list',
  Video = 'video',
  Audio = 'audio',
}

/**
 * `text` and `ref` are both required — the app throws while rendering a quote
 * missing either. `isBibleVerse` records that the quote was picked from the
 * bible rather than typed.
 */
export type LessonQuoteValue = {
  text: string;
  /** Display text for a typed quote; JSON-encoded verse reference when
   *  `isBibleVerse` is true. */
  ref: string;
} & BibleVerseFields;

export type LessonVideoValue = {
  videoType: 'youtube' | 'hosted';
  url: string;
  title?: string;
  thumbnailUrl?: string;
  caption?: string;
  /**
   * Playback length, feeding the lesson's time estimate. Read automatically
   * from the file for hosted videos; typed by the admin for youtube, which
   * only exposes its duration through the YouTube Data API.
   */
  durationSeconds?: number;
};

export type LessonAudioValue = {
  /** Direct playable file URL, not a page. */
  url: string;
  title?: string;
  /** Artwork shown next to the player. */
  thumbnailUrl?: string;
  caption?: string;
  /** Set when the block was picked from the `audios` collection. */
  audioId?: string;
  /** Playback length, feeding the lesson's time estimate. */
  durationSeconds?: number;
};

export type LessonContentItem =
  | { type: LessonContentType.Title; value: string }
  | { type: LessonContentType.Paragraph; value: string }
  | { type: LessonContentType.Banner; value: string }
  | { type: LessonContentType.Quote; value: LessonQuoteValue }
  | { type: LessonContentType.List; value: string[] }
  | { type: LessonContentType.Video; value: LessonVideoValue }
  | { type: LessonContentType.Audio; value: LessonAudioValue };

export type LessonDoc = {
  /**
   * Read from the parent path (`courses/{courseId}/lessons/{id}`), never from
   * a stored field — lessons are a subcollection of their course.
   */
  courseId: string;
  order: number;
  title: string;
  shortDescription: string;
  /** snake_case, matching the news schema. */
  author_id: string;
  imageUrl: string;
  category: string;
  tags: string[];
  estimatedMinutes: number;
  hasQuiz: boolean;
  status: PublishStatus;
  createdAt: string;
  content: LessonContentItem[];
};

export type WithId<T> = T & { id: string };

/** `courses/{courseId}/lessons` — a lesson belongs to exactly one course. */
const lessonsRef = (courseId: string) =>
  collection(db, 'courses', courseId, 'lessons');

/** Every lesson of every course, for the dashboard's cross-course views. */
const allLessonsRef = () => collectionGroup(db, 'lessons');

/** The owning course id, taken from the document's parent path. */
function courseIdOf(ref: { parent: { parent: { id: string } | null } }): string {
  return ref.parent.parent?.id ?? '';
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function normalizeTimestamp(val: unknown): string | undefined {
  try {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (isRecord(val) && 'seconds' in val && 'nanoseconds' in val) {
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

function coerceStatus(val: unknown): PublishStatus {
  return typeof val === 'string' && val.toLowerCase() === 'published'
    ? 'published'
    : 'draft';
}

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter((v) => typeof v === 'string');
  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Omits the field entirely unless a positive duration is known — an absent
 * `durationSeconds` means "unknown", which the estimator reports, whereas a
 * stored `0` would read as a genuinely zero-length track.
 */
function durationField(raw: unknown): { durationSeconds?: number } {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return {};
  return { durationSeconds: Math.round(raw) };
}

function normalizeVideoValue(raw: unknown): LessonVideoValue | null {
  if (!isRecord(raw)) return null;
  const videoType = raw.videoType === 'youtube' ? 'youtube' : raw.videoType === 'hosted' ? 'hosted' : null;
  // Any other videoType makes the app skip the block entirely.
  if (!videoType) return null;
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!rawUrl) return null;

  const url =
    videoType === 'youtube' ? extractYouTubeVideoId(rawUrl) ?? '' : rawUrl;
  if (!url) return null;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  const explicitThumb =
    typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : '';
  // Hosted videos have no poster fallback in the app; youtube does.
  const thumbnailUrl =
    explicitThumb || (videoType === 'youtube' ? youtubeThumbnailUrl(url) : '');

  return {
    videoType,
    url,
    ...(title ? { title } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(caption ? { caption } : {}),
    ...durationField(raw.durationSeconds),
  };
}

function normalizeAudioValue(raw: unknown): LessonAudioValue | null {
  if (!isRecord(raw)) return null;
  // `audioUrl` is what the audios collection calls it; accept either key.
  const rawUrl =
    typeof raw.url === 'string'
      ? raw.url.trim()
      : typeof raw.audioUrl === 'string'
        ? raw.audioUrl.trim()
        : '';
  if (!rawUrl) return null;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  const thumbnailUrl =
    typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : '';
  const audioId = typeof raw.audioId === 'string' ? raw.audioId.trim() : '';

  return {
    url: rawUrl,
    ...(title ? { title } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(caption ? { caption } : {}),
    ...(audioId ? { audioId } : {}),
    ...durationField(raw.durationSeconds),
  };
}

/**
 * Lesson-specific: unlike the news normalizer this keeps `video` and `audio`
 * blocks instead of collapsing unknown types into a paragraph.
 */
export function normalizeLessonContent(raw: unknown): LessonContentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LessonContentItem[] = [];
  for (const it of raw) {
    if (!isRecord(it)) continue;
    const typeStr = typeof it.type === 'string' ? it.type.toLowerCase() : '';
    const value = 'value' in it ? it.value : undefined;

    switch (typeStr) {
      case LessonContentType.List:
        out.push({ type: LessonContentType.List, value: toStringArray(value) });
        break;
      case LessonContentType.Quote: {
        const text =
          isRecord(value) && typeof value.text === 'string' ? value.text : '';
        const ref =
          isRecord(value) && typeof value.ref === 'string' ? value.ref : '';
        out.push({
          type: LessonContentType.Quote,
          value: { text, ref, ...bibleVerseFields(value) },
        });
        break;
      }
      case LessonContentType.Video: {
        const v = normalizeVideoValue(value);
        if (v) out.push({ type: LessonContentType.Video, value: v });
        break;
      }
      case LessonContentType.Audio: {
        const a = normalizeAudioValue(value);
        if (a) out.push({ type: LessonContentType.Audio, value: a });
        break;
      }
      case LessonContentType.Banner:
        out.push({
          type: LessonContentType.Banner,
          value: typeof value === 'string' ? value : '',
        });
        break;
      case LessonContentType.Title:
        out.push({
          type: LessonContentType.Title,
          value: typeof value === 'string' ? value : '',
        });
        break;
      default:
        out.push({
          type: LessonContentType.Paragraph,
          value: typeof value === 'string' ? value : String(value ?? ''),
        });
    }
  }
  return out;
}

/** Rejects content the app would throw on or render as nothing. */
export function validateLessonContent(content: LessonContentItem[]): string[] {
  const issues: string[] = [];
  content.forEach((block, i) => {
    const at = `Block ${i + 1}`;
    switch (block.type) {
      case LessonContentType.Quote:
        if (!block.value.text.trim()) issues.push(`${at}: quote needs text`);
        if (!block.value.ref.trim()) {
          issues.push(`${at}: quote needs a reference — the app throws without it`);
        }
        break;
      case LessonContentType.List:
        if (block.value.length === 0) issues.push(`${at}: list is empty`);
        break;
      case LessonContentType.Video:
        if (!block.value.url.trim()) issues.push(`${at}: video needs a URL`);
        if (
          block.value.videoType === 'hosted' &&
          !block.value.thumbnailUrl?.trim()
        ) {
          issues.push(
            `${at}: hosted video needs a thumbnail — there is no fallback poster`,
          );
        }
        break;
      case LessonContentType.Audio:
        if (!block.value.url.trim()) issues.push(`${at}: audio needs a file URL`);
        break;
      case LessonContentType.Banner:
        if (!block.value.trim()) issues.push(`${at}: banner needs an image URL`);
        break;
      default:
        if (!block.value.trim()) issues.push(`${at}: text is empty`);
    }
  });
  return issues;
}

function mapDoc(
  id: string,
  courseId: string,
  data: Record<string, unknown>,
): WithId<LessonDoc> {
  return {
    id,
    courseId,
    order: typeof data.order === 'number' ? data.order : 0,
    title: typeof data.title === 'string' ? data.title : '',
    shortDescription:
      typeof data.shortDescription === 'string' ? data.shortDescription : '',
    author_id: typeof data.author_id === 'string' ? data.author_id : '',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    category: typeof data.category === 'string' ? data.category : '',
    tags: toStringArray(data.tags),
    estimatedMinutes:
      typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : 0,
    hasQuiz: data.hasQuiz === true,
    status: coerceStatus(data.status),
    createdAt: normalizeTimestamp(data.createdAt) ?? new Date().toISOString(),
    content: normalizeLessonContent(data.content),
  };
}

/**
 * Collection-group read: every course's lessons in one query.
 *
 * This needs its own security rule (`match /{path=**}/lessons/{lessonId}`) —
 * the rule covering `courses/{courseId}/lessons` does NOT authorize it. Prefer
 * {@link listLessonsForCourses}, which reads each course's subcollection and
 * works under the nested rule alone.
 */
export async function listLessonsViaCollectionGroup(): Promise<
  WithId<LessonDoc>[]
> {
  console.log('[lessonsApi] listLessons (collection group): querying...');
  try {
    const snap = await getDocs(query(allLessonsRef()));
    return snap.docs
      .map((d) =>
        mapDoc(d.id, courseIdOf(d.ref), d.data() as Record<string, unknown>),
      )
      .sort((a, b) => a.order - b.order);
  } catch (err) {
    console.error('[lessonsApi] listLessonsViaCollectionGroup error', err);
    throw new Error('Failed to list lessons');
  }
}

/** Reads each course's `lessons` subcollection and flattens the result. */
export async function listLessonsForCourses(
  courseIds: string[],
): Promise<WithId<LessonDoc>[]> {
  console.log('[lessonsApi] listLessonsForCourses', courseIds.length, 'courses');
  const results = await Promise.all(
    courseIds.map(async (courseId) => {
      try {
        return await listLessonsByCourse(courseId);
      } catch (err) {
        // One unreadable course must not blank out the whole dashboard.
        console.error('[lessonsApi] listLessonsForCourses failed for', courseId, err);
        return [] as WithId<LessonDoc>[];
      }
    }),
  );
  return results.flat().sort((a, b) => a.order - b.order);
}

export async function listLessonsByCourse(
  courseId: string,
): Promise<WithId<LessonDoc>[]> {
  try {
    const snap = await getDocs(query(lessonsRef(courseId)));
    return snap.docs
      .map((d) => mapDoc(d.id, courseId, d.data() as Record<string, unknown>))
      .sort((a, b) => a.order - b.order);
  } catch (err) {
    console.error('[lessonsApi] listLessonsByCourse error', err);
    throw new Error('Failed to list lessons');
  }
}

/** Minimal read-only view used by the lesson quiz picker. */
export type LessonOption = {
  id: string;
  title: string;
  courseId: string;
  order: number;
  status: string;
  hasQuiz: boolean;
};

export async function listLessonOptions(
  courseIds: string[],
): Promise<LessonOption[]> {
  // Same reason as listLessonsForCourses: per-course reads need no
  // collection-group rule or index.
  const lessons = await listLessonsForCourses(courseIds);
  return lessons.map((l) => ({
    id: l.id,
    title: l.title,
    courseId: l.courseId,
    order: l.order,
    status: l.status,
    hasQuiz: l.hasQuiz,
  }));
}

export type LessonWriteInput = {
  courseId: string;
  order: number;
  title: string;
  shortDescription: string;
  author_id: string;
  imageUrl: string;
  category: string;
  tags: string[];
  estimatedMinutes: number;
  content: LessonContentItem[];
};

function validate(data: LessonWriteInput) {
  if (!data.courseId.trim()) throw new Error('A course is required');
  if (!data.title.trim()) throw new Error('Lesson title is required');
  if (!Number.isFinite(data.order)) throw new Error('Lesson order is required');
  if (data.content.length === 0) {
    throw new Error('A lesson needs at least one content block');
  }
  const issues = validateLessonContent(data.content);
  if (issues.length) throw new Error(issues.join('\n'));
}

/** `courseId` is deliberately absent: the parent path is the course link. */
function buildWrite(data: LessonWriteInput) {
  return {
    order: Math.trunc(data.order),
    title: data.title.trim(),
    shortDescription: data.shortDescription.trim(),
    author_id: data.author_id.trim(),
    imageUrl: data.imageUrl.trim(),
    category: data.category.trim(),
    tags: data.tags.map((t) => t.trim()).filter(Boolean),
    estimatedMinutes: Math.max(0, Math.trunc(data.estimatedMinutes || 0)),
    content: normalizeLessonContent(data.content),
  };
}

export async function addLesson(data: LessonWriteInput): Promise<string> {
  validate(data);
  try {
    const ref = await addDoc(lessonsRef(data.courseId.trim()), {
      ...buildWrite(data),
      hasQuiz: false,
      status: 'draft',
      createdAt: Timestamp.now(),
    });
    console.log('[lessonsApi] created id', ref.id);
    return ref.id;
  } catch (err) {
    console.error('[lessonsApi] addLesson error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add lesson');
  }
}

export async function updateLesson(
  id: string,
  data: LessonWriteInput,
): Promise<void> {
  validate(data);
  try {
    // The course can't change here — the form is opened from one course's
    // lesson list, so `data.courseId` is always the lesson's own parent.
    await updateDoc(doc(lessonsRef(data.courseId.trim()), id), buildWrite(data));
  } catch (err) {
    console.error('[lessonsApi] updateLesson error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update lesson');
  }
}

export async function setLessonStatus(
  id: string,
  courseId: string,
  status: PublishStatus,
): Promise<void> {
  try {
    await updateDoc(doc(lessonsRef(courseId), id), { status });
    // lessonCount only counts published lessons.
    await syncLessonCount(courseId);
  } catch (err) {
    console.error('[lessonsApi] setLessonStatus error', err);
    throw new Error('Failed to change lesson status');
  }
}

/**
 * Writes `estimatedMinutes` alone, leaving the rest of the document untouched
 * — safe to run over a published lesson after the estimator's constants have
 * been retuned.
 *
 * The minutes are computed by the caller rather than here: `lessonEstimate`
 * imports `LessonContentType` from this module, so estimating in here would
 * make the two files circular.
 */
export async function setLessonEstimatedMinutes(
  id: string,
  courseId: string,
  minutes: number,
): Promise<void> {
  try {
    await updateDoc(doc(lessonsRef(courseId), id), {
      estimatedMinutes: Math.max(0, Math.trunc(minutes)),
    });
  } catch (err) {
    console.error('[lessonsApi] setLessonEstimatedMinutes error', err);
    throw new Error('Failed to save the estimate');
  }
}

export async function reorderLessons(
  courseId: string,
  orderedIds: string[],
  startAt = 1,
): Promise<void> {
  try {
    const batch = writeBatch(db);
    orderedIds.forEach((id, idx) => {
      batch.update(doc(lessonsRef(courseId), id), { order: startAt + idx });
    });
    await batch.commit();
  } catch (err) {
    console.error('[lessonsApi] reorderLessons error', err);
    throw new Error('Failed to reorder lessons');
  }
}

/** Removes the lesson, its quiz tree, and refreshes the course's lessonCount. */
export async function deleteLesson(
  id: string,
  courseId: string,
): Promise<void> {
  console.log('[lessonsApi] deleteLesson id', id, 'course', courseId);
  try {
    // Nothing cascades in Firestore, and the quiz id is derived — a leftover
    // quiz would be adopted by the next lesson created with the same id.
    await deleteQuiz(lessonQuizId(courseId, id));
  } catch (err) {
    console.warn('[lessonsApi] deleteLesson: quiz cleanup skipped', err);
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(lessonsRef(courseId), id));
    await batch.commit();
    if (courseId) await syncLessonCount(courseId);
  } catch (err) {
    console.error('[lessonsApi] deleteLesson error', err);
    throw new Error('Failed to delete lesson');
  }
}
