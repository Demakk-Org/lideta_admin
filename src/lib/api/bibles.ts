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

export type BibleSource = {
  lang: string; // e.g., 'am', 'en'
  name: string;
  short_name: string;
  source_url: string; // Firebase Storage URL or external URL
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'bible_sources');

export async function listBibles(): Promise<WithId<BibleSource>[]> {
  console.log('[biblesApi] listBibles: querying bible_sources...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    console.log('[biblesApi] listBibles: fetched', snap.size, 'docs');
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as BibleSource) }));
    if (items[0]) {
      console.log('[biblesApi] listBibles: first item', items[0]);
    }
    return items;
  } catch (err) {
    console.error('[biblesApi] listBibles error', err);
    throw new Error('Failed to list bible sources');
  }
}

export async function addBibleSource(
  data: BibleSource
): Promise<string> {
  console.log('[biblesApi] addBibleSource payload', data);
  try {
    if (!data.source_url || !data.source_url.trim()) {
      console.error('[biblesApi] addBibleSource validation error: source_url missing');
      throw new Error('source_url is required');
    }
    const docRef = await addDoc(colRef, {
      ...data,
    });
    console.log('[biblesApi] addBibleSource created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[biblesApi] addBibleSource error', err);
    throw new Error('Failed to add bible source');
  }
}

export async function updateBibleSource(
  id: string,
  data: Partial<BibleSource>
): Promise<void> {
  console.log('[biblesApi] updateBibleSource id', id, 'data', data);
  try {
    if (Object.prototype.hasOwnProperty.call(data, 'source_url')) {
      const val = (data.source_url ?? '').toString();
      if (!val.trim()) {
        console.error('[biblesApi] updateBibleSource validation error: empty source_url');
        throw new Error('source_url cannot be empty');
      }
    }
    await updateDoc(doc(colRef, id), {
      ...data,
    });
    console.log('[biblesApi] updateBibleSource success', id);
  } catch (err) {
    console.error('[biblesApi] updateBibleSource error', err);
    throw new Error('Failed to update bible source');
  }
}

export async function deleteBibleSource(id: string): Promise<void> {
  console.log('[biblesApi] deleteBibleSource id', id);
  try {
    await deleteDoc(doc(colRef, id));
    console.log('[biblesApi] deleteBibleSource success', id);
  } catch (err) {
    console.error('[biblesApi] deleteBibleSource error', err);
    throw new Error('Failed to delete bible source');
  }
}
