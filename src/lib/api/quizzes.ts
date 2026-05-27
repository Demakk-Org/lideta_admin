import { db } from '@/lib/firebase/config';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
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
};

function sanitizeWrite(data: WritePayload) {
  const created =
    data.createdAt instanceof Date
      ? data.createdAt
      : new Date(data.createdAt);
  const trimmedCategory =
    typeof data.categoryId === 'string' ? data.categoryId.trim() : '';
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    categoryId: trimmedCategory,
    ageGroup: data.ageGroup,
    dificultyLevel: data.dificultyLevel,
    kind: data.kind,
    createdAt: Timestamp.fromDate(isNaN(created.getTime()) ? new Date() : created),
    isPublished: false,
  };
}

function validateCreate(data: WritePayload) {
  if (!data.title.trim()) throw new Error('Quiz title is required');
  if (!data.description.trim()) throw new Error('Quiz description is required');
  if (data.kind === QuizKind.Standard) {
    if (!data.categoryId.trim()) throw new Error('Quiz category is required');
  }
}

export type CreateStandardQuizInput = Omit<WritePayload, 'kind' | 'createdAt' | 'categoryId'> & {
  categoryId: string;
  createdAt?: Date;
};

export async function addStandardQuiz(input: CreateStandardQuizInput): Promise<string> {
  const payload: WritePayload = {
    ...input,
    kind: QuizKind.Standard,
    createdAt: input.createdAt ?? new Date(),
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

export type CreateDailyQuizInput = Omit<WritePayload, 'kind' | 'createdAt' | 'categoryId'> & {
  date: Date;
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

export type UpdateQuizInput = {
  title: string;
  description: string;
  categoryId: string;
  ageGroup: AgeGroup;
  dificultyLevel: DifficultyLevel;
  kind: QuizKind;
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
      description: data.description.trim(),
      categoryId: data.kind === QuizKind.Daily ? '' : trimmedCategory,
      ageGroup: data.ageGroup,
      dificultyLevel: data.dificultyLevel,
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
      batch.set(statRef, {
        numberOfQuestions: questionCount,
        averageScore: 0,
        totalNumberOfTrials: 0,
        updatedAt: serverTimestamp(),
        lastTrialAt: null,
      });
    }
    await batch.commit();
  } catch (err) {
    console.error('[quizzesApi] publishQuiz error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to publish quiz');
  }
}

export async function deleteQuiz(id: string): Promise<void> {
  console.log('[quizzesApi] deleteQuiz id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[quizzesApi] deleteQuiz error', err);
    throw new Error('Failed to delete quiz');
  }
}
