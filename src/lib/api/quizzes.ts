import { db } from '@/lib/firebase/config';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

export enum AgeGroup {
  Children = 'children',
  Youth = 'youth',
  Adults = 'adults',
  All = 'all',
}

export enum DifficultyLevel {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
  Any = 'any',
}

export enum QuizKind {
  Standard = 'standard',
  Daily = 'daily',
  Study = 'study',
  Lesson = 'lesson',
  Course = 'course',
}

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  [AgeGroup.Children]: 'Children',
  [AgeGroup.Youth]: 'Youth',
  [AgeGroup.Adults]: 'Adults',
  [AgeGroup.All]: 'All',
};

export const DIFFICULTY_LEVEL_LABELS: Record<DifficultyLevel, string> = {
  [DifficultyLevel.Easy]: 'Easy',
  [DifficultyLevel.Medium]: 'Medium',
  [DifficultyLevel.Hard]: 'Hard',
  [DifficultyLevel.Any]: 'Any',
};

export const QUIZ_KIND_LABELS: Record<QuizKind, string> = {
  [QuizKind.Standard]: 'Standard',
  [QuizKind.Daily]: 'Daily',
  [QuizKind.Study]: 'Study',
  [QuizKind.Lesson]: 'Lesson',
  [QuizKind.Course]: 'Course',
};

export type QuizDoc = {
  title: string;
  description: string;
  categoryId: string;
  ageGroup: AgeGroup;
  dificultyLevel: DifficultyLevel;
  createdAt: string;
  kind: QuizKind;
  isPublished: boolean;
  /** Daily quizzes only: whether the user must read the daily verse section first. */
  requiresVerseRead: boolean;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'quizzes');

export function formatDailyDateKey(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailyQuizId(d: Date): string {
  return `daily-${formatDailyDateKey(d)}`;
}

export function studyQuizId(studyId: string): string {
  return `study-${studyId}`;
}

/**
 * Quizzes all share one flat collection while lesson ids are only unique
 * within their course's subcollection, so the course id is part of the id.
 */
export function lessonQuizId(courseId: string, lessonId: string): string {
  return `lesson-${courseId}-${lessonId}`;
}

export function courseQuizId(courseId: string): string {
  return `course-${courseId}`;
}

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

function coerceAgeGroup(val: unknown): AgeGroup {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (s === AgeGroup.Children || s === AgeGroup.Youth || s === AgeGroup.Adults || s === AgeGroup.All) {
    return s as AgeGroup;
  }
  return AgeGroup.All;
}

function coerceDifficulty(val: unknown): DifficultyLevel {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (
    s === DifficultyLevel.Easy ||
    s === DifficultyLevel.Medium ||
    s === DifficultyLevel.Hard ||
    s === DifficultyLevel.Any
  ) {
    return s as DifficultyLevel;
  }
  return DifficultyLevel.Any;
}

function coerceKind(val: unknown): QuizKind {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (s === QuizKind.Daily) return QuizKind.Daily;
  if (s === QuizKind.Study) return QuizKind.Study;
  if (s === QuizKind.Lesson) return QuizKind.Lesson;
  if (s === QuizKind.Course) return QuizKind.Course;
  return QuizKind.Standard;
}

function mapDoc(id: string, data: Record<string, unknown>): WithId<QuizDoc> {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : '',
    ageGroup: coerceAgeGroup(data.ageGroup),
    dificultyLevel: coerceDifficulty(data.dificultyLevel),
    createdAt: normalizeTimestamp(data.createdAt) ?? new Date().toISOString(),
    kind: coerceKind(data.kind),
    isPublished: data.isPublished === true,
    // Matches the app: absent means required.
    requiresVerseRead: data.requiresVerseRead !== false,
  };
}

export async function listQuizzes(): Promise<WithId<QuizDoc>[]> {
  console.log('[quizzesApi] listQuizzes: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.error('[quizzesApi] listQuizzes error', err);
    throw new Error('Failed to list quizzes');
  }
}

