import { db } from '@/lib/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';
import { recountBibleStudyCategoryCounts } from '@/lib/api/bibleStudyCategories';

// Best-effort: keep category.studyCount accurate after a study mutation. A
// recount failure must not fail the primary write that already succeeded.
async function syncCategoryCounts(): Promise<void> {
  try {
    await recountBibleStudyCategoryCounts();
  } catch (err) {
    console.error('[bibleStudiesApi] syncCategoryCounts error', err);
  }
}

// Mirrors the Flutter `StudyMaterialType` enum (stored as `.name`).
export enum StudyMaterialType {
  Audio = 'audio',
  Pdf = 'pdf',
  Video = 'video',
  Link = 'link',
  Image = 'image',
}

export const STUDY_MATERIAL_TYPE_LABELS: Record<StudyMaterialType, string> = {
  [StudyMaterialType.Audio]: 'Audio',
  [StudyMaterialType.Pdf]: 'PDF',
  [StudyMaterialType.Video]: 'Video',
  [StudyMaterialType.Link]: 'Link',
  [StudyMaterialType.Image]: 'Image',
};

// Mirrors the Flutter `StudyMaterial` model.
export type StudyMaterial = {
  thumbnailUrl: string;
  title: string;
  downloadUrl: string;
  type: StudyMaterialType;
};

