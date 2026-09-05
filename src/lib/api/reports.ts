import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

/**
 * A report filed from the mobile app's chat (see MODERATION.md in the app
 * repo). The fields mirror `ContentReport.toJson` there.
 */
export type ReportDoc = {
  reporterUserId: string;
  reportedUserId: string;
  messageId: string;
  groupId: string;
  bibleStudyId: string;
  messageType: string;
  reason: string;
  /** The reported text, or the attachment URLs, copied when it was reported. */
  contentSnapshot?: string;
  note?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  handledBy?: string;
  resolutionNote?: string;
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'reports');

function normalizeStatus(value: unknown): ReportStatus {
  const s = String(value ?? '');
  return s === 'reviewed' || s === 'dismissed' ? s : 'pending';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function listReports(): Promise<WithId<ReportDoc>[]> {
  try {
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        reporterUserId: String(data['reporterUserId'] ?? ''),
        reportedUserId: String(data['reportedUserId'] ?? ''),
        messageId: String(data['messageId'] ?? ''),
        groupId: String(data['groupId'] ?? ''),
        bibleStudyId: String(data['bibleStudyId'] ?? ''),
        messageType: String(data['messageType'] ?? 'text'),
        reason: String(data['reason'] ?? 'other'),
        contentSnapshot: optionalString(data['contentSnapshot']),
        note: optionalString(data['note']),
        status: normalizeStatus(data['status']),
        createdAt: String(data['createdAt'] ?? ''),
        updatedAt: optionalString(data['updatedAt']),
        handledBy: optionalString(data['handledBy']),
        resolutionNote: optionalString(data['resolutionNote']),
      } satisfies WithId<ReportDoc>;
    });
  } catch (err) {
    console.error('[reportsApi] listReports error', err);
    throw new Error('Failed to load reports');
  }
}

export async function updateReport(
  id: string,
  data: Pick<Partial<ReportDoc>, 'status' | 'resolutionNote' | 'handledBy'>,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[reportsApi] updateReport error', err);
    throw new Error('Failed to update the report');
  }
}

/**
 * Removes the reported message itself. Needs the admin SDK, because the client
 * rules only let a message's sender or its group leader delete it.
 */
export async function deleteReportedMessage(id: string): Promise<void> {
  const res = await fetch(`/api/reports/${id}/message`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? 'Failed to delete the message');
  }
}
