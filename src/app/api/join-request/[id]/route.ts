import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase/admin';

type ResolveJoinRequestPayload = {
  groupId: string;
  leaderUserId: string;
  status: 'approved' | 'rejected';
  groupName?: string;
  requesterName?: string;
  responseNote?: string;
};

function isValidPayload(
  payload: Partial<ResolveJoinRequestPayload>,
): payload is ResolveJoinRequestPayload {
  if (!payload) return false;

  const requiredStrings = [payload.groupId, payload.leaderUserId];
  const hasRequiredStrings = requiredStrings.every(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );

  const isValidStatus =
    payload.status === 'approved' || payload.status === 'rejected';

  return hasRequiredStrings && isValidStatus;
}

function buildDeepLink(groupId: string, requesterId: string, status: string) {
  return `group:${groupId}|requester:${requesterId}|status:${status}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leaderNotificationId } = await params;
    const body = (await req.json()) as Partial<ResolveJoinRequestPayload>;

    if (!leaderNotificationId || typeof leaderNotificationId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid notification id' },
        { status: 400 },
      );
    }

    if (!isValidPayload(body)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const leaderNotificationsRef = adminDb
      .collection('users')
      .doc(body.leaderUserId)
      .collection('notifications');

    await adminDb.runTransaction(async (tx) => {
      const leaderNotificationRef =
        leaderNotificationsRef.doc(leaderNotificationId);
      const leaderNotificationSnap = await tx.get(leaderNotificationRef);

      if (!leaderNotificationSnap.exists) {
        throw new Error('LEADER_NOTIFICATION_NOT_FOUND');
      }

      const leaderNotificationData = leaderNotificationSnap.data() as {
        requesterId?: string;
        groupId?: string;
      };

      const requesterId = leaderNotificationData.requesterId;
      if (!requesterId || typeof requesterId !== 'string') {
        throw new Error('REQUESTER_NOT_FOUND_ON_NOTIFICATION');
      }

      if (leaderNotificationData.groupId !== body.groupId) {
        throw new Error('GROUP_MISMATCH');
      }

      const joinRequestRef = adminDb
        .collection('bible_study_groups')
        .doc(body.groupId)
        .collection('join_requests')
        .doc(requesterId);

      const joinRequestSnap = await tx.get(joinRequestRef);

      if (!joinRequestSnap.exists) {
        throw new Error('JOIN_REQUEST_NOT_FOUND');
      }

      const joinRequestData = joinRequestSnap.data() as {
        status?: string;
        groupName?: string;
        requesterName?: string;
      };

      if (joinRequestData.status && joinRequestData.status !== 'pending') {
        throw new Error('JOIN_REQUEST_ALREADY_RESOLVED');
      }

      const finalStatus = body.status;
      const groupName = body.groupName ?? joinRequestData.groupName ?? 'Group';
      const requesterName =
        body.requesterName ?? joinRequestData.requesterName ?? 'Member';
      const requesterNotificationsRef = adminDb
        .collection('users')
        .doc(requesterId)
        .collection('notifications');
      const requesterNotificationRef = requesterNotificationsRef.doc();

      tx.set(
        joinRequestRef,
        {
          status: finalStatus,
          respondedBy: body.leaderUserId,
          respondedAt: FieldValue.serverTimestamp(),
          responseNote: body.responseNote ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(
        leaderNotificationRef,
        {
          status: finalStatus,
          body:
            finalStatus === 'approved'
              ? `${requesterName} has been approved to join ${groupName}.`
              : `${requesterName} has been rejected from joining ${groupName}.`,
          deepLink: buildDeepLink(body.groupId, requesterId, finalStatus),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(requesterNotificationRef, {
        title:
          finalStatus === 'approved'
            ? 'Join Request Approved'
            : 'Join Request Rejected',
        body:
          finalStatus === 'approved'
            ? `Your request to join ${groupName} was approved.`
            : `Your request to join ${groupName} was rejected.`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isRead: false,
        imageUrl: null,
        deepLink: buildDeepLink(body.groupId, requesterId, finalStatus),
        type: 'join_request',
        scope: 'personal',
        status: finalStatus,
        groupId: body.groupId,
        groupName,
        leaderUserId: body.leaderUserId,
        requesterId,
        requesterName,
        joinRequestId: requesterId,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'LEADER_NOTIFICATION_NOT_FOUND'
    ) {
      return NextResponse.json(
        { error: 'Leader notification not found' },
        { status: 404 },
      );
    }

    if (
      error instanceof Error &&
      error.message === 'REQUESTER_NOT_FOUND_ON_NOTIFICATION'
    ) {
      return NextResponse.json(
        { error: 'Requester is missing on leader notification' },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === 'GROUP_MISMATCH') {
      return NextResponse.json(
        { error: 'Notification group does not match payload group' },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === 'JOIN_REQUEST_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Join request not found' },
        { status: 404 },
      );
    }

    if (
      error instanceof Error &&
      error.message === 'JOIN_REQUEST_ALREADY_RESOLVED'
    ) {
      return NextResponse.json(
        { error: 'Join request has already been resolved' },
        { status: 409 },
      );
    }

    console.error('[joinRequestApi] Failed to resolve join request', error);
    return NextResponse.json(
      { error: 'Failed to resolve join request' },
      { status: 500 },
    );
  }
}
