import { db } from '@/lib/firebase/config';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { deleteQuiz, lessonQuizId } from '@/lib/api/quizzes';
import { BASE_CONTENT_LOCALE, CONTENT_LOCALE_LABELS } from '@/lib/i18n/contentLocales';
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import {
  buildLocalized,
  displayText,
  localesOf,
  lowerCaseOf,
  readLocalized,
} from '@/lib/i18n/localizedText';
import type { LocalizedText } from '@/lib/i18n/localizedText';

export enum CourseAgeGroup {
  Children = 'children',
  Youth = 'youth',
  Adults = 'adults',
  All = 'all',
}

export enum CourseLevel {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

/**
 * Courses and lessons publish with a `status` string; quizzes use an
 * `isPublished` boolean. The two conventions live side by side.
 */
export type PublishStatus = 'draft' | 'published';

export const COURSE_AGE_GROUP_LABELS: Record<CourseAgeGroup, string> = {
  [CourseAgeGroup.Children]: 'Children',
  [CourseAgeGroup.Youth]: 'Youth',
  [CourseAgeGroup.Adults]: 'Adults',
  [CourseAgeGroup.All]: 'All',
};

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  [CourseLevel.Beginner]: 'Beginner',
  [CourseLevel.Intermediate]: 'Intermediate',
  [CourseLevel.Advanced]: 'Advanced',
};

export type CourseDoc = {
  /** Every language the course is written in — `{ en: "…", am: "…" }`. */
  title: LocalizedText;
  /** Derived from {@link title} on write; the per-language search key. */
  lowerCaseTitle: LocalizedText;
  description: LocalizedText;
  /**
   * Derived from the key set of {@link title} on write. The catalog filters on
   * it with `array-contains` and never opens the maps, so it is never
   * authored — a language listed here with no title is a course that is listed
   * and then renders blank.
   */
  availableLanguages: ContentLocale[];
  /** The language a member falls back to. Always a key of {@link title}. */
  defaultLanguage: ContentLocale;
  coverImageUrl: string;
  categoryId: string;
  ageGroup: CourseAgeGroup;
  level: CourseLevel;
  lessonCount: number;
  /** Default true: lesson n stays locked until n-1 is complete. */
  sequential: boolean;
  hasFinalQuiz: boolean;
  /**
   * Course ids to take first, in the order they are shown. Advisory only —
   * the app surfaces the requirement but does not bar entry.
   */
  prerequisiteCourseIds: string[];
  status: PublishStatus;
  /**
   * Required. The catalog sorts newest-first on this field and pages with a
   * keyset cursor over `(createdAt, __name__)`. A course without it is parsed
   * as "now" by the client and pins itself to the top.
   */
  createdAt: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'courses');

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

function coerceAgeGroup(val: unknown): CourseAgeGroup {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (
    s === CourseAgeGroup.Children ||
    s === CourseAgeGroup.Youth ||
    s === CourseAgeGroup.Adults ||
    s === CourseAgeGroup.All
  ) {
    return s as CourseAgeGroup;
  }
  return CourseAgeGroup.All;
}

function coerceLevel(val: unknown): CourseLevel {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (
    s === CourseLevel.Beginner ||
    s === CourseLevel.Intermediate ||
    s === CourseLevel.Advanced
  ) {
    return s as CourseLevel;
  }
  return CourseLevel.Beginner;
}

function coerceStatus(val: unknown): PublishStatus {
  // The app treats anything but exactly "published" as a draft.
  return typeof val === 'string' && val.toLowerCase() === 'published'
    ? 'published'
    : 'draft';
}

