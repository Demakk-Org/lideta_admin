import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';

export type QuizCategory = {
  name: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'quiz_categories');

export async function listQuizCategories(): Promise<WithId<QuizCategory>[]> {
  console.log('[quizCategoriesApi] listQuizCategories: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const name = typeof data.name === 'string' ? data.name : '';
      return { id: d.id, name };
    });
  } catch (err) {
    console.error('[quizCategoriesApi] listQuizCategories error', err);
    throw new Error('Failed to list quiz categories');
  }
}

export async function addQuizCategory(data: QuizCategory): Promise<string> {
  console.log('[quizCategoriesApi] addQuizCategory payload', data);
  try {
    if (!data.name || !data.name.trim()) {
      throw new Error('Category name is required');
    }
    const docRef = await addDoc(colRef, { name: data.name.trim() });
    return docRef.id;
  } catch (err) {
    console.error('[quizCategoriesApi] addQuizCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add quiz category');
  }
}

export async function updateQuizCategory(
  id: string,
  data: Partial<QuizCategory>,
): Promise<void> {
  console.log('[quizCategoriesApi] updateQuizCategory id', id, 'data', data);
  try {
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
      const val = (data.name ?? '').toString();
      if (!val.trim()) {
        throw new Error('Category name cannot be empty');
      }
    }
    await updateDoc(doc(colRef, id), {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    });
  } catch (err) {
    console.error('[quizCategoriesApi] updateQuizCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update quiz category');
  }
}

export async function deleteQuizCategory(id: string): Promise<void> {
  console.log('[quizCategoriesApi] deleteQuizCategory id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[quizCategoriesApi] deleteQuizCategory error', err);
    throw new Error('Failed to delete quiz category');
  }
}
