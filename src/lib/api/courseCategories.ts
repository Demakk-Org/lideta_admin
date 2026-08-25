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

export type CourseCategory = {
  name: string;
  description?: string;
  imageUrl?: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'course_categories');

export async function listCourseCategories(): Promise<WithId<CourseCategory>[]> {
  console.log('[courseCategoriesApi] listCourseCategories: querying...');
  try {
    const snap = await getDocs(query(colRef));
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          name: typeof data.name === 'string' ? data.name : '',
          description:
            typeof data.description === 'string' ? data.description : '',
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[courseCategoriesApi] listCourseCategories error', err);
    throw new Error('Failed to list course categories');
  }
}

export async function addCourseCategory(data: CourseCategory): Promise<string> {
  try {
    if (!data.name?.trim()) throw new Error('Category name is required');
    const ref = await addDoc(colRef, {
      name: data.name.trim(),
      description: data.description?.trim() ?? '',
      imageUrl: data.imageUrl?.trim() ?? '',
    });
    return ref.id;
  } catch (err) {
    console.error('[courseCategoriesApi] addCourseCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add course category');
  }
}

export async function updateCourseCategory(
  id: string,
  data: CourseCategory,
): Promise<void> {
  try {
    if (!data.name?.trim()) throw new Error('Category name cannot be empty');
    await updateDoc(doc(colRef, id), {
      name: data.name.trim(),
      description: data.description?.trim() ?? '',
      imageUrl: data.imageUrl?.trim() ?? '',
    });
  } catch (err) {
    console.error('[courseCategoriesApi] updateCourseCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update course category');
  }
}

export async function deleteCourseCategory(id: string): Promise<void> {
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[courseCategoriesApi] deleteCourseCategory error', err);
    throw new Error('Failed to delete course category');
  }
}
