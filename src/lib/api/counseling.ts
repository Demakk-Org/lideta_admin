import { db, functions } from '@/lib/firebase/config';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { UserRole } from '@/lib/api/users';

// Mirrors cloud_functions functions/src/counseling/shared.ts.
export const COUNSELING_STATUSES = [
  'submitted',
  'assigned',
  'closed',
  'declined',
  'cancelled',
] as const;
export type CounselingStatus = (typeof COUNSELING_STATUSES)[number];

export const DECLINE_REASONS = [
  'needsMoreDetail',
  'outOfScope',
  'duplicate',
  'other',
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  needsMoreDetail: 'Needs more detail',
  outOfScope: 'Out of scope',
  duplicate: 'Duplicate',
  other: 'Other',
};

export const MAX_REASSIGN_REASON = 200;

/** Staff view of a request: an alias, never who the requester is. */
export type CounselingRequest = {
  id: string;
  alias: string;
  category: string | null;
  initialMessage: string;
  status: CounselingStatus;
  assignedCounselorId: string | null;
  counselorName: string | null;
  assignmentVersion: number;
  declineReason: string | null;
  closedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  closedAt: Date | null;
};

export type CounselorOption = { uid: string; name: string; role: UserRole };

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function toRequest(id: string, d: Record<string, unknown>): CounselingRequest {
  const status = (COUNSELING_STATUSES as readonly string[]).includes(
    String(d['status']),
  )
    ? (d['status'] as CounselingStatus)
    : 'submitted';
  return {
    id,
    alias: str(d['alias']) ?? 'Anonymous',
    category: str(d['category']),
    initialMessage: String(d['initialMessage'] ?? ''),
    status,
    assignedCounselorId: str(d['assignedCounselorId']),
    counselorName: str(d['counselorName']),
    assignmentVersion:
      typeof d['assignmentVersion'] === 'number' ? d['assignmentVersion'] : 0,
    declineReason: str(d['declineReason']),
    closedBy: str(d['closedBy']),
    createdAt: toDate(d['createdAt']),
    updatedAt: toDate(d['updatedAt']),
    closedAt: toDate(d['closedAt']),
  };
}

/** Live queue for one status, oldest first (uses the status+createdAt index). */
export function watchRequestsByStatus(
  status: CounselingStatus,
  onData: (items: CounselingRequest[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'counseling_requests'),
    where('status', '==', status),
    orderBy('createdAt'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toRequest(d.id, d.data()))),
    (err) => {
      console.error('[counselingApi] watchRequestsByStatus error', err);
      onError(new Error('Failed to load counseling requests'));
    },
  );
}

/** Users who can be assigned: COUNSELOR or ADMIN. Live, so a demotion shows at once. */
export function watchCounselors(
  onData: (items: CounselorOption[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', [UserRole.Counselor, UserRole.Admin]),
  );
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const name = String(d.get('name') ?? '').trim();
            return {
              uid: d.id,
              name: name || d.id,
              role: d.get('role') as UserRole,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (err) => {
      console.error('[counselingApi] watchCounselors error', err);
      onError(new Error('Failed to load counselors'));
    },
  );
}

// Codes/messages the callables throw on purpose, as admin-facing text.
function friendlyError(err: unknown, fallback: string): Error {
  if (!(err instanceof FirebaseError)) return new Error(fallback);
  if (err.message === 'already-handled') {
    return new Error('Another admin already handled this request.');
  }
  if (err.message === 'stale-assignment') {
    return new Error('This session was reassigned meanwhile. Check the latest counselor and try again.');
  }
  switch (err.code) {
    case 'functions/permission-denied':
      return new Error('Administrator access required.');
    case 'functions/unauthenticated':
      return new Error('Session expired, sign in again.');
    case 'functions/failed-precondition':
    case 'functions/not-found':
    case 'functions/invalid-argument':
      return new Error(err.message);
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
      return new Error('Could not reach the server. Try again.');
    default:
      return new Error(fallback);
  }
}

async function call(name: string, data: Record<string, unknown>, fallback: string) {
  try {
    await httpsCallable(functions, name)(data);
  } catch (err) {
    console.error(`[counselingApi] ${name} error`, err);
    throw friendlyError(err, fallback);
  }
}

export const assignCounselor = (requestId: string, counselorUid: string) =>
  call('assignCounselor', { requestId, counselorUid }, 'Failed to assign the counselor');

export const reassignCounselor = (args: {
  requestId: string;
  counselorUid: string;
  expectedVersion: number;
  reason?: string;
}) =>
  call(
    'reassignCounselor',
    {
      requestId: args.requestId,
      counselorUid: args.counselorUid,
      expectedVersion: args.expectedVersion,
      ...(args.reason?.trim() ? { reason: args.reason.trim() } : {}),
    },
    'Failed to reassign the counselor',
  );

export const declineCounselingRequest = (requestId: string, reason: DeclineReason) =>
  call('declineCounselingRequest', { requestId, reason }, 'Failed to decline the request');

/** Admin fallback; normally the counselor or requester closes. */
export const closeCounseling = (requestId: string) =>
  call('closeCounseling', { requestId }, 'Failed to close the session');
