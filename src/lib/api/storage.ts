import { storage } from '@/lib/firebase/config';
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';

function sanitizeSegment(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

/** Receives upload completion as a 0-100 percentage. */
export type UploadProgressHandler = (percent: number) => void;

async function uploadWithProgress(
  file: File,
  path: string,
  onProgress?: UploadProgressHandler
): Promise<string> {
  const metadata = { contentType: file.type || 'application/octet-stream' };
  const task = uploadBytesResumable(ref(storage, path), file, metadata);
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      () => resolve()
    );
  });
  return getDownloadURL(task.snapshot.ref);
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

export async function uploadVideoThumbnail(
  file: File,
  title: string,
  onProgress?: UploadProgressHandler
): Promise<string> {
  console.log('[storageApi] uploadVideoThumbnail start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(title || 'untitled');
    const path = `videos/thumbnails/${base}/${ts}-${file.name}`;
    const url = await uploadWithProgress(file, path, onProgress);
    console.log('[storageApi] uploadVideoThumbnail success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadVideoThumbnail error', err);
    throw new Error('Failed to upload video thumbnail');
  }
}

export async function uploadVideoFile(
  file: File,
  title: string,
  onProgress?: UploadProgressHandler
): Promise<string> {
  console.log('[storageApi] uploadVideoFile start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(title || 'untitled');
    const path = `videos/files/${base}/${ts}-${file.name}`;
    const url = await uploadWithProgress(file, path, onProgress);
    console.log('[storageApi] uploadVideoFile success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadVideoFile error', err);
    throw new Error('Failed to upload video file');
  }
}

/** True when the URL points at this project's Firebase Storage bucket. */
export function isFirebaseStorageUrl(url: string): boolean {
  return /^https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9-]+\.firebasestorage\.app)\//i.test(url.trim());
}

/**
 * Deletes a Storage object addressed by its download URL. Objects that are
 * already gone (or that live outside our bucket) are treated as success.
 */
export async function deleteStorageFileByUrl(url: string): Promise<void> {
  if (!url || !isFirebaseStorageUrl(url)) return;
  try {
    await deleteObject(ref(storage, url));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'storage/object-not-found') return;
    console.error('[storageApi] deleteStorageFileByUrl error', err);
    throw new Error('Failed to delete storage file');
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

export async function uploadBibleStudyImage(
  file: File,
  titleOrCategory: string
): Promise<string> {
  console.log('[storageApi] uploadBibleStudyImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrCategory || 'untitled');
    const path = `bible_studies/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadBibleStudyImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadBibleStudyImage error', err);
    throw new Error('Failed to upload bible study image');
  }
}

export async function uploadBibleStudyMaterial(
  file: File,
  type: string,
  titleOrStudy: string
): Promise<string> {
  console.log('[storageApi] uploadBibleStudyMaterial start', { type, name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const typeFolder = sanitizeSegment(type || 'other');
    const base = sanitizeSegment(titleOrStudy || 'material');
    // Group uploads by the selected material type, e.g.
    // bible_studies/materials/audio/<title>/<ts>-<file>
    const path = `bible_studies/materials/${typeFolder}/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadBibleStudyMaterial success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadBibleStudyMaterial error', err);
    throw new Error('Failed to upload bible study material');
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

export async function uploadCourseImage(
  file: File,
  titleOrCategory: string
): Promise<string> {
  console.log('[storageApi] uploadCourseImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrCategory || 'untitled');
    const path = `courses/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadCourseImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadCourseImage error', err);
    throw new Error('Failed to upload course image');
  }
}

export async function uploadLessonImage(
  file: File,
  titleOrCourse: string
): Promise<string> {
  console.log('[storageApi] uploadLessonImage start', { name: file.name, size: file.size });
  try {
    const ts = Date.now();
    const base = sanitizeSegment(titleOrCourse || 'untitled');
    const path = `lessons/${base}/${ts}-${file.name}`;
    const storageRef = ref(storage, path);
    const metadata = { contentType: file.type || 'application/octet-stream' };
    const snap = await uploadBytes(storageRef, file, metadata);
    const url = await getDownloadURL(snap.ref);
    console.log('[storageApi] uploadLessonImage success', url);
    return url;
  } catch (err) {
    console.error('[storageApi] uploadLessonImage error', err);
    throw new Error('Failed to upload lesson image');
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