/** Mirrors the client parser: non-strings and empty strings are dropped. */
function coercePrerequisites(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function coerceDefaultLanguage(
  val: unknown,
  title: LocalizedText,
): ContentLocale {
  const present = localesOf(title);
  if (typeof val === 'string' && present.includes(val as ContentLocale)) {
    return val as ContentLocale;
  }
  // Must be a language the course actually has, or the fallback chain starts
  // on a language with no text.
  return present.includes(BASE_CONTENT_LOCALE)
    ? BASE_CONTENT_LOCALE
    : (present[0] ?? BASE_CONTENT_LOCALE);
}

function mapDoc(id: string, data: Record<string, unknown>): WithId<CourseDoc> {
  const title = readLocalized(data.title);
  return {
    id,
    title,
    lowerCaseTitle: readLocalized(data.lowerCaseTitle),
    description: readLocalized(data.description),
    // Derived on write, so it is read back as stored — the publish gate is
    // what catches a document a seeder wrote by hand.
    availableLanguages: localesOf(title),
    defaultLanguage: coerceDefaultLanguage(data.defaultLanguage, title),
    coverImageUrl:
      typeof data.coverImageUrl === 'string' ? data.coverImageUrl : '',
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : '',
    ageGroup: coerceAgeGroup(data.ageGroup),
    level: coerceLevel(data.level),
    lessonCount: typeof data.lessonCount === 'number' ? data.lessonCount : 0,
    sequential: data.sequential !== false,
    hasFinalQuiz: data.hasFinalQuiz === true,
    prerequisiteCourseIds: coercePrerequisites(data.prerequisiteCourseIds),
    status: coerceStatus(data.status),
    createdAt: normalizeTimestamp(data.createdAt) ?? new Date().toISOString(),
  };
}

export async function listCourses(): Promise<WithId<CourseDoc>[]> {
  console.log('[coursesApi] listCourses: querying...');
  try {
    const snap = await getDocs(query(colRef));
    return snap.docs
      .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
      // Same ordering the catalog uses: newest first, id descending to break
      // ties, matching the client's (createdAt, __name__) keyset cursor.
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? b.id.localeCompare(a.id)
          : b.createdAt.localeCompare(a.createdAt),
      );
  } catch (err) {
    console.error('[coursesApi] listCourses error', err);
    throw new Error('Failed to list courses');
  }
}

/** Minimal read-only view used by the course quiz picker. */
export type CourseOption = {
  id: string;
  title: string;
  status: string;
  hasFinalQuiz: boolean;
};

export async function listCourseOptions(): Promise<CourseOption[]> {
  try {
    const snap = await getDocs(query(colRef));
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          // Pickers and validation messages are dashboard chrome, which stays
          // English-first: one string, in the course's own primary language.
          title: displayText(
            readLocalized(data.title),
            data.defaultLanguage as ContentLocale | undefined,
          ),
          status: typeof data.status === 'string' ? data.status : '',
          hasFinalQuiz: data.hasFinalQuiz === true,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.error('[coursesApi] listCourseOptions error', err);
    return [];
  }
}

/** Everything the prerequisite picker and its validation need. */
export type PrerequisiteCandidate = {
  id: string;
  title: string;
  status: PublishStatus;
  prerequisiteCourseIds: string[];
};

export async function listPrerequisiteCandidates(): Promise<
  PrerequisiteCandidate[]
> {
  try {
    const snap = await getDocs(query(colRef));
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          title: displayText(
            readLocalized(data.title),
            data.defaultLanguage as ContentLocale | undefined,
          ),
          status: coerceStatus(data.status),
          prerequisiteCourseIds: coercePrerequisites(data.prerequisiteCourseIds),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.error('[coursesApi] listPrerequisiteCandidates error', err);
    return [];
  }
}

/**
 * The client does none of this: it drops unresolvable ids and renders nothing,
 * and never walks the graph. So a bad id is a silently missing hint and a cycle
 * is nonsense to a reader — both are caught here, at authoring time.
 *
 * `courseId` is null when adding, in which case nothing can point at the course
 * yet and only the self/unknown/unpublished checks can fire.
 */
export function validatePrerequisites(
  courseId: string | null,
  ids: string[],
  catalog: PrerequisiteCandidate[],
): string[] {
  const issues: string[] = [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const label = (id: string) => byId.get(id)?.title || id;

  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(`"${label(id)}" is listed twice`);
      continue;
    }
    seen.add(id);

    if (courseId && id === courseId) {
      issues.push('A course cannot require itself');
      continue;
    }
    const target = byId.get(id);
    if (!target) {
      issues.push(`Prerequisite "${id}" is not an existing course`);
    } else if (target.status !== 'published') {
      issues.push(`Prerequisite "${target.title || id}" is not published`);
    }
  }

  if (courseId) {
    // Walk out from the pending list — which stands in for whatever this course
    // currently stores — and see whether it leads back to the course itself.
    const visited = new Set<string>();
    const stack = [...seen].filter((id) => id !== courseId);
    while (stack.length) {
      const next = stack.pop()!;
      if (next === courseId) {
        issues.push(
          'These prerequisites form a cycle — the course would require itself indirectly',
        );
        break;
      }
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push(...(byId.get(next)?.prerequisiteCourseIds ?? []));
    }
  }

  return issues;
}

