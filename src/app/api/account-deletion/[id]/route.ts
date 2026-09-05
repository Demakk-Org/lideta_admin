import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { NotAdminError, requireAdmin } from '@/lib/server/requireAdmin';
import Logger from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Subcollections the app writes under `users/{uid}`; deleted with the parent. */
const USER_SUBCOLLECTIONS = ['blocked_users', 'daily_verse_reads'];

async function deleteSubcollections(uid: string) {
  for (const name of USER_SUBCOLLECTIONS) {
    const snap = await adminDb
      .collection('users')
      .doc(uid)
      .collection(name)
      .get();
    if (snap.empty) continue;

    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function resolveUid(
  contact: string,
  contactType: 'email' | 'phone',
): Promise<string | undefined> {
  try {
    const user =
      contactType === 'email'
        ? await adminAuth.getUserByEmail(contact)
        : await adminAuth.getUserByPhoneNumber(contact);
    return user.uid;
  } catch {
    // No auth user for that contact — already deleted, or never existed.
    return undefined;
  }
}

/**
 * DELETE /api/account-deletion/[id] — carry out a verified deletion request.
 *
 * Irreversible, so it is gated on a verified administrator session, and it
 * refuses to run on a request still marked `pending`: an administrator has to
 * confirm the requester owns the contact first. If no account matches the
 * contact any more, the request is still closed as completed, with a note.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeName = '[accountDeletionApi] DELETE';
  try {
    const admin = await requireAdmin(routeName);
    const { id } = await params;

    const ref = adminDb.collection('deletion_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    const status = String(data['status'] ?? 'pending');
    if (status === 'completed') {
      return NextResponse.json(
        { error: 'This request was already completed' },
        { status: 409 },
      );
    }
    if (status !== 'verified') {
      return NextResponse.json(
        { error: 'Verify the requester owns this contact first' },
        { status: 409 },
      );
    }

    const contact = String(data['contact'] ?? '');
    const contactType = data['contactType'] === 'phone' ? 'phone' : 'email';
    const uid = await resolveUid(contact, contactType);

    if (!uid) {
      await ref.update({
        status: 'completed',
        handledBy: admin.email ?? admin.uid,
        resolutionNote: 'No account matched this contact; nothing to delete.',
        updatedAt: new Date().toISOString(),
      });
      Logger.info(routeName, 'Closed request with no matching account', { id });
      return NextResponse.json({
        message: 'No account matched this contact. Request closed.',
      });
    }

    await deleteSubcollections(uid);
    await adminDb.collection('users').doc(uid).delete();
    await adminAuth.deleteUser(uid);

    await ref.update({
      status: 'completed',
      deletedUid: uid,
      handledBy: admin.email ?? admin.uid,
      resolutionNote: 'Account and profile data deleted.',
      updatedAt: new Date().toISOString(),
    });

    Logger.info(routeName, 'Account deleted', { id, uid });
    return NextResponse.json({
      deletedUid: uid,
      message: 'Account and profile data deleted.',
    });
  } catch (error) {
    if (error instanceof NotAdminError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    Logger.error(routeName, 'Failed to delete account', {
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to delete the account' },
      { status: 500 },
    );
  }
}
