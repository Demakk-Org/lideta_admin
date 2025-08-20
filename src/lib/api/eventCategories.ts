import { db } from '@/lib/firebase/config';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc } from 'firebase/firestore';

export type EventCategory = {
  name: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'event_categories');

export async function listEventCategories(): Promise<WithId<EventCategory>[]> {
  console.log('[eventCategoriesApi] listEventCategories: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventCategory) }));
    return items;
  } catch (err) {
    console.error('[eventCategoriesApi] listEventCategories error', err);
    throw new Error('Failed to list event categories');
  }
}

export async function addEventCategory(data: EventCategory): Promise<string> {
  console.log('[eventCategoriesApi] addEventCategory payload', data);
  try {
    if (!data.name || !data.name.trim()) {
      throw new Error('Category name is required');
    }
    const docRef = await addDoc(colRef, { ...data });
    console.log('[eventCategoriesApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[eventCategoriesApi] addEventCategory error', err);
    throw new Error('Failed to add event category');
  }
}

export async function updateEventCategory(id: string, data: Partial<EventCategory>): Promise<void> {
  console.log('[eventCategoriesApi] updateEventCategory id', id, 'data', data);
  try {
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
      const val = (data.name ?? '').toString();
      if (!val.trim()) {
        throw new Error('Category name cannot be empty');
      }
    }
    await updateDoc(doc(colRef, id), { ...data });
  } catch (err) {
    console.error('[eventCategoriesApi] updateEventCategory error', err);
    throw new Error('Failed to update event category');
  }
}

export async function deleteEventCategory(id: string): Promise<void> {
  console.log('[eventCategoriesApi] deleteEventCategory id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[eventCategoriesApi] deleteEventCategory error', err);
    throw new Error('Failed to delete event category');
  }
}