type WritePayload = {
  title: string;
  description: string;
  categoryId: string;
  ageGroup: AgeGroup;
  dificultyLevel: DifficultyLevel;
  kind: QuizKind;
  createdAt: Date | string;
  requiresVerseRead: boolean;
};

function sanitizeWrite(data: WritePayload) {
  const created =
    data.createdAt instanceof Date
      ? data.createdAt
      : new Date(data.createdAt);
  const trimmedCategory =
    typeof data.categoryId === 'string' ? data.categoryId.trim() : '';
  const title = data.title.trim();
  return {
    title,
    // Browse search does a prefix range on this field.
    lowerCaseTitle: title.toLowerCase(),
    description: data.description.trim(),
    categoryId: trimmedCategory,
    ageGroup: data.ageGroup,
    dificultyLevel: data.dificultyLevel,
    kind: data.kind,
    createdAt: Timestamp.fromDate(isNaN(created.getTime()) ? new Date() : created),
    isPublished: false,
    // The daily verse gate only applies to daily quizzes.
    requiresVerseRead: data.kind === QuizKind.Daily ? data.requiresVerseRead : false,
  };
}

function validateCreate(data: WritePayload) {
  if (!data.title.trim()) throw new Error('Quiz title is required');
  if (!data.description.trim()) throw new Error('Quiz description is required');
  if (data.kind === QuizKind.Standard) {
    if (!data.categoryId.trim()) throw new Error('Quiz category is required');
  }
}

export type CreateStandardQuizInput = Omit<
  WritePayload,
  'kind' | 'createdAt' | 'categoryId' | 'requiresVerseRead'
> & {
  categoryId: string;
  createdAt?: Date;
};

export async function addStandardQuiz(input: CreateStandardQuizInput): Promise<string> {
  const payload: WritePayload = {
    ...input,
    kind: QuizKind.Standard,
    createdAt: input.createdAt ?? new Date(),
    requiresVerseRead: false,
  };
  validateCreate(payload);
  try {
    const docRef = await addDoc(colRef, sanitizeWrite(payload));
    console.log('[quizzesApi] created standard id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[quizzesApi] addStandardQuiz error', err);
    throw new Error('Failed to add quiz');
  }
}

export type CreateDailyQuizInput = Omit<
  WritePayload,
  'kind' | 'createdAt' | 'categoryId' | 'requiresVerseRead'
> & {
  date: Date;
  /** Defaults to true: the daily verse section must be read before taking the quiz. */
  requiresVerseRead?: boolean;
};

export async function addDailyQuiz(input: CreateDailyQuizInput): Promise<string> {
  const id = dailyQuizId(input.date);
  const payload: WritePayload = {
    title: input.title,
    description: input.description,
    categoryId: '',
    ageGroup: input.ageGroup,
    dificultyLevel: input.dificultyLevel,
    kind: QuizKind.Daily,
    createdAt: input.date,
    requiresVerseRead: input.requiresVerseRead !== false,
  };
  validateCreate(payload);
  try {
    const ref = doc(colRef, id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      throw new Error(`A daily quiz already exists for ${formatDailyDateKey(input.date)}`);
    }
    await setDoc(ref, sanitizeWrite(payload));
    console.log('[quizzesApi] created daily id', id);
    return id;
  } catch (err) {
    console.error('[quizzesApi] addDailyQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add daily quiz');
  }
}

export type CreateStudyQuizInput = Omit<
  WritePayload,
  'kind' | 'createdAt' | 'categoryId' | 'requiresVerseRead'
> & {
  studyId: string;
};

export async function addStudyQuiz(input: CreateStudyQuizInput): Promise<string> {
  const studyId = typeof input.studyId === 'string' ? input.studyId.trim() : '';
  if (!studyId) throw new Error('A bible study is required');
  const id = studyQuizId(studyId);
  const payload: WritePayload = {
    title: input.title,
    description: input.description,
    categoryId: '',
    ageGroup: input.ageGroup,
    dificultyLevel: input.dificultyLevel,
    kind: QuizKind.Study,
    createdAt: new Date(),
    requiresVerseRead: false,
  };
  validateCreate(payload);
  try {
    const ref = doc(colRef, id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      throw new Error('A study quiz already exists for this bible study');
    }
    await setDoc(ref, sanitizeWrite(payload));
    console.log('[quizzesApi] created study id', id);
    return id;
  } catch (err) {
    console.error('[quizzesApi] addStudyQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add study quiz');
  }
}