export type CourseWriteInput = {
  /**
   * Authored text, one entry per language. A language whose title is blank is
   * dropped rather than written as an empty placeholder — the app would list
   * the course and then render a blank card.
   */
  title: LocalizedText;
  description: LocalizedText;
  /** Preferred fallback language; ignored when it has no title. */
  defaultLanguage: ContentLocale;
  coverImageUrl: string;
  categoryId: string;
  ageGroup: CourseAgeGroup;
  level: CourseLevel;
  sequential: boolean;
  prerequisiteCourseIds: string[];
};

/**
 * `lowerCaseTitle` and `availableLanguages` are *derived from* `title` here and
 * nowhere else, which is what makes it impossible for them to disagree with it.
 */
export function buildCourseLocalization(
  input: Pick<CourseWriteInput, 'title' | 'description' | 'defaultLanguage'>,
): {
  title: LocalizedText;
  lowerCaseTitle: LocalizedText;
  description: LocalizedText;
  availableLanguages: ContentLocale[];
  defaultLanguage: ContentLocale;
} {
  const title = buildLocalized(input.title);
  const availableLanguages = localesOf(title);
  if (availableLanguages.length === 0) {
    throw new Error('Course title is required');
  }

  return {
    title,
    lowerCaseTitle: lowerCaseOf(title),
    // A description in a language with no title would never be reachable.
    description: pickLanguages(buildLocalized(input.description), availableLanguages),
    availableLanguages,
    defaultLanguage: availableLanguages.includes(input.defaultLanguage)
      ? input.defaultLanguage
      : (availableLanguages.includes(BASE_CONTENT_LOCALE)
          ? BASE_CONTENT_LOCALE
          : availableLanguages[0]),
  };
}

/** Drops languages the document does not carry, so no field outruns `title`. */
function pickLanguages(
  value: LocalizedText,
  languages: ContentLocale[],
): LocalizedText {
  const out: LocalizedText = {};
  for (const locale of languages) {
    if (value[locale]) out[locale] = value[locale];
  }
  return out;
}

function validate(data: CourseWriteInput) {
  if (localesOf(buildLocalized(data.title)).length === 0) {
    throw new Error('Course title is required');
  }
}

async function assertPrerequisites(id: string | null, data: CourseWriteInput) {
  if (data.prerequisiteCourseIds.length === 0) return;
  const issues = validatePrerequisites(
    id,
    data.prerequisiteCourseIds,
    await listPrerequisiteCandidates(),
  );
  if (issues.length) throw new Error(issues.join('\n'));
}

function buildWrite(data: CourseWriteInput) {
  return {
    ...buildCourseLocalization(data),
    coverImageUrl: data.coverImageUrl.trim(),
    categoryId: data.categoryId.trim(),
    ageGroup: data.ageGroup,
    level: data.level,
    sequential: data.sequential,
    prerequisiteCourseIds: coercePrerequisites(data.prerequisiteCourseIds),
  };
}

export async function addCourse(data: CourseWriteInput): Promise<string> {
  validate(data);
  await assertPrerequisites(null, data);
  try {
    const ref = await addDoc(colRef, {
      ...buildWrite(data),
      lessonCount: 0,
      hasFinalQuiz: false,
      // Published last, once its lessons exist.
      status: 'draft',
      // Required: the catalog's sort key and pagination cursor.
      createdAt: Timestamp.now(),
    });
    console.log('[coursesApi] created id', ref.id);
    return ref.id;
  } catch (err) {
    console.error('[coursesApi] addCourse error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add course');
  }
}

/**
 * Never writes `createdAt`. Members page the catalog with a keyset cursor over
 * it, so re-stamping a live course can make a card be skipped or repeated
 * mid-scroll.
 */
