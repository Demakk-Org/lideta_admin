import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase/admin';
import Logger from '@/lib/utils/logger';

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

function buildDeepLink(
  groupId: string,
  requesterId: string,
  status: string,
  leaderId: string,
) {
  return `group:${groupId}|requester:${requesterId}|leader:${leaderId}|status:${status}`;
}

function getDeepLinkValues(deepLink: string) {
  const [groupId, requesterId, leaderId, status] = deepLink.split('|');
  return {
    groupId: groupId.replace('group:', ''),
    requesterId: requesterId.replace('requester:', ''),
    status: status?.replace('status:', ''),
    leaderId: leaderId.replace('leader:', ''),
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeName = '[joinRequestApi] PATCH';
  try {
    const { id: leaderNotificationId } = await params;
    const body = (await req.json()) as Partial<ResolveJoinRequestPayload>;

    Logger.info(routeName, 'Incoming resolve join request', {
      leaderNotificationId,
      groupId: body.groupId,
      leaderUserId: body.leaderUserId,
      status: body.status,
    });

    if (!leaderNotificationId || typeof leaderNotificationId !== 'string') {
      Logger.error(routeName, 'Invalid notification id', {
        leaderNotificationId,
      });
      return NextResponse.json(
        { error: 'Invalid notification id' },
        { status: 400 },
      );
    }

    if (!isValidPayload(body)) {
      Logger.error(routeName, 'Invalid payload', {
        hasGroupId: typeof body.groupId === 'string',
        hasLeaderUserId: typeof body.leaderUserId === 'string',
        status: body.status,
      });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const leaderNotificationsRef = adminDb
      .collection('users')
      .doc(body.leaderUserId)
      .collection('notifications');

    let updatedLeaderNotification: Record<string, unknown> | null = null;

    await adminDb.runTransaction(async (tx) => {
      const leaderNotificationRef =
        leaderNotificationsRef.doc(leaderNotificationId);
      const leaderNotificationSnap = await tx.get(leaderNotificationRef);

      Logger.info(routeName, 'Fetched leader notification', {
        leaderNotificationId,
        exists: leaderNotificationSnap.exists,
      });

      if (!leaderNotificationSnap.exists) {
        throw new Error('LEADER_NOTIFICATION_NOT_FOUND');
      }

      const leaderNotificationData = getDeepLinkValues(
        leaderNotificationSnap.data()?.deepLink || '',
      );

      const requesterId = leaderNotificationData.requesterId;
      if (!requesterId || typeof requesterId !== 'string') {
        throw new Error('REQUESTER_NOT_FOUND_ON_NOTIFICATION');
      }

      Logger.info(routeName, 'Resolved requester from leader notification', {
        requesterId,
      });

      if (leaderNotificationData.groupId !== body.groupId) {
        throw new Error('GROUP_MISMATCH');
      }

      const joinRequestRef = adminDb
        .collection('bible_study_groups')
        .doc(body.groupId)
        .collection('join_requests')
        .doc(requesterId);

      const joinRequestSnap = await tx.get(joinRequestRef);

      Logger.info(routeName, 'Fetched join request', {
        requesterId,
        groupId: body.groupId,
        exists: joinRequestSnap.exists,
      });

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

      Logger.info(routeName, 'Prepared transaction updates', {
        requesterId,
        finalStatus,
      });

      // update the join request in the group
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

      // update the notification of the leader with it's response

      let updatedBodyText =
        finalStatus === 'approved'
          ? `${requesterName} has been approved to join ${groupName}.`
          : `${requesterName} has been rejected from joining ${groupName}.`;
      let updatedDeepLink = buildDeepLink(
        body.groupId,
        requesterId,
        finalStatus,
        body.leaderUserId,
      );
      tx.set(
        leaderNotificationRef,
        {
          status: finalStatus,
          body: updatedBodyText,
          deepLink: updatedDeepLink,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      updatedLeaderNotification = {
        id: leaderNotificationRef.id,
        ...(leaderNotificationSnap.data() ?? {}),
        status: finalStatus,
        body: updatedBodyText,
        deepLink: updatedDeepLink,
        isRead: true,
        updatedAt: new Date().toISOString(),
      };

      // add requester to group members if approved
      if (finalStatus === 'approved') {
        const groupRef = adminDb
          .collection('bible_study_groups')
          .doc(body.groupId);
        tx.update(groupRef, {
          members: FieldValue.arrayUnion(requesterId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        Logger.info(routeName, 'Adding member to group', {
          groupId: body.groupId,
          requesterId,
        });
      }

      // send a response notification to the requester
      tx.set(requesterNotificationRef, {
        title:
          finalStatus === 'approved'
            ? 'Join Request Approved'
            : 'Join Request Rejected',
        body:
          finalStatus === 'approved'
            ? `Your request to join ${groupName} was approved.`
            : `Your request to join ${groupName} was rejected.`,
        isRead: false,
        imageUrl: null,
        deepLink: buildDeepLink(
          body.groupId,
          requesterId,
          finalStatus,
          body.leaderUserId,
        ),
        type: 'join_request',
        scope: 'personal',
        createdAt: FieldValue.serverTimestamp(),
      });

      Logger.info(routeName, 'Queued notification updates in transaction', {
        leaderNotificationId,
        requesterId,
        finalStatus,
      });
    });

    Logger.info(routeName, 'Join request resolved successfully', {
      leaderNotificationId,
      groupId: body.groupId,
      status: body.status,
    });

    Logger.info(routeName, 'Returning updated leader notification', {
      leaderNotificationId,
      hasPayload: Boolean(updatedLeaderNotification),
    });

    return NextResponse.json({
      ok: true,
      notification: updatedLeaderNotification,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'LEADER_NOTIFICATION_NOT_FOUND'
    ) {
      Logger.error(routeName, 'Leader notification not found', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Leader notification not found' },
        { status: 404 },
      );
    }

    if (
      error instanceof Error &&
      error.message === 'REQUESTER_NOT_FOUND_ON_NOTIFICATION'
    ) {
      Logger.error(routeName, 'Requester missing on leader notification', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Requester is missing on leader notification' },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === 'GROUP_MISMATCH') {
      Logger.error(routeName, 'Notification group mismatch', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Notification group does not match payload group' },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === 'JOIN_REQUEST_NOT_FOUND') {
      Logger.error(routeName, 'Join request not found', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Join request not found' },
        { status: 404 },
      );
    }

    if (
      error instanceof Error &&
      error.message === 'JOIN_REQUEST_ALREADY_RESOLVED'
    ) {
      Logger.error(routeName, 'Join request already resolved', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Join request has already been resolved' },
        { status: 409 },
      );
    }

    Logger.error(routeName, 'Failed to resolve join request', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to resolve join request' },
      { status: 500 },
    );
  }
}
