import { db } from '@/lib/firebase/config';
import { collection, getDocs, query } from 'firebase/firestore';

export type BibleStudy = {
  title: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'bible_studies');

export async function listBibleStudies(): Promise<WithId<BibleStudy>[]> {
  console.log('[bibleStudiesApi] listBibleStudies: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const title =
        typeof data.topicTitle === 'string' && data.topicTitle.trim()
          ? data.topicTitle
          : typeof data.title === 'string' && data.title.trim()
            ? data.title
            : typeof data.name === 'string'
              ? data.name
              : '';
      return { id: d.id, title };
    });
  } catch (err) {
    console.error('[bibleStudiesApi] listBibleStudies error', err);
    throw new Error('Failed to list bible studies');
  }
}