// Mirrors the Flutter `Verse` model (stored with snake_case keys).
export type Verse = {
  bookName: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

export function verseReference(v: Verse): string {
  const name = v.bookName.trim();
  return `${name ? name + ' ' : ''}${v.chapter}:${v.verse}`;
}

// Mirrors the Flutter `StudyPlan` model.
export type StudyPlan = {
  title: string;
  description: string;
  materials: StudyMaterial[];
  keyVerses: Verse[];
  discussionQuestions: string[];
};

// Mirrors the Flutter `BibleStudy` model. `title` is a derived convenience
// field (= `topicTitle`) consumed by the quizzes feature; it is never written.
// The category is stored as a reference (`bibleStudyCategories/{id}`) — only the
// id is persisted; the category details are resolved separately.
export type BibleStudy = {
  title: string;
  topicTitle: string;
  description: string;
  hasQuiz: boolean;
  materials: StudyMaterial[];
  keyVerses: Verse[];
  categoryId: string;
  studyPlans: StudyPlan[];
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'bible_studies');

function coerceMaterialType(val: unknown): StudyMaterialType {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  switch (s) {
    case StudyMaterialType.Audio:
    case StudyMaterialType.Pdf:
    case StudyMaterialType.Video:
    case StudyMaterialType.Link:
    case StudyMaterialType.Image:
      return s as StudyMaterialType;
    default:
      return StudyMaterialType.Link;
  }
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function mapMaterial(raw: unknown): StudyMaterial {
  const r = isRecord(raw) ? raw : {};
  return {
    thumbnailUrl: typeof r.thumbnailUrl === 'string' ? r.thumbnailUrl : '',
    title: typeof r.title === 'string' ? r.title : '',
    downloadUrl: typeof r.downloadUrl === 'string' ? r.downloadUrl : '',
    type: coerceMaterialType(r.type),
  };
}

function toInt(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function mapVerse(raw: unknown): Verse {
  const r = isRecord(raw) ? raw : {};
  return {
    bookName: typeof r.book_name === 'string' ? r.book_name : '',
    book: toInt(r.book),
    chapter: toInt(r.chapter),
    verse: toInt(r.verse),
    text: typeof r.text === 'string' ? r.text : '',
  };
}

function mapStudyPlan(raw: unknown): StudyPlan {
  const r = isRecord(raw) ? raw : {};
  return {
    title: typeof r.title === 'string' ? r.title : '',
    description: typeof r.description === 'string' ? r.description : '',
    materials: Array.isArray(r.materials) ? r.materials.map(mapMaterial) : [],
    keyVerses: Array.isArray(r.keyVerses) ? r.keyVerses.map(mapVerse) : [],
    discussionQuestions: Array.isArray(r.discussionQuestions)
      ? r.discussionQuestions.map((x) => String(x))
      : [],
  };
}

// Resolves the category reference id from a stored study doc. Prefers the new
// `categoryId` field, falling back to the id embedded in the legacy `category`
// object so studies written before the migration keep resolving.
export function readCategoryId(data: Record<string, unknown>): string {
  if (typeof data.categoryId === 'string' && data.categoryId.trim()) {
    return data.categoryId;
  }
  const cat = data.category;
  if (isRecord(cat) && typeof cat.id === 'string') return cat.id;
  return '';
}

function mapDoc(id: string, data: Record<string, unknown>): WithId<BibleStudy> {
  const topicTitle =
    typeof data.topicTitle === 'string' && data.topicTitle.trim()
      ? data.topicTitle
      : typeof data.title === 'string'
        ? data.title
        : '';
  return {
    id,
    title: topicTitle,
    topicTitle,
    description: typeof data.description === 'string' ? data.description : '',
    hasQuiz: data.hasQuiz === true,
    materials: Array.isArray(data.materials)
      ? data.materials.map(mapMaterial)
      : [],
    keyVerses: Array.isArray(data.keyVerses)
      ? data.keyVerses.map(mapVerse)
      : [],
    categoryId: readCategoryId(data),
    studyPlans: Array.isArray(data.studyPlans)
      ? data.studyPlans.map(mapStudyPlan)
      : [],
  };
}

export async function listBibleStudies(): Promise<WithId<BibleStudy>[]> {
  console.log('[bibleStudiesApi] listBibleStudies: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.error('[bibleStudiesApi] listBibleStudies error', err);
    throw new Error('Failed to list bible studies');
  }
}

// `hasQuiz` and `studyPlans` are intentionally not inputs here:
// - `hasQuiz` starts `false` on create and is only flipped by the quiz flow.
// - `studyPlans` are managed separately (see listStudyPlans/saveStudyPlans),
//   so a study form submit must never overwrite them.
export type BibleStudyInput = {
  topicTitle: string;
  description: string;
  materials: StudyMaterial[];
  keyVerses: Verse[];
  categoryId: string;
};

function verseHasContent(v: Verse): boolean {
  return Boolean(v.chapter || v.verse || v.text.trim() || v.bookName.trim());
}

function materialHasContent(m: StudyMaterial): boolean {
  return Boolean(m.title.trim() || m.downloadUrl.trim());
}

function sanitizeVerse(v: Verse): Record<string, unknown> {
  return {
    book_name: (v.bookName ?? '').trim(),
    book: toInt(v.book),
    chapter: toInt(v.chapter),
    verse: toInt(v.verse),
    text: (v.text ?? '').trim(),
  };
}

function sanitizeMaterial(m: StudyMaterial): StudyMaterial {
  return {
    thumbnailUrl: (m.thumbnailUrl ?? '').trim(),
    title: (m.title ?? '').trim(),
    downloadUrl: (m.downloadUrl ?? '').trim(),
    type: coerceMaterialType(m.type),
  };
}

function sanitizeStudyPlan(p: StudyPlan): Record<string, unknown> {
  return {
    title: (p.title ?? '').trim(),
    description: (p.description ?? '').trim(),
    materials: (p.materials ?? []).filter(materialHasContent).map(sanitizeMaterial),
    keyVerses: (p.keyVerses ?? []).filter(verseHasContent).map(sanitizeVerse),
    discussionQuestions: (p.discussionQuestions ?? [])
      .map((q) => q.trim())
      .filter(Boolean),
  };
}

function studyPlanHasContent(p: Record<string, unknown>): boolean {
  return Boolean(
    (p.title as string) ||
      (p.description as string) ||
      (p.materials as unknown[]).length ||
      (p.keyVerses as unknown[]).length ||
      (p.discussionQuestions as unknown[]).length,
  );
}

// Shared fields for create and update. Deliberately excludes `hasQuiz` and
// `studyPlans` so an update never clobbers the quiz flag or the separately
// managed study plans.
function buildPayload(data: BibleStudyInput): Record<string, unknown> {
  return {
    topicTitle: data.topicTitle.trim(),
    description: data.description.trim(),
    materials: (data.materials ?? [])
      .filter(materialHasContent)
      .map(sanitizeMaterial),
    keyVerses: (data.keyVerses ?? []).filter(verseHasContent).map(sanitizeVerse),
    categoryId: data.categoryId.trim(),
  };
}

function validate(data: BibleStudyInput) {
  if (!data.topicTitle.trim()) throw new Error('Topic title is required');
  if (!data.description.trim()) throw new Error('Description is required');
  if (!data.categoryId.trim()) throw new Error('A category is required');
}

export async function addBibleStudy(data: BibleStudyInput): Promise<string> {
  console.log('[bibleStudiesApi] addBibleStudy payload', data);
  try {
    validate(data);
    // New studies start without a quiz and with no study plans; both are managed
    // by their own flows afterwards.
    const docRef = await addDoc(colRef, {
      ...buildPayload(data),
      hasQuiz: false,
      studyPlans: [],
    });
    console.log('[bibleStudiesApi] created id', docRef.id);
    await syncCategoryCounts();
    return docRef.id;
  } catch (err) {
    console.error('[bibleStudiesApi] addBibleStudy error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add bible study');
  }
}

export async function updateBibleStudy(
  id: string,
  data: BibleStudyInput,
): Promise<void> {
  console.log('[bibleStudiesApi] updateBibleStudy id', id, 'data', data);
  try {
    validate(data);
    // Write the new `categoryId` and drop any legacy embedded `category` object
    // left over from before the migration.
    await updateDoc(doc(colRef, id), {
      ...buildPayload(data),
      category: deleteField(),
    });
    await syncCategoryCounts();
  } catch (err) {
    console.error('[bibleStudiesApi] updateBibleStudy error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update bible study');
  }
}

/** Reads just the `studyPlans` array of one study, fresh from Firestore. */
export async function listStudyPlans(studyId: string): Promise<StudyPlan[]> {
  console.log('[bibleStudiesApi] listStudyPlans id', studyId);
  try {
    const snap = await getDoc(doc(colRef, studyId));
    if (!snap.exists()) return [];
    const data = snap.data() as Record<string, unknown>;
    return Array.isArray(data.studyPlans)
      ? data.studyPlans.map(mapStudyPlan)
      : [];
  } catch (err) {
    console.error('[bibleStudiesApi] listStudyPlans error', err);
    throw new Error('Failed to load study plans');
  }
}

/** Overwrites a study's `studyPlans` array (only that field is written). */
export async function saveStudyPlans(
  studyId: string,
  plans: StudyPlan[],
): Promise<void> {
  console.log('[bibleStudiesApi] saveStudyPlans id', studyId, 'count', plans.length);
  try {
    const sanitized = plans.map(sanitizeStudyPlan).filter(studyPlanHasContent);
    await updateDoc(doc(colRef, studyId), { studyPlans: sanitized });
  } catch (err) {
    console.error('[bibleStudiesApi] saveStudyPlans error', err);
    throw new Error('Failed to save study plans');
  }
}

export async function deleteBibleStudy(id: string): Promise<void> {
  console.log('[bibleStudiesApi] deleteBibleStudy id', id);
  try {
    await deleteDoc(doc(colRef, id));
    await syncCategoryCounts();
  } catch (err) {
    console.error('[bibleStudiesApi] deleteBibleStudy error', err);
    throw new Error('Failed to delete bible study');
  }
}
