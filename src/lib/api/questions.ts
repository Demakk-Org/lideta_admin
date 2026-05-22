import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

export enum QuestionType {
  TrueFalse = 'true_false',
  MultipleChoice = 'multiple_choice',
  ShortAnswer = 'short_answer',
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.TrueFalse]: 'True / False',
  [QuestionType.MultipleChoice]: 'Multiple Choice',
  [QuestionType.ShortAnswer]: 'Short Answer',
};

export type VerseReference = {
  book: number;
  chapter: number;
  verse?: number | null;
  toVerse?: number | null;
  verses?: number[] | null;
};

export type QuestionDoc = {
  id: string;
  quizId: string;
  text: string;
  options: string[];
  correctOptionId: number | null;
  referenceVerse: VerseReference | null;
  explanation: string | null;
  order: number;
  questionType: QuestionType;
  answerText: string | null;
};

function questionsCol(quizId: string) {
  return collection(db, 'quizzes', quizId, 'questions');
}

function statRef(quizId: string) {
  return doc(db, 'quizzes', quizId, 'meta', 'stat');
}

async function bumpStatCount(quizId: string, delta: number): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statRef(quizId));
      if (!snap.exists()) return; // unpublished quiz — no stat doc to update
      tx.update(statRef(quizId), {
        numberOfQuestions: increment(delta),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    // Stat sync is best-effort; log but don't fail the underlying op.
    console.error('[questionsApi] bumpStatCount error', err);
  }
}

function coerceQuestionType(val: unknown): QuestionType {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (s === QuestionType.TrueFalse) return QuestionType.TrueFalse;
  if (s === QuestionType.MultipleChoice) return QuestionType.MultipleChoice;
  if (s === QuestionType.ShortAnswer) return QuestionType.ShortAnswer;
  return QuestionType.MultipleChoice;
}

function coerceVerseRef(val: unknown): VerseReference | null {
  if (!val || typeof val !== 'object') return null;
  const r = val as Record<string, unknown>;
  const book = typeof r.book === 'number' ? r.book : Number(r.book);
  const chapter = typeof r.chapter === 'number' ? r.chapter : Number(r.chapter);
  if (!Number.isFinite(book) || !Number.isFinite(chapter)) return null;
  const verse =
    typeof r.verse === 'number'
      ? r.verse
      : r.verse == null
        ? null
        : Number(r.verse);
  const toVerse =
    typeof r.toVerse === 'number'
      ? r.toVerse
      : r.toVerse == null
        ? null
        : Number(r.toVerse);
  const verses = Array.isArray(r.verses)
    ? (r.verses as unknown[])
        .map((v) => (typeof v === 'number' ? v : Number(v)))
        .filter((v) => Number.isFinite(v))
    : null;
  return {
    book,
    chapter,
    verse: Number.isFinite(verse as number) ? (verse as number) : null,
    toVerse: Number.isFinite(toVerse as number) ? (toVerse as number) : null,
    verses: verses && verses.length ? verses : null,
  };
}

function mapDoc(
  id: string,
  quizId: string,
  data: Record<string, unknown>,
): QuestionDoc {
  const optionsRaw = Array.isArray(data.options) ? data.options : [];
  return {
    id,
    quizId,
    text: typeof data.text === 'string' ? data.text : '',
    options: optionsRaw.map((v) => (typeof v === 'string' ? v : String(v))),
    correctOptionId:
      typeof data.correctOptionId === 'number' ? data.correctOptionId : null,
    referenceVerse: coerceVerseRef(data.referenceVerse),
    explanation:
      typeof data.explanation === 'string' && data.explanation.trim()
        ? data.explanation
        : null,
    order: typeof data.order === 'number' ? data.order : 0,
    questionType: coerceQuestionType(data.questionType),
    answerText:
      typeof data.answerText === 'string' && data.answerText.trim()
        ? data.answerText
        : null,
  };
}

export async function listQuestions(quizId: string): Promise<QuestionDoc[]> {
  console.log('[questionsApi] listQuestions', quizId);
  try {
    const snap = await getDocs(query(questionsCol(quizId), orderBy('order')));
    return snap.docs.map((d) =>
      mapDoc(d.id, quizId, d.data() as Record<string, unknown>),
    );
  } catch (err) {
    console.error('[questionsApi] listQuestions error', err);
    throw new Error('Failed to list questions');
  }
}

