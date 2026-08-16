import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

export type VideoLyric = { text: string; time: string };

export const VIDEO_TYPES = ['youtube', 'hosted'] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

/**
 * Firestore shape of a `videos` document. Mirrors the Flutter app's
 * HostedVideo.fromJson / YouTubeVideo.fromJson. The document id is the
 * Firestore id — it is never stored as a field.
 */
export type VideoDoc = {
  title: string;
  description: string;
  thumbnailUrl: string;
  /** ISO8601 string or Firestore Timestamp. New records use Timestamp. */
  uploadDate: string | Timestamp;
  uploader: string;
  tags: string[];
  videoType: VideoType;
  lyrics?: VideoLyric[];
  /** hosted only */
  videoUrl?: string;
  /** youtube only */
  youtubeVideoId?: string;
  /** youtube only */
  channelName?: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'videos');

function normString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function normVideoType(v: unknown): VideoType {
  return v === 'hosted' || v === 'youtube' ? v : 'hosted';
}

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map((t) => String(t).trim()).filter(Boolean);
}

function isPartialLyric(x: unknown): x is Partial<VideoLyric> {
  return (
    !!x &&
    typeof x === 'object' &&
    ('text' in (x as Record<string, unknown>) ||
      'time' in (x as Record<string, unknown>))
  );
}

function normalizeLyrics(v: unknown): VideoLyric[] {
  if (!Array.isArray(v)) return [];
  const out: VideoLyric[] = [];
  for (const it of v) {
    if (isPartialLyric(it)) {
      const text = normString(it.text) || '';
      const time = normString(it.time) || '';
      if (text || time) out.push({ text, time });
    }
  }
  return out;
}

/** Reads a stored uploadDate back as an ISO string, tolerating legacy shapes. */
function normUploadDate(v: unknown): string {
  const s = normString(v);
  if (s) return s;
  if (typeof v === 'number' && Number.isFinite(v))
    return new Date(v).toISOString();
  // Handle Timestamp instance directly
  if (v instanceof Timestamp) {
    const d = v.toDate();
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (
    v &&
    typeof v === 'object' &&
    'toDate' in (v as Record<string, unknown>)
  ) {
    const toDate = (v as { toDate: unknown }).toDate;
    if (typeof toDate === 'function') {
      const d = (v as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime()))
        return d.toISOString();
    }
  }
  return '';
}

/**
 * Extracts the bare 11-character YouTube id from any of the common URL forms
 * (watch?v=, youtu.be/, /embed/, /shorts/) or from a bare id.
 * Returns undefined when the input does not contain a valid id.
 */
export function extractYouTubeVideoId(input: string): string | undefined {
  const raw = (input || '').trim();
  if (!raw) return undefined;

  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  if (idPattern.test(raw)) return raw;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return undefined;
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  const candidates: string[] = [];
  if (host === 'youtu.be') {
    if (segments[0]) candidates.push(segments[0]);
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const v = url.searchParams.get('v');
    if (v) candidates.push(v);
    if (
      (segments[0] === 'embed' ||
        segments[0] === 'shorts' ||
        segments[0] === 'v' ||
        segments[0] === 'live') &&
      segments[1]
    ) {
      candidates.push(segments[1]);
    }
  }

  return candidates.find((c) => idPattern.test(c));
}

/** Canonical hqdefault thumbnail for a YouTube id. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** Builds the youtube watch / hosted URL used by the list's "Open" action. */
export function videoWatchUrl(v: VideoDoc): string | undefined {
  if (v.videoType === 'youtube') {
    return v.youtubeVideoId
      ? `https://www.youtube.com/watch?v=${v.youtubeVideoId}`
      : undefined;
  }
  return normString(v.videoUrl);
}

export async function listVideos(): Promise<WithId<VideoDoc>[]> {
  console.log('[videosApi] listVideos start');
  try {
    const q = query(colRef, orderBy('uploadDate', 'desc'));
    const snap = await getDocs(q);
    console.log('[videosApi] listVideos fetched docs', {
      count: snap.size,
      empty: snap.empty,
    });
    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const video: VideoDoc = {
        title: String(data['title'] ?? ''),
        description: normString(data['description']) || '',
        thumbnailUrl: normString(data['thumbnailUrl']) || '',
        uploadDate: normUploadDate(data['uploadDate']),
        uploader: normString(data['uploader']) || '',
        tags: normTags(data['tags']),
        videoType: normVideoType(data['videoType']),
        lyrics: normalizeLyrics(data['lyrics']),
        videoUrl: normString(data['videoUrl']),
        youtubeVideoId: normString(data['youtubeVideoId']),
        channelName: normString(data['channelName']),
      };
      return { id: d.id, ...video } as WithId<VideoDoc>;
    });
    console.log('[videosApi] listVideos success', {
      total: items.length,
      youtube: items.filter((v) => v.videoType === 'youtube').length,
      hosted: items.filter((v) => v.videoType === 'hosted').length,
      ids: items.map((v) => v.id),
    });
    return items;
  } catch (err) {
    console.error('[videosApi] listVideos error', err);
    throw new Error('Failed to list videos');
  }
}

/** Shared field payload, with type-specific keys omitted rather than undefined. */
function buildWritePayload(
  data: VideoDoc,
  useServerTimestamp: boolean = false,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: String(data.title || '').trim(),
    description: String(data.description || '').trim(),
    thumbnailUrl: String(data.thumbnailUrl || '').trim(),
    uploadDate: useServerTimestamp
      ? serverTimestamp()
      : normString(data.uploadDate) || new Date().toISOString(),
    uploader: String(data.uploader || '').trim(),
    tags: (data.tags || []).map((t) => t.trim()).filter(Boolean),
    videoType: normVideoType(data.videoType),
    lyrics: normalizeLyrics(data.lyrics),
  };
  return payload;
}

export async function createVideo(data: VideoDoc): Promise<string> {
  try {
    const toWrite = buildWritePayload(data, true); // Use serverTimestamp for uploadDate
    if (data.videoType === 'youtube') {
      toWrite['youtubeVideoId'] = String(data.youtubeVideoId || '').trim();
      toWrite['channelName'] = String(data.channelName || '').trim();
    } else {
      toWrite['videoUrl'] = String(data.videoUrl || '').trim();
    }
    toWrite['createdAt'] = serverTimestamp();

    const added = await addDoc(colRef, toWrite);
    return added.id;
  } catch (err) {
    console.error('[videosApi] createVideo error', err);
    throw new Error('Failed to create video');
  }
}

/**
 * Updates an existing doc in place (the id never changes). Fields belonging to
 * the other video type are removed so the app never sees a mixed document.
 */
export async function updateVideo(id: string, data: VideoDoc): Promise<void> {
  try {
    const toWrite = buildWritePayload(data, false); // Preserve existing uploadDate
    if (data.videoType === 'youtube') {
      toWrite['youtubeVideoId'] = String(data.youtubeVideoId || '').trim();
      toWrite['channelName'] = String(data.channelName || '').trim();
      toWrite['videoUrl'] = deleteField();
    } else {
      toWrite['videoUrl'] = String(data.videoUrl || '').trim();
      toWrite['youtubeVideoId'] = deleteField();
      toWrite['channelName'] = deleteField();
    }
    toWrite['updatedAt'] = serverTimestamp();

    await updateDoc(doc(colRef, id), toWrite);
  } catch (err) {
    console.error('[videosApi] updateVideo error', err);
    throw new Error('Failed to update video');
  }
}

export async function deleteVideo(id: string): Promise<void> {
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[videosApi] deleteVideo error', err);
    throw new Error('Failed to delete video');
  }
}
