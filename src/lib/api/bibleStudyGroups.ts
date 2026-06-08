import { db } from '@/lib/firebase/config';
import {
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';

// Mirrors the Flutter `AgeGroup` enum (stored as `.name`).
export enum AgeGroup {
  Children = 'children',
  Youth = 'youth',
  Adults = 'adults',
  All = 'all',
}

// Mirrors the Flutter `GenderGroup` enum (stored as `.name`).
export enum GenderGroup {
  Male = 'male',
  Female = 'female',
  Any = 'any',
}

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  [AgeGroup.Children]: 'Children',
  [AgeGroup.Youth]: 'Youth',
  [AgeGroup.Adults]: 'Adults',
  [AgeGroup.All]: 'All',
};

export const GENDER_GROUP_LABELS: Record<GenderGroup, string> = {
  [GenderGroup.Male]: 'Male',
  [GenderGroup.Female]: 'Female',
  [GenderGroup.Any]: 'Any',
};

export type GPS = { latitude: number; longitude: number };

// Mirrors the Flutter `Location` model embedded in `MeetingDetails`.
export type MeetingLocation = {
  primary: string;
  secondary?: string;
  gps?: GPS | null;
  isOnline?: boolean | null;
};

// Mirrors the Flutter `MeetingDetails` model. `dateStarted` is stored as an ISO
// string (the Dart model writes `toIso8601String()`).
export type MeetingDetails = {
  schedule: string;
  dateStarted: string;
  location: MeetingLocation;
};

// Mirrors the Flutter `BibleStudyGroup` model. `startDate` is held as an ISO
// string in the admin layer and persisted as a Firestore Timestamp.
// `meetingSummaries` is generated at runtime by the app, so it is preserved
// verbatim and starts empty on create.
export type BibleStudyGroup = {
  groupName: string;
  groupImageUrl: string;
  leaderUserId: string;
  membersUserIds: string[];
  meetingDetails: MeetingDetails;
  bibleStudyIds: string[];
  meetingSummaries: unknown[];
  ageGroup: AgeGroup;
  genderGroup: GenderGroup;
  startDate: string;
  isRecruiting: boolean;
  progress: number;
  isActive: boolean;
  completedBibleStudyIds: string[];
  currentStudyIndex: number;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'bible_study_groups');

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function toInt(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v)).filter(Boolean);
  }
  return [];
}

function normalizeTimestampToIso(val: unknown): string | undefined {
  try {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (isRecord(val) && 'seconds' in val && 'nanoseconds' in val) {
      const t = new Timestamp(
        (val as { seconds: number; nanoseconds: number }).seconds,
        (val as { seconds: number; nanoseconds: number }).nanoseconds,
      );
      return t.toDate().toISOString();
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? val : d.toISOString();
    }
  } catch {}
  return undefined;
}

function coerceAgeGroup(val: unknown): AgeGroup {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (
    s === AgeGroup.Children ||
    s === AgeGroup.Youth ||
    s === AgeGroup.Adults ||
    s === AgeGroup.All
  ) {
    return s as AgeGroup;
  }
  return AgeGroup.All;
}

function coerceGenderGroup(val: unknown): GenderGroup {
  const s = typeof val === 'string' ? val.toLowerCase() : '';
  if (s === GenderGroup.Male || s === GenderGroup.Female || s === GenderGroup.Any) {
    return s as GenderGroup;
  }
  return GenderGroup.Any;
}

function mapGps(raw: unknown): GPS | null {
  if (!isRecord(raw)) return null;
  const lat = raw.latitude;
  const lng = raw.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { latitude: lat, longitude: lng };
}

function mapLocation(raw: unknown): MeetingLocation {
  const r = isRecord(raw) ? raw : {};
  return {
    primary: typeof r.primary === 'string' ? r.primary : '',
    secondary:
      typeof r.secondary === 'string' && r.secondary.trim()
        ? r.secondary
        : undefined,
    gps: mapGps(r.gps),
    isOnline: typeof r.isOnline === 'boolean' ? r.isOnline : null,
  };
}

function mapMeetingDetails(raw: unknown): MeetingDetails {
  const r = isRecord(raw) ? raw : {};
  return {
    schedule: typeof r.schedule === 'string' ? r.schedule : '',
    dateStarted: normalizeTimestampToIso(r.dateStarted) ?? '',
    location: mapLocation(r.location),
  };
}

function mapDoc(id: string, data: Record<string, unknown>): WithId<BibleStudyGroup> {
  return {
    id,
    groupName: typeof data.groupName === 'string' ? data.groupName : '',
    groupImageUrl:
      typeof data.groupImageUrl === 'string' ? data.groupImageUrl : '',
    // The Flutter model reads `leader`/`members` but writes
    // `leaderUserId`/`membersUserIds`; accept either.
    leaderUserId:
      typeof data.leader === 'string'
        ? data.leader
        : typeof data.leaderUserId === 'string'
          ? data.leaderUserId
          : '',
    membersUserIds:
      data.members !== undefined
        ? toStringArray(data.members)
        : toStringArray(data.membersUserIds),
    meetingDetails: mapMeetingDetails(data.meetingDetails),
    bibleStudyIds: toStringArray(data.bibleStudyIds),
    meetingSummaries: Array.isArray(data.meetingSummaries)
      ? data.meetingSummaries
      : [],
    ageGroup: coerceAgeGroup(data.ageGroup),
    genderGroup: coerceGenderGroup(data.genderGroup),
    startDate: normalizeTimestampToIso(data.startDate) ?? '',
    isRecruiting: data.isRecruiting === true,
    progress: toInt(data.progress),
    isActive: data.isActive === true,
    completedBibleStudyIds: toStringArray(data.completedBibleStudyIds),
    currentStudyIndex: toInt(data.currentStudyIndex),
  };
}