export type QuestionWriteInput = {
  text: string;
  questionType: QuestionType;
  options: string[];
  correctOptionId: number | null;
  answerText: string | null;
  explanation: string | null;
  referenceVerse: VerseReference | null;
  order: number;
};

function validateForType(data: QuestionWriteInput) {
  if (!data.text.trim()) throw new Error('Question text is required');
  switch (data.questionType) {
    case QuestionType.TrueFalse: {
      if (data.correctOptionId !== 0 && data.correctOptionId !== 1) {
        throw new Error('Pick True or False as the correct answer');
      }
      break;
    }
    case QuestionType.MultipleChoice: {
      const cleaned = data.options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) {
        throw new Error('Multiple choice needs at least 2 options');
      }
      if (
        data.correctOptionId == null ||
        data.correctOptionId < 0 ||
        data.correctOptionId >= cleaned.length
      ) {
        throw new Error('Pick a correct option');
      }
      break;
    }
    case QuestionType.ShortAnswer: {
      if (!data.answerText || !data.answerText.trim()) {
        throw new Error('Short answer needs an expected answer');
      }
      break;
    }
  }
}

function sanitizeVerseRef(v: VerseReference | null): VerseReference | null {
  if (!v) return null;
  if (!Number.isFinite(v.book) || !Number.isFinite(v.chapter)) return null;
  const versesArr = Array.isArray(v.verses)
    ? v.verses.filter((n) => Number.isFinite(n))
    : null;
  return {
    book: v.book,
    chapter: v.chapter,
    verse: typeof v.verse === 'number' && Number.isFinite(v.verse) ? v.verse : null,
    toVerse:
      typeof v.toVerse === 'number' && Number.isFinite(v.toVerse)
        ? v.toVerse
        : null,
    verses: versesArr && versesArr.length ? versesArr : null,
  };
}

function buildWritePayload(quizId: string, data: QuestionWriteInput) {
  const type = data.questionType;
  const options =
    type === QuestionType.MultipleChoice
      ? data.options.map((o) => o.trim()).filter(Boolean)
      : [];
  const correctOptionId =
    type === QuestionType.ShortAnswer ? null : data.correctOptionId;
  const answerText =
    type === QuestionType.ShortAnswer && data.answerText
      ? data.answerText.trim()
      : null;
  return {
    quizId,
    text: data.text.trim(),
    questionType: type,
    options,
    correctOptionId,
    answerText,
    explanation: data.explanation && data.explanation.trim() ? data.explanation.trim() : null,
    referenceVerse: sanitizeVerseRef(data.referenceVerse),
    order: data.order,
  };
}

export async function addQuestion(
  quizId: string,
  data: QuestionWriteInput,
): Promise<string> {
  validateForType(data);
  try {
    const payload = buildWritePayload(quizId, data);
    const ref = await addDoc(questionsCol(quizId), { ...payload, id: '' });
    // Mirror doc id into the body so it matches the Dart `Question.id` field.
    await updateDoc(ref, { id: ref.id });
    await bumpStatCount(quizId, 1);
    return ref.id;
  } catch (err) {
    console.error('[questionsApi] addQuestion error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add question');
  }
}

export async function updateQuestion(
  quizId: string,
  id: string,
  data: QuestionWriteInput,
): Promise<void> {
  validateForType(data);
  try {
    const payload = buildWritePayload(quizId, data);
    await updateDoc(doc(questionsCol(quizId), id), { ...payload, id });
  } catch (err) {
    console.error('[questionsApi] updateQuestion error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update question');
  }
}

export async function deleteQuestion(quizId: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(questionsCol(quizId), id));
    await bumpStatCount(quizId, -1);
  } catch (err) {
    console.error('[questionsApi] deleteQuestion error', err);
    throw new Error('Failed to delete question');
  }
}

export async function countQuestions(quizId: string): Promise<number> {
  try {
    const snap = await getCountFromServer(questionsCol(quizId));
    return snap.data().count;
  } catch (err) {
    console.error('[questionsApi] countQuestions error', err);
    return 0;
  }
}

export async function reorderQuestions(
  quizId: string,
  orderedIds: string[],
): Promise<void> {
  try {
    const batch = writeBatch(db);
    orderedIds.forEach((id, idx) => {
      batch.update(doc(questionsCol(quizId), id), { order: idx });
    });
    await batch.commit();
  } catch (err) {
    console.error('[questionsApi] reorderQuestions error', err);
    throw new Error('Failed to reorder questions');
  }
}