export async function updateCourse(
  id: string,
  data: CourseWriteInput,
): Promise<void> {
  validate(data);
  await assertPrerequisites(id, data);
  try {
    await updateDoc(doc(colRef, id), buildWrite(data));
  } catch (err) {
    console.error('[coursesApi] updateCourse error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update course');
  }
}

/** Recounts published lessons and stores it on the course card. */
export async function syncLessonCount(courseId: string): Promise<number> {
  try {
    const snap = await getDocs(
      collection(db, 'courses', courseId, 'lessons'),
    );
    const count = snap.docs.filter(
      (d) => coerceStatus((d.data() as Record<string, unknown>).status) === 'published',
    ).length;
    await updateDoc(doc(colRef, courseId), { lessonCount: count });
    return count;
  } catch (err) {
    console.error('[coursesApi] syncLessonCount error', err);
    return 0;
  }
}

export type CoursePublishIssue = string;

/**
 * Publish-time validation. The app drops or mis-renders a course silently, so
 * these are checked here rather than discovered by a member.
 */
export async function validateCoursePublish(
  courseId: string,
): Promise<CoursePublishIssue[]> {
  const issues: CoursePublishIssue[] = [];
  const courseSnap = await getDoc(doc(colRef, courseId));
  if (!courseSnap.exists()) return ['Course not found'];
  const course = mapDoc(courseSnap.id, courseSnap.data() as Record<string, unknown>);

  const lessonSnap = await getDocs(
    collection(db, 'courses', courseId, 'lessons'),
  );
  const lessons = lessonSnap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, unknown>,
  }));

  if (lessons.length === 0) issues.push('The course has no lessons');

  if (course.prerequisiteCourseIds.length) {
    // A prerequisite that got unpublished since authoring renders as nothing.
    issues.push(
      ...validatePrerequisites(
        courseId,
        course.prerequisiteCourseIds,
        await listPrerequisiteCandidates(),
      ),
    );
  }

  const published = lessons.filter(
    (l) => coerceStatus(l.data.status) === 'published',
  );
  if (published.length === 0 && lessons.length > 0) {
    issues.push('No lesson is published yet — publish the lessons first');
  }

  issues.push(...validateCourseLanguages(course));

  const seenOrders = new Set<number>();
  for (const l of published) {
    const title = displayText(readLocalized(l.data.title), course.defaultLanguage) || l.id;
    const order = typeof l.data.order === 'number' ? l.data.order : NaN;
    if (!Number.isFinite(order)) {
      issues.push(`Lesson "${title}" has no order`);
    } else if (seenOrders.has(order)) {
      issues.push(`Lesson "${title}" repeats order ${order}`);
    } else {
      seenOrders.add(order);
    }
    const content = Array.isArray(l.data.content) ? l.data.content : [];
    if (content.length === 0) issues.push(`Lesson "${title}" has no content`);
    issues.push(...validateLessonLanguages(course, title, l.data));
    if (l.data.hasQuiz === true) {
      issues.push(
        ...(await validateQuizTree(
          `lesson-${courseId}-${l.id}`,
          `Lesson "${title}" quiz`,
        )),
      );
    }
  }

  if (course.hasFinalQuiz) {
    issues.push(...(await validateQuizTree(`course-${courseId}`, 'Final quiz')));
  }

  return issues;
}

/**
 * `availableLanguages` is derived from `title` on every write here, so this
 * only ever fires on a document a seeder or a hand edit produced. It stays
 * because the catalog filter trusts that array and never opens `title`: a
 * language listed there with no title is a course that is listed and then
 * renders blank.
 */
function validateCourseLanguages(course: CourseDoc): CoursePublishIssue[] {
  const issues: CoursePublishIssue[] = [];
  const titled = localesOf(course.title);

  if (titled.length === 0) {
    issues.push('The course has no title in any language');
    return issues;
  }
  for (const l of course.availableLanguages) {
    if (!titled.includes(l)) {
      issues.push(
        `availableLanguages lists ${CONTENT_LOCALE_LABELS[l]} but there is no title for it`,
      );
    }
  }
  for (const l of titled) {
    if (!course.availableLanguages.includes(l)) {
      issues.push(
        `${CONTENT_LOCALE_LABELS[l]} has a title but is missing from availableLanguages — the catalog filter will hide it`,
      );
    }
  }
  if (!titled.includes(course.defaultLanguage)) {
    issues.push(
      `defaultLanguage is ${CONTENT_LOCALE_LABELS[course.defaultLanguage]}, which the course has no title for`,
    );
  }
  return issues;
}

