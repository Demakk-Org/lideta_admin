import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { NotAdminError, requireAdmin } from '@/lib/server/requireAdmin';
import Logger from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/reports/[id]/message — remove the message a report is about.
 *
 * Client rules only let a message's sender or its group's leader delete it, so
 * an administrator acting on a report needs the admin SDK. The report itself is
 * kept and marked `reviewed`, so the record of what was removed survives.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeName = '[reportsApi] DELETE message';
  try {
    const admin = await requireAdmin(routeName);
    const { id } = await params;

    const ref = adminDb.collection('reports').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    const groupId = String(data['groupId'] ?? '');
    const bibleStudyId = String(data['bibleStudyId'] ?? '');
    const messageId = String(data['messageId'] ?? '');

    if (!groupId || !bibleStudyId || !messageId) {
      return NextResponse.json(
        { error: 'This report does not name a message' },
        { status: 400 },
      );
    }

    await adminDb
      .collection('bible_study_groups')
      .doc(groupId)
      .collection('bible_studies')
      .doc(bibleStudyId)
      .collection('messages')
      .doc(messageId)
      .delete();

    await ref.update({
      status: 'reviewed',
      handledBy: admin.email ?? admin.uid,
      resolutionNote: 'Message deleted.',
      updatedAt: new Date().toISOString(),
    });

    Logger.info(routeName, 'Reported message deleted', { id, messageId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NotAdminError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    Logger.error(routeName, 'Failed to delete reported message', {
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to delete the message' },
      { status: 500 },
    );
  }
}
