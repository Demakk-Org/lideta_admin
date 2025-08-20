import { storage } from '@/lib/firebase/config';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

function sanitizeSegment(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

export async function uploadAudioThumbnail(
  file: File,
  titleOrAuthor: string
): Promise<string> {
  console.log('[storageApi] uploadAudioThumbnail start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrAuthor || 'untitled');
    const path = `audios/thumbnails/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadAudioThumbnail success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadAudioThumbnail error', err);
    throw new Error('Failed to upload audio thumbnail');
  }
}

export async function uploadAudioFile(
  file: File,
  titleOrAuthor: string
): Promise<string> {
  console.log('[storageApi] uploadAudioFile start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrAuthor || 'untitled');
    const path = `audios/files/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadAudioFile success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadAudioFile error', err);
    throw new Error('Failed to upload audio file');
  }
}

export async function uploadUserImage(
  file: File,
  nameOrEmail: string
): Promise<string> {
  console.log('[storageApi] uploadUserImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(nameOrEmail || 'user');
    const path = `users/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadUserImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadUserImage error', err);
    throw new Error('Failed to upload user image');
  }
}

export async function uploadEventImage(
  file: File,
  titleOrCategory: string
): Promise<string> {
  console.log('[storageApi] uploadEventImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrCategory || 'untitled');
    const path = `events/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadEventImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadEventImage error', err);
    throw new Error('Failed to upload event image');
  }
}

export async function uploadNewsImage(
  file: File,
  titleOrCategory: string
): Promise<string> {
  console.log('[storageApi] uploadNewsImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrCategory || 'untitled');
    const path = `news/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadNewsImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadNewsImage error', err);
    throw new Error('Failed to upload news image');
  }
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
