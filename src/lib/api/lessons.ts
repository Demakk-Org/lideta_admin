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
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import {
  buildLocalized,
  buildLocalizedList,
  localesOf,
  readLocalized,
  readLocalizedList,
  resolveLocalized,
  resolveLocalizedList,
} from '@/lib/i18n/localizedText';
import type { LocalizedList, LocalizedText } from '@/lib/i18n/localizedText';
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
  text: LocalizedText;
  /** Display text for a typed quote; JSON-encoded verse reference when
   *  `isBibleVerse` is true. */
  ref: string;
} & BibleVerseFields;

export type LessonVideoValue = {
  videoType: 'youtube' | 'hosted';
  url: string;
  /** Prose, so localized. The file itself is not. */
  title?: LocalizedText;
  thumbnailUrl?: string;
  caption?: LocalizedText;
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
  title?: LocalizedText;
  /** Artwork shown next to the player. */
  thumbnailUrl?: string;
  caption?: LocalizedText;
  /** Set when the block was picked from the `audios` collection. */
  audioId?: string;
  /** Playback length, feeding the lesson's time estimate. */
  durationSeconds?: number;
};

/**
 * A stored content block. The array is shared across languages — only the text
 * inside a block varies, so a translation can never reorder a lesson, drop a
 * block, or move a verse reference.
 */
export type LessonContentItem =
  | { type: LessonContentType.Title; value: LocalizedText }
  | { type: LessonContentType.Paragraph; value: LocalizedText }
  /** A URL, not prose — one image serves every language. */
  | { type: LessonContentType.Banner; value: string }
  | { type: LessonContentType.Quote; value: LessonQuoteValue }
  | { type: LessonContentType.List; value: LocalizedList }
  | { type: LessonContentType.Video; value: LessonVideoValue }
  | { type: LessonContentType.Audio; value: LessonAudioValue };

/**
 * One language's view of a block — what the estimator, the validator and the
 * app's renderer all work on. See {@link projectContent}.
 */
export type FlatContentItem =
  | { type: LessonContentType.Title; value: string }
  | { type: LessonContentType.Paragraph; value: string }
  | { type: LessonContentType.Banner; value: string }
  | {
      type: LessonContentType.Quote;
      value: Omit<LessonQuoteValue, 'text'> & { text: string };
    }
  | { type: LessonContentType.List; value: string[] }
  | {
      type: LessonContentType.Video;
      value: Omit<LessonVideoValue, 'title' | 'caption'> & {
        title?: string;
        caption?: string;
      };
    }
  | {
      type: LessonContentType.Audio;
      value: Omit<LessonAudioValue, 'title' | 'caption'> & {
        title?: string;
        caption?: string;
      };
    };

