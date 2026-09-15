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
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import {
  buildLocalized,
  displayText,
  localesOf,
  readLocalized,
} from '@/lib/i18n/localizedText';
import type { LocalizedText } from '@/lib/i18n/localizedText';

export type CourseCategory = {
  /**
   * Per-language label. Unlike a course a category has no `defaultLanguage` —
   * it falls back to `en`, then to whatever language it does have.
   */
  name: LocalizedText;
  description: LocalizedText;
  imageUrl?: string;
  /** Derived from the key set of `name` on write. */
  availableLanguages?: ContentLocale[];
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
        const name = readLocalized(data.name);
        return {
          id: d.id,
          name,
          description: readLocalized(data.description),
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
          availableLanguages: localesOf(name),
        };
      })
      // The dashboard's own ordering, so it sorts on one language.
      .sort((a, b) => displayText(a.name).localeCompare(displayText(b.name)));
  } catch (err) {
    console.error('[courseCategoriesApi] listCourseCategories error', err);
    throw new Error('Failed to list course categories');
  }
}

function buildWrite(data: CourseCategory) {
  const name = buildLocalized(data.name);
  const availableLanguages = localesOf(name);
  if (availableLanguages.length === 0) {
    throw new Error('Category name is required');
  }

  const description = buildLocalized(data.description);
  const keep: LocalizedText = {};
  for (const l of availableLanguages) if (description[l]) keep[l] = description[l];

  return {
    name,
    description: keep,
    imageUrl: data.imageUrl?.trim() ?? '',
    availableLanguages,
  };
}

export async function addCourseCategory(data: CourseCategory): Promise<string> {
  try {
    const ref = await addDoc(colRef, buildWrite(data));
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
    await updateDoc(doc(colRef, id), buildWrite(data));
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
