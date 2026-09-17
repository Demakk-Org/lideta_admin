import { db } from '@/lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  APP_SETTINGS_COLLECTION,
  APP_SETTINGS_HISTORY_COLLECTION,
  APP_SETTINGS_PUBLISHED_DOC_ID,
  APP_SETTINGS_VERSIONS_COLLECTION,
} from '@/lib/featureKeys';
import {
  canEditVersion,
  canPublishVersion,
  diffFeatures,
  nextVersionNumber,
  type FeatureChange,
  type RawFeatures,
  type VersionStatus,
} from '@/lib/appSettings/featureRules';

/** `app_settings/published`: what every app user gets. */
export type PublishedSettings = {
  /** False until the seed (or a first publish) has created the document. */
  exists: boolean;
  features: RawFeatures;
  /** The published version number; 0 when nothing is published. */
  version: number;
  /** ISO string of the publish, or null when never published. */
  updatedAt: string | null;
  publishedBy: string | null;
};

/** One entry in `app_settings/published/versions`. */
export type FeatureVersion = {
  version: number;
  status: VersionStatus;
  features: RawFeatures;
  note: string;
  /** The version this one was copied from, if any. */
  basedOn: number | null;
  /** Bumped on every draft save, to catch two admins editing one draft. */
  revision: number;
  createdBy: string;
  createdAt: string | null;
  updatedBy: string;
  updatedAt: string | null;
  /** Set the last time this version was published. */
  publishedBy: string | null;
  publishedAt: string | null;
};

export type PublishHistoryEntry = {
  id: string;
  version: number;
  /** The version that was live before, or null for the first publish. */
  fromVersion: number | null;
  changed: Record<string, FeatureChange>;
  publishedBy: string;
  publishedAt: string | null;
};

/** Someone else changed the data since this page loaded; the admin has to reload. */
export const STALE_VERSION_ERROR = 'StaleVersionError';

const publishedRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_PUBLISHED_DOC_ID);
const versionsRef = collection(publishedRef, APP_SETTINGS_VERSIONS_COLLECTION);
const historyRef = collection(publishedRef, APP_SETTINGS_HISTORY_COLLECTION);

const versionRef = (version: number) => doc(versionsRef, String(version));

