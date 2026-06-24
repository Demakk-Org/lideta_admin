import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// Mirrors the Flutter `BibleStudyCategory` model. `id` is the Firestore doc id
// and is not stored in the document body.
export type BibleStudyCategory = {
  title: string;
  description: string;
  imageUrl?: string;
  tags: string[];
  studyCount: number;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'bible_study_categories');

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v)).map((v) => v.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function mapDoc(id: string, data: Record<string, unknown>): WithId<BibleStudyCategory> {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    imageUrl:
      typeof data.imageUrl === 'string' && data.imageUrl.trim()
        ? data.imageUrl
        : undefined,
    tags: toStringArray(data.tags),
    studyCount:
      typeof data.studyCount === 'number' && Number.isFinite(data.studyCount)
        ? data.studyCount
        : 0,
  };
}

export async function listBibleStudyCategories(): Promise<
  WithId<BibleStudyCategory>[]
> {
  console.log('[bibleStudyCategoriesApi] listBibleStudyCategories: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      mapDoc(d.id, d.data() as Record<string, unknown>),
    );
  } catch (err) {
    console.error('[bibleStudyCategoriesApi] listBibleStudyCategories error', err);
    throw new Error('Failed to list bible study categories');
  }
}

// `studyCount` is intentionally NOT an input field: it is a derived counter
// maintained by `recountBibleStudyCategoryCounts` whenever studies change.
export type BibleStudyCategoryInput = {
  title: string;
  description: string;
  imageUrl?: string;
  tags?: string[];
};

// User-editable fields only; never includes `studyCount`.
function sanitizeFields(data: BibleStudyCategoryInput) {
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    imageUrl: data.imageUrl?.trim() ? data.imageUrl.trim() : undefined,
    tags: toStringArray(data.tags),
  };
}

export async function addBibleStudyCategory(
  data: BibleStudyCategoryInput,
): Promise<string> {
  console.log('[bibleStudyCategoriesApi] addBibleStudyCategory payload', data);
  try {
    if (!data.title || !data.title.trim()) {
      throw new Error('Category title is required');
    }
    if (!data.description || !data.description.trim()) {
      throw new Error('Category description is required');
    }
    // New category has no studies yet; count starts at 0 and is maintained
    // automatically as studies are added/removed.
    const docRef = await addDoc(colRef, { ...sanitizeFields(data), studyCount: 0 });
    console.log('[bibleStudyCategoriesApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[bibleStudyCategoriesApi] addBibleStudyCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add bible study category');
  }
}

export async function updateBibleStudyCategory(
  id: string,
  data: BibleStudyCategoryInput,
): Promise<void> {
  console.log('[bibleStudyCategoriesApi] updateBibleStudyCategory id', id, 'data', data);
  try {
    if (!data.title || !data.title.trim()) {
      throw new Error('Category title cannot be empty');
    }
    if (!data.description || !data.description.trim()) {
      throw new Error('Category description cannot be empty');
    }
    // Note: `studyCount` is deliberately omitted so the maintained counter is
    // never clobbered by an edit.
    await updateDoc(doc(colRef, id), sanitizeFields(data));
  } catch (err) {
    console.error('[bibleStudyCategoriesApi] updateBibleStudyCategory error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update bible study category');
  }
}

export async function deleteBibleStudyCategory(id: string): Promise<void> {
  console.log('[bibleStudyCategoriesApi] deleteBibleStudyCategory id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[bibleStudyCategoriesApi] deleteBibleStudyCategory error', err);
    throw new Error('Failed to delete bible study category');
  }
}

/**
 * Recomputes every category's `studyCount` from the `bible_studies` collection
 * (the source of truth) and writes back only the docs whose count changed.
 * Call after any study create/edit/delete, or on demand to repair drift.
 */
export async function recountBibleStudyCategoryCounts(): Promise<void> {
  console.log('[bibleStudyCategoriesApi] recountBibleStudyCategoryCounts: tallying...');
  try {
    const [studiesSnap, catsSnap] = await Promise.all([
      getDocs(collection(db, 'bible_studies')),
      getDocs(colRef),
    ]);

    const counts: Record<string, number> = {};
    studiesSnap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      // Prefer the new `categoryId` reference; fall back to the id embedded in
      // the legacy `category` object for studies not yet migrated.
      let id = typeof data.categoryId === 'string' ? data.categoryId.trim() : '';
      if (!id) {
        const cat = data.category;
        if (
          cat &&
          typeof cat === 'object' &&
          typeof (cat as Record<string, unknown>).id === 'string'
        ) {
          id = ((cat as Record<string, unknown>).id as string).trim();
        }
      }
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    });

    const batch = writeBatch(db);
    let changed = 0;
    catsSnap.forEach((d) => {
      const next = counts[d.id] ?? 0;
      const current = (d.data() as Record<string, unknown>).studyCount;
      if (current !== next) {
        batch.update(d.ref, { studyCount: next });
        changed += 1;
      }
    });

    if (changed > 0) await batch.commit();
    console.log('[bibleStudyCategoriesApi] recount updated', changed, 'categories');
  } catch (err) {
    console.error('[bibleStudyCategoriesApi] recountBibleStudyCategoryCounts error', err);
    throw new Error('Failed to recount category study counts');
  }
}
