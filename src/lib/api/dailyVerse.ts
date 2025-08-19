import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

export type DisplayDate = {
  day: number;
  month: number; // 1-12
  year: number;
};

export type DailyVerse = {
  book: number; // book index or id as in your dataset
  chapter: number;
  verse: number;
  reference: string; // e.g., "Isaiah 40:29"
  text: string;
  tag?: string;
  status: 'active' | 'inactive' | string;
  display_date: DisplayDate;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'daily_verse');

export async function listDailyVerses(): Promise<WithId<DailyVerse>[]> {
  console.log('[dailyVerseApi] listDailyVerses: querying daily_verse...');
  try {
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    console.log('[dailyVerseApi] listDailyVerses: fetched', snap.size, 'docs');
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DailyVerse) }));
    if (items[0]) {
      console.log('[dailyVerseApi] listDailyVerses: first item', items[0]);
    }
    return items;
  } catch (err) {
    console.error('[dailyVerseApi] listDailyVerses error', err);
    throw new Error('Failed to list daily verses');
  }
}

export async function addDailyVerse(
  data: Omit<DailyVerse, 'createdAt' | 'updatedAt'>
): Promise<string> {
  console.log('[dailyVerseApi] addDailyVerse payload', data);
  try {
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    console.log('[dailyVerseApi] addDailyVerse created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[dailyVerseApi] addDailyVerse error', err);
    throw new Error('Failed to add daily verse');
  }
}

export async function updateDailyVerse(
  id: string,
  data: Partial<DailyVerse>
): Promise<void> {
  console.log('[dailyVerseApi] updateDailyVerse id', id, 'data', data);
  try {
    await updateDoc(doc(colRef, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    console.log('[dailyVerseApi] updateDailyVerse success', id);
  } catch (err) {
    console.error('[dailyVerseApi] updateDailyVerse error', err);
    throw new Error('Failed to update daily verse');
  }
}

export async function deleteDailyVerse(id: string): Promise<void> {
  console.log('[dailyVerseApi] deleteDailyVerse id', id);
  try {
    await deleteDoc(doc(colRef, id));
    console.log('[dailyVerseApi] deleteDailyVerse success', id);
  } catch (err) {
    console.error('[dailyVerseApi] deleteDailyVerse error', err);
    throw new Error('Failed to delete daily verse');
  }
}