export type LessonDoc = {
  /**
   * Read from the parent path (`courses/{courseId}/lessons/{id}`), never from
   * a stored field — lessons are a subcollection of their course.
   */
  courseId: string;
  order: number;
  title: LocalizedText;
  shortDescription: LocalizedText;
  /** Derived from the key set of `title` on write. */
  availableLanguages: ContentLocale[];
  /** snake_case, matching the news schema. */
  author_id: string;
  imageUrl: string;
  /** The free-form label, not the course category id — so it is prose. */
  category: LocalizedText;
  tags: LocalizedList;
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

  const title = buildLocalized(readLocalized(raw.title));
  const caption = buildLocalized(readLocalized(raw.caption));
  const explicitThumb =
    typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : '';
  // Hosted videos have no poster fallback in the app; youtube does.
  const thumbnailUrl =
    explicitThumb || (videoType === 'youtube' ? youtubeThumbnailUrl(url) : '');

  return {
    videoType,
    url,
    ...(localesOf(title).length ? { title } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(localesOf(caption).length ? { caption } : {}),
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

  const title = buildLocalized(readLocalized(raw.title));
  const caption = buildLocalized(readLocalized(raw.caption));
  const thumbnailUrl =
    typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : '';
  const audioId = typeof raw.audioId === 'string' ? raw.audioId.trim() : '';

  return {
    url: rawUrl,
    ...(localesOf(title).length ? { title } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(localesOf(caption).length ? { caption } : {}),
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
        out.push({
          type: LessonContentType.List,
          value: buildLocalizedList(readLocalizedList(value)),
        });
        break;
      case LessonContentType.Quote: {
        const text = buildLocalized(
          readLocalized(isRecord(value) ? value.text : undefined),
        );
        // `ref` and the verse coordinates stay flat: a translation that could
        // move them would send a tapped verse to the wrong chapter.
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
          value: buildLocalized(readLocalized(value)),
        });
        break;
      default:
        out.push({
          type: LessonContentType.Paragraph,
          value: buildLocalized(readLocalized(value)),
        });
    }
  }
  return out;
}

/**
 * One language's view of a body: the shared array with every localized field
 * resolved through `selected → defaultLanguage → en`.
 *
 * Everything that consumes a body — the reading-time estimator, the publish
 * validator, and the app's renderer — works on this shape, so none of them has
 * to know that a block's text is a map. Projecting is the *only* place the
 * fallback chain runs for a body.
 */
export function projectContent(
  content: LessonContentItem[],
  opts: { selected?: ContentLocale; defaultLanguage?: ContentLocale } = {},
): FlatContentItem[] {
  const text = (value: LocalizedText) => resolveLocalized(value, opts).value;
  const optional = (value?: LocalizedText) => {
    const resolved = value ? text(value) : '';
    return resolved ? { value: resolved } : {};
  };

  return content.map((block): FlatContentItem => {
    switch (block.type) {
      case LessonContentType.List:
        return { type: block.type, value: resolveLocalizedList(block.value, opts) };
      case LessonContentType.Quote:
        return {
          type: block.type,
          value: { ...block.value, text: text(block.value.text) },
        };
      case LessonContentType.Video:
      case LessonContentType.Audio: {
        const title = optional(block.value.title);
        const caption = optional(block.value.caption);
        return {
          type: block.type,
          value: {
            ...block.value,
            ...('value' in title ? { title: title.value } : { title: undefined }),
            ...('value' in caption ? { caption: caption.value } : { caption: undefined }),
          },
        } as FlatContentItem;
      }
      case LessonContentType.Banner:
        return { type: block.type, value: block.value };
      default:
        return { type: block.type, value: text(block.value) };
    }
  });
}

/** Languages any part of a body has text for — what the editor tabs read. */
export function contentLanguages(content: LessonContentItem[]): ContentLocale[] {
  const seen = new Set<ContentLocale>();
  const add = (value: LocalizedText | LocalizedList | undefined) => {
    if (value) for (const l of localesOf(value)) seen.add(l);
  };
  for (const block of content) {
    switch (block.type) {
      case LessonContentType.Banner:
        break;
      case LessonContentType.Quote:
        add(block.value.text);
        break;
      case LessonContentType.Video:
      case LessonContentType.Audio:
        add(block.value.title);
        add(block.value.caption);
        break;
      default:
        add(block.value);
    }
  }
  return [...seen];
}

/** Rejects content the app would throw on or render as nothing. */
export function validateLessonContent(content: FlatContentItem[]): string[] {
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
  const title = readLocalized(data.title);
  return {
    id,
    courseId,
    order: typeof data.order === 'number' ? data.order : 0,
    title,
    shortDescription: readLocalized(data.shortDescription),
    availableLanguages: localesOf(title),
    author_id: typeof data.author_id === 'string' ? data.author_id : '',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    category: readLocalized(data.category),
    tags: readLocalizedList(data.tags),
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
    // Dashboard chrome: one string, in whatever language the lesson leads with.
    title: resolveLocalized(l.title).value,
    courseId: l.courseId,
    order: l.order,
    status: l.status,
    hasQuiz: l.hasQuiz,
  }));
}

export type LessonWriteInput = {
  courseId: string;
  order: number;
  /** Per-language title; a language with no title is not carried. */
  title: LocalizedText;
  shortDescription: LocalizedText;
  category: LocalizedText;
  tags: LocalizedList;
  /**
   * The owning course's primary language. A lesson carries no
   * `defaultLanguage` of its own — it mirrors the course's, so the two can
   * never disagree about which language is primary.
   */
  defaultLanguage: ContentLocale;
  /** The shared block array; each block's text is a map. */
  content: LessonContentItem[];
  author_id: string;
  imageUrl: string;
  estimatedMinutes: number;
};

function validate(data: LessonWriteInput) {
  if (!data.courseId.trim()) throw new Error('A course is required');
  if (!Number.isFinite(data.order)) throw new Error('Lesson order is required');

  const title = buildLocalized(data.title);
  const languages = localesOf(title);
  if (languages.length === 0) throw new Error('Lesson title is required');

  const content = normalizeLessonContent(data.content);
  if (content.length === 0) {
    throw new Error('A lesson needs at least one content block');
  }

  // Checked once per language the lesson claims: a block that reads fine in
  // English and is blank in Amharic is a hole for Amharic readers only.
  for (const locale of languages) {
    const issues = validateLessonContent(
      projectContent(content, {
        selected: locale,
        defaultLanguage: data.defaultLanguage,
      }),
    );
    if (issues.length) throw new Error(issues.join('\n'));
  }
}

/** `courseId` is deliberately absent: the parent path is the course link. */
function buildWrite(data: LessonWriteInput) {
  const title = buildLocalized(data.title);
  const languages = localesOf(title);
  // No field outruns `title`: text in a language the lesson does not carry
  // would never be reachable.
  const keep = (value: LocalizedText) => {
    const out: LocalizedText = {};
    for (const l of languages) if (value[l]) out[l] = value[l];
    return out;
  };

  return {
    order: Math.trunc(data.order),
    title,
    shortDescription: keep(buildLocalized(data.shortDescription)),
    category: keep(buildLocalized(data.category)),
    tags: buildLocalizedList(data.tags),
    availableLanguages: languages,
    content: normalizeLessonContent(data.content),
    author_id: data.author_id.trim(),
    imageUrl: data.imageUrl.trim(),
    estimatedMinutes: Math.max(0, Math.trunc(data.estimatedMinutes || 0)),
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
