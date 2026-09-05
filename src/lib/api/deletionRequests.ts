import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';

export type DeletionRequestStatus =
  | 'pending'
  | 'verified'
  | 'completed'
  | 'rejected';

export type DeletionScope = 'account' | 'partial';

export type DeletionRequestDoc = {
  /** What the requester typed: an email address or a phone number. */
  contact: string;
  contactType: 'email' | 'phone';
  /** Whole account, or only the items named in `details`. */
  scope: DeletionScope;
  details?: string;
  status: DeletionRequestStatus;
  createdAt: string;
  updatedAt?: string;
  /** Admin who resolved it, and what they concluded. */
  handledBy?: string;
  resolutionNote?: string;
  /** Firebase Auth uid removed when the request was completed. */
  deletedUid?: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'deletion_requests');

function normalizeStatus(value: unknown): DeletionRequestStatus {
  const s = String(value ?? '');
  return s === 'verified' || s === 'completed' || s === 'rejected'
    ? s
    : 'pending';
}

export async function listDeletionRequests(): Promise<
  WithId<DeletionRequestDoc>[]
> {
  try {
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        contact: String(data['contact'] ?? ''),
        contactType: data['contactType'] === 'phone' ? 'phone' : 'email',
        scope: data['scope'] === 'partial' ? 'partial' : 'account',
        details:
          typeof data['details'] === 'string'
            ? (data['details'] as string)
            : undefined,
        status: normalizeStatus(data['status']),
        createdAt: String(data['createdAt'] ?? ''),
        updatedAt:
          typeof data['updatedAt'] === 'string'
            ? (data['updatedAt'] as string)
            : undefined,
        handledBy:
          typeof data['handledBy'] === 'string'
            ? (data['handledBy'] as string)
            : undefined,
        resolutionNote:
          typeof data['resolutionNote'] === 'string'
            ? (data['resolutionNote'] as string)
            : undefined,
        deletedUid:
          typeof data['deletedUid'] === 'string'
            ? (data['deletedUid'] as string)
            : undefined,
      } satisfies WithId<DeletionRequestDoc>;
    });
  } catch (err) {
    console.error('[deletionRequestsApi] listDeletionRequests error', err);
    throw new Error('Failed to load deletion requests');
  }
}

/**
 * Status-only edits (verified / rejected) stay a plain Firestore write. Actually
 * erasing the account goes through the API route instead, because deleting the
 * Firebase Auth user needs the admin SDK.
 */
export async function updateDeletionRequest(
  id: string,
  data: Pick<
    Partial<DeletionRequestDoc>,
    'status' | 'resolutionNote' | 'handledBy'
  >,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'deletion_requests', id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[deletionRequestsApi] updateDeletionRequest error', err);
    throw new Error('Failed to update the request');
  }
}

export type ExecuteDeletionResult = {
  deletedUid?: string;
  message: string;
};

/** Erases the account behind a request: Auth user, profile doc and subtrees. */
export async function executeDeletion(
  id: string,
): Promise<ExecuteDeletionResult> {
  const res = await fetch(`/api/account-deletion/${id}`, { method: 'DELETE' });
  const body = (await res.json()) as ExecuteDeletionResult & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? 'Failed to delete the account');
  }
  return body;
}