/**
 * Every language the *course* offers must reach the end of it. A lesson with
 * no Amharic title is a member browsing in Amharic who hits English halfway
 * through — legal for the renderer, but an authoring mistake.
 */
function validateLessonLanguages(
  course: CourseDoc,
  lessonTitle: string,
  raw: Record<string, unknown>,
): CoursePublishIssue[] {
  const titled = localesOf(readLocalized(raw.title));
  return course.availableLanguages
    .filter((l) => !titled.includes(l))
    .map(
      (l) =>
        `Lesson "${lessonTitle}" has no ${CONTENT_LOCALE_LABELS[l]} title, but the course offers ${CONTENT_LOCALE_LABELS[l]}`,
    );
}

async function validateQuizTree(
  quizId: string,
  label: string,
): Promise<CoursePublishIssue[]> {
  const issues: CoursePublishIssue[] = [];
  const quizRef = doc(db, 'quizzes', quizId);
  const [quizSnap, questionsSnap, statSnap] = await Promise.all([
    getDoc(quizRef),
    getDocs(collection(db, 'quizzes', quizId, 'questions')),
    getDoc(doc(db, 'quizzes', quizId, 'meta', 'stat')),
  ]);

  if (!quizSnap.exists()) {
    issues.push(`${label} is missing (${quizId})`);
    return issues;
  }
  if (questionsSnap.empty) issues.push(`${label} has no questions`);
  if (!statSnap.exists()) {
    issues.push(`${label} has no meta/stat document — publish the quiz`);
  }

  for (const q of questionsSnap.docs) {
    const data = q.data() as Record<string, unknown>;
    const text = typeof data.text === 'string' ? data.text : q.id;
    if (data.questionType === 'short_answer') {
      issues.push(`${label}: "${text}" is short_answer, which the app rejects`);
    }
    const options = Array.isArray(data.options) ? data.options : [];
    const correct =
      typeof data.correctOptionId === 'number' ? data.correctOptionId : null;
    // true_false questions carry no options; the app supplies two labels.
    const optionCount =
      options.length > 0 ? options.length : data.questionType === 'true_false' ? 2 : 0;
    if (correct == null || correct < 0 || correct >= optionCount) {
      issues.push(`${label}: "${text}" has an out-of-range correct answer`);
    }
  }

  return issues;
}

export async function setCourseStatus(
  id: string,
  status: PublishStatus,
): Promise<void> {
  try {
    await updateDoc(doc(colRef, id), { status });
  } catch (err) {
    console.error('[coursesApi] setCourseStatus error', err);
    throw new Error('Failed to change course status');
  }
}

/** Publishes only after the §7.4 assertions pass. */
export async function publishCourse(id: string): Promise<void> {
  const issues = await validateCoursePublish(id);
  if (issues.length) throw new Error(issues.join('\n'));
  await syncLessonCount(id);
  await setCourseStatus(id, 'published');
}

/**
 * Deletes the course **and its lessons**, plus each lesson's quiz tree.
 *
 * Firestore does not cascade: deleting only the course document would leave
 * its `lessons` subcollection alive but unreachable from the dashboard's
 * course list — visible to a collection-group query, editable by nobody.
 */
export async function deleteCourse(id: string): Promise<void> {
  console.log('[coursesApi] deleteCourse id', id);
  try {
    const lessonSnap = await getDocs(collection(db, 'courses', id, 'lessons'));

    for (const lesson of lessonSnap.docs) {
      try {
        await deleteQuiz(lessonQuizId(id, lesson.id));
      } catch (err) {
        console.warn('[coursesApi] deleteCourse: quiz cleanup skipped', err);
      }
    }

    const batch = writeBatch(db);
    lessonSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(colRef, id));
    await batch.commit();
  } catch (err) {
    console.error('[coursesApi] deleteCourse error', err);
    throw new Error('Failed to delete course');
  }
}
