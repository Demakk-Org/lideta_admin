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
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DailyVerse) }));
}

export async function addDailyVerse(
  data: Omit<DailyVerse, 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateDailyVerse(
  id: string,
  data: Partial<DailyVerse>
): Promise<void> {
  await updateDoc(doc(colRef, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDailyVerse(id: string): Promise<void> {
  await deleteDoc(doc(colRef, id));
}
