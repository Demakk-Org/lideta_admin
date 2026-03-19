import { NextRequest, NextResponse } from 'next/server';

import { adminDb, FieldValue } from '@/lib/firebase/admin';

type JoinRequestNotificationPayload = {
  groupId: string;
  groupName: string;
  leaderUserId: string;
  requesterId: string;
  requesterName: string;
};

function isValidPayload(
  payload: Partial<JoinRequestNotificationPayload>,
): payload is JoinRequestNotificationPayload {
  if (!payload) return false;
  const { groupId, groupName, leaderUserId, requesterId, requesterName } =
    payload;
  return [groupId, groupName, leaderUserId, requesterId, requesterName].every(
    (val) => typeof val === 'string' && val.trim().length > 0,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<JoinRequestNotificationPayload>;

    if (!isValidPayload(body)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const leaderNotificationsRef = adminDb
      .collection('users')
      .doc(body.leaderUserId)
      .collection('notifications');

    const title = 'New Bible Study Join Request';
    const bodyText = `${body.requesterName} requested to join ${body.groupName}.`;

    await leaderNotificationsRef.add({
      title,
      body: bodyText,
      createdAt: FieldValue.serverTimestamp(),
      isRead: false,
      imageUrl: null,
      deepLink: null,
      type: 'join_request',
      scope: 'personal',
      status: 'pending',
      groupId: body.groupId,
      groupName: body.groupName,
      leaderUserId: body.leaderUserId,
      requesterId: body.requesterId,
      requesterName: body.requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[notificationApi] Failed to send notification', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 },
    );
  }
}