function staleError(message: string): Error {
  const error = new Error(message);
  error.name = STALE_VERSION_ERROR;
  return error;
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function readFeatures(data: Record<string, unknown> | undefined): RawFeatures {
  const features = data?.['features'];
  return features && typeof features === 'object' && !Array.isArray(features)
    ? (features as RawFeatures)
    : {};
}

function readInt(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function readStatus(value: unknown): VersionStatus {
  return value === 'published' || value === 'archived' ? value : 'draft';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toVersion(data: Record<string, unknown>): FeatureVersion {
  return {
    version: readInt(data['version']) ?? 0,
    status: readStatus(data['status']),
    features: readFeatures(data),
    note: readString(data['note']),
    basedOn: readInt(data['basedOn']),
    revision: readInt(data['revision']) ?? 0,
    createdBy: readString(data['createdBy']),
    createdAt: toIso(data['createdAt']),
    updatedBy: readString(data['updatedBy']),
    updatedAt: toIso(data['updatedAt']),
    publishedBy: readString(data['publishedBy']) || null,
    publishedAt: toIso(data['publishedAt']),
  };
}

export async function getPublishedSettings(): Promise<PublishedSettings> {
  const snap = await getDoc(publishedRef);
  const data = snap.data();
  return {
    exists: snap.exists(),
    features: readFeatures(data),
    version: readInt(data?.['version']) ?? 0,
    updatedAt: toIso(data?.['updatedAt']),
    publishedBy: readString(data?.['publishedBy']) || null,
  };
}

/** Every version, newest first. */
export async function listFeatureVersions(max = 100): Promise<FeatureVersion[]> {
  const snap = await getDocs(query(versionsRef, orderBy('version', 'desc'), limit(max)));
  return snap.docs.map((d) => toVersion(d.data()));
}

export async function listPublishHistory(max = 10): Promise<PublishHistoryEntry[]> {
  const snap = await getDocs(query(historyRef, orderBy('publishedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      version: readInt(data['version']) ?? 0,
      fromVersion: readInt(data['fromVersion']),
      changed: (data['changed'] ?? {}) as Record<string, FeatureChange>,
      publishedBy: readString(data['publishedBy']),
      publishedAt: toIso(data['publishedAt']),
    };
  });
}

/**
 * Creates a draft holding `features`, numbered one past the newest version.
 * Nothing changes for users until it is published. Resolves to its number.
 */
export async function createDraftVersion({
  features,
  basedOn,
  note,
  uid,
}: {
  features: RawFeatures;
  basedOn: number | null;
  note: string;
  uid: string;
}): Promise<number> {
  const newest = await getDocs(query(versionsRef, orderBy('version', 'desc'), limit(1)));
  const version = nextVersionNumber(newest.docs.map((d) => toVersion(d.data())));
  const ref = versionRef(version);

  await runTransaction(db, async (tx) => {
    // Two admins creating a draft at once would pick the same number.
    if ((await tx.get(ref)).exists()) {
      throw staleError(`Version ${version} was just created by someone else. Try again.`);
    }
    tx.set(ref, {
      version,
      status: 'draft',
      features,
      note,
      basedOn,
      revision: 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  });
  return version;
}

/**
 * Saves a draft's features and note. Aborts with `STALE_VERSION_ERROR` if the
 * draft was saved, published or deleted since the page loaded it.
 */
export async function saveDraftVersion({
  version,
  expectedRevision,
  features,
  note,
  uid,
}: {
  version: number;
  expectedRevision: number;
  features: RawFeatures;
  note: string;
  uid: string;
}): Promise<void> {
  const ref = versionRef(version);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw staleError(`Version ${version} no longer exists. Reload the page.`);
    }
    const current = toVersion(snap.data());
    if (!canEditVersion(current.status)) {
      throw staleError(`Version ${version} is ${current.status} now and can't be edited. Reload the page.`);
    }
    if (current.revision !== expectedRevision) {
      throw staleError(
        `Version ${version} was saved by someone else since you opened it. Reload to see their changes, then try again.`,
      );
    }
    tx.update(ref, {
      features,
      note,
      revision: current.revision + 1,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Makes `version` the one users get, in a single transaction: copies its
 * features into `app_settings/published`, marks it published, archives the
 * version that was live, and logs the publish.
 *
 * Aborts with `STALE_VERSION_ERROR` if the published version is no longer
 * `expectedPublishedVersion` (0 = nothing published).
 */
export async function publishFeatureVersion({
  version,
  expectedPublishedVersion,
  uid,
}: {
  version: number;
  expectedPublishedVersion: number;
  uid: string;
}): Promise<void> {
  const ref = versionRef(version);
  await runTransaction(db, async (tx) => {
    const publishedSnap = await tx.get(publishedRef);
    const currentPublished = readInt(publishedSnap.data()?.['version']) ?? 0;
    if (currentPublished !== expectedPublishedVersion) {
      throw staleError(
        `Version ${currentPublished} was published by someone else since this page loaded. Reload, then try again.`,
      );
    }

    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw staleError(`Version ${version} no longer exists. Reload the page.`);
    }
    const target = toVersion(snap.data());
    if (!canPublishVersion(target.status)) {
      throw staleError(`Version ${version} is already published.`);
    }

    // All reads must happen before the first write.
    const previousRef = currentPublished > 0 ? versionRef(currentPublished) : null;
    const previousExists = previousRef ? (await tx.get(previousRef)).exists() : false;

    tx.set(publishedRef, {
      features: target.features,
      version,
      updatedAt: serverTimestamp(),
      publishedBy: uid,
    });
    tx.update(ref, {
      status: 'published',
      publishedBy: uid,
      publishedAt: serverTimestamp(),
    });
    if (previousRef && previousExists) {
      tx.update(previousRef, { status: 'archived' });
    }
    tx.set(doc(historyRef), {
      version,
      fromVersion: currentPublished > 0 ? currentPublished : null,
      changed: diffFeatures(readFeatures(publishedSnap.data()), target.features),
      publishedBy: uid,
      publishedAt: serverTimestamp(),
    });
  });
}

/** Deletes a draft. The rules refuse to delete a published or archived version. */
export async function deleteDraftVersion(version: number): Promise<void> {
  await deleteDoc(versionRef(version));
}