export async function listBibleStudyGroups(): Promise<
  WithId<BibleStudyGroup>[]
> {
  console.log('[bibleStudyGroupsApi] listBibleStudyGroups: querying...');
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      mapDoc(d.id, d.data() as Record<string, unknown>),
    );
  } catch (err) {
    console.error('[bibleStudyGroupsApi] listBibleStudyGroups error', err);
    throw new Error('Failed to list bible study groups');
  }
}

// Admin-editable fields only. The following are runtime state and are NOT
// inputs here — they default on create and are preserved untouched on update:
// membersUserIds, progress, currentStudyIndex, completedBibleStudyIds,
// meetingSummaries.
export type BibleStudyGroupInput = {
  groupName: string;
  groupImageUrl: string;
  leaderUserId: string;
  meetingDetails: MeetingDetails;
  bibleStudyIds: string[];
  ageGroup: AgeGroup;
  genderGroup: GenderGroup;
  startDate: string; // ISO or datetime-local string
  isRecruiting: boolean;
  isActive: boolean;
};

function toTimestamp(val: string): Timestamp {
  const trimmed = (val ?? '').trim();
  const d = trimmed ? new Date(trimmed) : new Date(NaN);
  return Timestamp.fromDate(isNaN(d.getTime()) ? new Date() : d);
}

function toIsoString(val: string): string {
  const trimmed = (val ?? '').trim();
  if (!trimmed) return new Date().toISOString();
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function sanitizeLocation(loc: MeetingLocation): Record<string, unknown> {
  const gps =
    loc.gps &&
    typeof loc.gps.latitude === 'number' &&
    typeof loc.gps.longitude === 'number'
      ? { latitude: loc.gps.latitude, longitude: loc.gps.longitude }
      : null;
  return {
    primary: (loc.primary ?? '').trim(),
    secondary: loc.secondary?.trim() ? loc.secondary.trim() : null,
    gps,
    isOnline: typeof loc.isOnline === 'boolean' ? loc.isOnline : null,
  };
}

// Shared fields for create and update. Deliberately excludes the runtime
// fields (members, progress, currentStudyIndex, completedBibleStudyIds,
// meetingSummaries) so an update never clobbers them.
function buildPayload(data: BibleStudyGroupInput): Record<string, unknown> {
  const leader = data.leaderUserId.trim();
  return {
    groupName: data.groupName.trim(),
    groupImageUrl: (data.groupImageUrl ?? '').trim(),
    // Write both shapes so the app reads correctly regardless of which keys it
    // expects (its fromJson reads `leader`).
    leader,
    leaderUserId: leader,
    meetingDetails: {
      schedule: data.meetingDetails.schedule.trim(),
      dateStarted: toIsoString(data.meetingDetails.dateStarted),
      location: sanitizeLocation(data.meetingDetails.location),
    },
    bibleStudyIds: (data.bibleStudyIds ?? []).filter(Boolean),
    ageGroup: data.ageGroup,
    genderGroup: data.genderGroup,
    startDate: toTimestamp(data.startDate),
    isRecruiting: data.isRecruiting === true,
    isActive: data.isActive === true,
  };
}

function validate(data: BibleStudyGroupInput) {
  if (!data.groupName.trim()) throw new Error('Group name is required');
  if (!data.leaderUserId.trim()) throw new Error('A leader is required');
  if (!data.meetingDetails.schedule.trim()) {
    throw new Error('Meeting schedule is required');
  }
  if (!data.meetingDetails.location.primary.trim()) {
    throw new Error('Meeting location is required');
  }
}

export async function addBibleStudyGroup(
  data: BibleStudyGroupInput,
): Promise<string> {
  console.log('[bibleStudyGroupsApi] addBibleStudyGroup payload', data);
  try {
    validate(data);
    // Runtime fields start empty/zero; further members join and progress
    // advances in the app, not from the admin. The leader is always seeded as a
    // member.
    const leader = data.leaderUserId.trim();
    const docRef = await addDoc(colRef, {
      ...buildPayload(data),
      members: [leader],
      membersUserIds: [leader],
      meetingSummaries: [],
      completedBibleStudyIds: [],
      progress: 0,
      currentStudyIndex: 0,
    });
    console.log('[bibleStudyGroupsApi] created id', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('[bibleStudyGroupsApi] addBibleStudyGroup error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to add bible study group');
  }
}

export async function updateBibleStudyGroup(
  id: string,
  data: BibleStudyGroupInput,
): Promise<void> {
  console.log('[bibleStudyGroupsApi] updateBibleStudyGroup id', id, 'data', data);
  try {
    validate(data);
    // Keep the leader in the member list without disturbing existing members.
    const leader = data.leaderUserId.trim();
    await updateDoc(doc(colRef, id), {
      ...buildPayload(data),
      members: arrayUnion(leader),
      membersUserIds: arrayUnion(leader),
    });
  } catch (err) {
    console.error('[bibleStudyGroupsApi] updateBibleStudyGroup error', err);
    if (err instanceof Error) throw err;
    throw new Error('Failed to update bible study group');
  }
}

export async function deleteBibleStudyGroup(id: string): Promise<void> {
  console.log('[bibleStudyGroupsApi] deleteBibleStudyGroup id', id);
  try {
    await deleteDoc(doc(colRef, id));
  } catch (err) {
    console.error('[bibleStudyGroupsApi] deleteBibleStudyGroup error', err);
    throw new Error('Failed to delete bible study group');
  }
}