export type CreateLessonQuizInput = Omit<
  WritePayload,
  'kind' | 'createdAt' | 'categoryId' | 'requiresVerseRead'
> & {
  lessonId: string;
  /** The lesson's parent course — half of the derived quiz id. */
  courseId: string;
};

export async function addLessonQuiz(input: CreateLessonQuizInput): Promise<string> {
  const lessonId = typeof input.lessonId === 'string' ? input.lessonId.trim() : '';
  if (!lessonId) throw new Error('A lesson is required');
  const courseId = typeof input.courseId === 'string' ? input.courseId.trim() : '';
  if (!courseId) throw new Error('The lesson has no course');
  const id = lessonQuizId(courseId, lessonId);
  const payload: WritePayload = {
    title: input.title,
    description: input.description,
    categoryId: '',
    ageGroup: input.ageGroup,
    dificultyLevel: input.dificultyLevel,
    kind: QuizKind.Lesson,
    createdAt: new Date(),
    requiresVerseRead: false,
  };
  validateCreate(payload);
  try {
    const ref = doc(colRef, id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      throw new Error('A quiz already exists for this lesson');
    }
    // `hasQuiz` is flipped at publish time, not here: the card is only safe to
    // show once meta/stat exists, and that document is seeded by publishQuiz.
    await setDoc(ref, sanitizeWrite(payload));
    console.log('[quizzesApi] created lesson quiz id', id);
    return id;
  } catch (err) {
    console.error('[quizzesApi] addLessonQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add lesson quiz');
  }
}

export type CreateCourseQuizInput = Omit<
  WritePayload,
  'kind' | 'createdAt' | 'categoryId' | 'requiresVerseRead'
> & {
  courseId: string;
};

export async function addCourseQuiz(input: CreateCourseQuizInput): Promise<string> {
  const courseId = typeof input.courseId === 'string' ? input.courseId.trim() : '';
  if (!courseId) throw new Error('A course is required');
  const id = courseQuizId(courseId);
  const payload: WritePayload = {
    title: input.title,
    description: input.description,
    categoryId: '',
    ageGroup: input.ageGroup,
    dificultyLevel: input.dificultyLevel,
    kind: QuizKind.Course,
    createdAt: new Date(),
    requiresVerseRead: false,
  };
  validateCreate(payload);
  try {
    const ref = doc(colRef, id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      throw new Error('A final quiz already exists for this course');
    }
    // hasFinalQuiz is flipped at publish time — see addLessonQuiz.
    await setDoc(ref, sanitizeWrite(payload));
    console.log('[quizzesApi] created course quiz id', id);
    return id;
  } catch (err) {
    console.error('[quizzesApi] addCourseQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add course quiz');
  }
}

export type UpdateQuizInput = {
  title: string;
  description: string;
  categoryId: string;
  ageGroup: AgeGroup;
  dificultyLevel: DifficultyLevel;
  kind: QuizKind;
  /** Only honoured for daily quizzes; other kinds are always stored as false. */
  requiresVerseRead?: boolean;
};

export async function updateQuiz(id: string, data: UpdateQuizInput): Promise<void> {
  console.log('[quizzesApi] updateQuiz id', id, 'data', data);
  try {
    if (!data.title.trim()) throw new Error('Quiz title cannot be empty');
    if (!data.description.trim()) throw new Error('Quiz description cannot be empty');
    const trimmedCategory = data.categoryId.trim();
    if (data.kind === QuizKind.Standard && !trimmedCategory) {
      throw new Error('Quiz category cannot be empty');
    }
    await updateDoc(doc(colRef, id), {
      title: data.title.trim(),
      lowerCaseTitle: data.title.trim().toLowerCase(),
      description: data.description.trim(),
      categoryId: data.kind === QuizKind.Standard ? trimmedCategory : '',
      ageGroup: data.ageGroup,
      dificultyLevel: data.dificultyLevel,
      requiresVerseRead:
        data.kind === QuizKind.Daily ? data.requiresVerseRead !== false : false,
    });
  } catch (err) {
    console.error('[quizzesApi] updateQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update quiz');
  }
}

