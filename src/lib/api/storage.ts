import { storage } from '@/lib/firebase/config';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

function sanitizeSegment(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

export async function uploadBibleJson(
  file: File,
  lang: string,
  shortName: string
): Promise<string> {
  console.log('[storageApi] uploadBibleJson start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const path = `bibles/${sanitizeSegment(lang)}/${sanitizeSegment(shortName)}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: 'application/json' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadBibleJson success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadBibleJson error', err);
    throw new Error('Failed to upload bible JSON');
  }
}
