import { db } from '@/lib/firebase/config';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, type UpdateData } from 'firebase/firestore';

export type AudioLyric = { text: string; time: string };

export type AudioDoc = {
  title: string;
  audioBy?: string;
  uploader?: string;
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  audioUrl?: string;
  uploadDate?: number; // ms epoch for UI; set automatically on create
  lyrics?: AudioLyric[];
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'audios');

function normString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function isPartialLyric(x: unknown): x is Partial<AudioLyric> {
  return !!x && typeof x === 'object' && ('text' in (x as Record<string, unknown>) || 'time' in (x as Record<string, unknown>));
}

function normalizeLyrics(v: unknown): AudioLyric[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AudioLyric[] = [];
  for (const it of v) {
    if (isPartialLyric(it)) {
      const text = normString(it.text) || '';
      const time = normString(it.time) || '';
      if (text || time) out.push({ text, time });
    }
  }
  return out.length ? out : undefined;
}

export async function listAudios(): Promise<WithId<AudioDoc>[]> {
  try {
    const q = query(colRef, orderBy('uploadDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const doc: AudioDoc = {
        title: String(data['title'] ?? ''),
        audioBy: normString(data['audioBy']),
        uploader: normString(data['uploader']),
        description: normString(data['description']),
        tags: Array.isArray(data['tags']) ? (data['tags'] as unknown[]).map(String).filter(Boolean) : undefined,
        thumbnailUrl: normString(data['thumbnailUrl']),
        audioUrl: normString(data['audioUrl']),
        uploadDate: typeof data['uploadDate'] === 'number' ? (data['uploadDate'] as number) : undefined,
        lyrics: normalizeLyrics(data['lyrics']),
      };
      return { id: d.id, ...doc } as WithId<AudioDoc>;
    });
  } catch (err) {
    console.error('[audiosApi] listAudios error', err);
    throw new Error('Failed to list audios');
  }
}

export async function createAudio(data: AudioDoc): Promise<string> {
  try {
    const toWrite: Record<string, unknown> = {
      title: String(data.title || ''),
      audioBy: normString(data.audioBy),
      uploader: normString(data.uploader),
      description: normString(data.description),
      thumbnailUrl: normString(data.thumbnailUrl),
      audioUrl: normString(data.audioUrl),
      uploadDate: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    if (data?.tags && data.tags.filter(Boolean).length > 0) {
      toWrite.tags = data.tags.filter(Boolean);
    }
    if (data?.lyrics && data.lyrics.length > 0) {
      toWrite.lyrics = normalizeLyrics(data.lyrics);
    }
    const added = await addDoc(colRef, toWrite);
    return added.id;
  } catch (err) {
    console.error('[audiosApi] createAudio error', err);
    throw new Error('Failed to create audio');
  }
}

export async function updateAudio(id: string, data: Partial<AudioDoc>): Promise<void> {
  try {
    const toWrite: Partial<AudioDoc> = {};
    if (Object.prototype.hasOwnProperty.call(data, 'title')) toWrite.title = String(data.title || '');
    if (Object.prototype.hasOwnProperty.call(data, 'audioBy')) toWrite.audioBy = normString(data.audioBy);
    if (Object.prototype.hasOwnProperty.call(data, 'uploader')) toWrite.uploader = normString(data.uploader);
    if (Object.prototype.hasOwnProperty.call(data, 'description')) toWrite.description = normString(data.description);
    if (Object.prototype.hasOwnProperty.call(data, 'tags')) toWrite.tags = Array.isArray(data.tags) ? data.tags.filter(Boolean) : undefined;
    if (Object.prototype.hasOwnProperty.call(data, 'thumbnailUrl')) toWrite.thumbnailUrl = normString(data.thumbnailUrl);
    if (Object.prototype.hasOwnProperty.call(data, 'audioUrl')) toWrite.audioUrl = normString(data.audioUrl);
    if (Object.prototype.hasOwnProperty.call(data, 'lyrics')) toWrite.lyrics = normalizeLyrics(data.lyrics);
    await updateDoc(doc(colRef, id), toWrite as UpdateData<AudioDoc>);
  } catch (err) {
    console.error('[audiosApi] updateAudio error', err);
    throw new Error('Failed to update audio');
  }
}

export async function deleteAudio(id: string): Promise<void> {
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[audiosApi] deleteAudio error', err);
    throw new Error('Failed to delete audio');
  }
}