export async function publishQuiz(id: string): Promise<void> {
  console.log('[quizzesApi] publishQuiz id', id);
  try {
    const quizRef = doc(colRef, id);
    const statRef = doc(db, 'quizzes', id, 'meta', 'stat');
    const [questionsSnap, statSnap] = await Promise.all([
      getCountFromServer(collection(db, 'quizzes', id, 'questions')),
      getDoc(statRef),
    ]);

    const questionCount = questionsSnap.data().count;
    if (questionCount <= 0) {
      throw new Error('Add at least one question before publishing');
    }

    const batch = writeBatch(db);
    batch.update(quizRef, { isPublished: true });
    if (!statSnap.exists()) {
      // Seeded here and only here; the trial figures are then owned by the
      // Cloud Function that watches quiz_attempts.
      batch.set(statRef, {
        quizId: id,
        numberOfQuestions: questionCount,
        averageScore: 0,
        totalNumberOfTrials: 0,
        updatedAt: serverTimestamp(),
        lastTrialAt: null,
      });
    }
    // Announce the quiz to its lesson/course only now that meta/stat exists,
    // otherwise the card renders NaN / 0 questions.
    if (id.startsWith('lesson-')) {
      batch.update(doc(db, 'lessons', id.slice('lesson-'.length)), {
        hasQuiz: true,
      });
    } else if (id.startsWith('course-')) {
      batch.update(doc(db, 'courses', id.slice('course-'.length)), {
        hasFinalQuiz: true,
      });
    }
    await batch.commit();
  } catch (err) {
    console.error('[quizzesApi] publishQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to publish quiz');
  }
}

const BATCH_LIMIT = 500;

/**
 * Lesson and course quizzes are announced by a flag on their owner document.
 * Leaving it set after a delete makes the app show a card for a quiz that is
 * no longer there. Best-effort: the owner may already be gone.
 */
async function clearOwnerQuizFlag(quizId: string): Promise<void> {
  try {
    if (quizId.startsWith('lesson-')) {
      const lessonId = quizId.slice('lesson-'.length);
      await updateDoc(doc(db, 'lessons', lessonId), { hasQuiz: false });
    } else if (quizId.startsWith('course-')) {
      const courseId = quizId.slice('course-'.length);
      await updateDoc(doc(db, 'courses', courseId), { hasFinalQuiz: false });
    }
  } catch (err) {
    console.warn('[quizzesApi] clearOwnerQuizFlag skipped', quizId, err);
  }
}

/**
 * Deletes the quiz along with its `questions` and `meta` subcollections.
 * Firestore does not cascade, and quiz ids are derived (`daily-`, `study-`,
 * `lesson-`, `course-`), so orphaned questions would be adopted by the next
 * quiz created at the same id.
 */
export async function deleteQuiz(id: string): Promise<void> {
  console.log('[quizzesApi] deleteQuiz id', id);
  try {
    const [questionsSnap, metaSnap] = await Promise.all([
      getDocs(collection(db, 'quizzes', id, 'questions')),
      getDocs(collection(db, 'quizzes', id, 'meta')),
    ]);

    const refs = [
      ...questionsSnap.docs.map((d) => d.ref),
      ...metaSnap.docs.map((d) => d.ref),
      doc(colRef, id),
    ];

    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
      await batch.commit();
    }

    await clearOwnerQuizFlag(id);
  } catch (err) {
    console.error('[quizzesApi] deleteQuiz error', err);
    throw new Error('Failed to delete quiz');
  }
}
