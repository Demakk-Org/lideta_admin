import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { adminDb, adminMessaging, FieldValue } from '@/lib/firebase/admin';

const PUSH_TOKEN_COLLECTION = 'push_tokens';
const MAX_TOKENS_PER_BATCH = 500;

type VideoNotificationPayload = {
  videoId: string;
  videoTitle: string;
  videoDescription?: string;
  videoThumbnailUrl?: string;
  videoUrl?: string;
};

function isValidPayload(
  payload: Partial<VideoNotificationPayload>,
): payload is VideoNotificationPayload {
  if (!payload) return false;
  const { videoId, videoTitle } = payload;
  return (
    typeof videoId === 'string' &&
    videoId.trim().length > 0 &&
    typeof videoTitle === 'string' &&
    videoTitle.trim().length > 0
  );
}

async function fetchPushTokens() {
  const tokensSnap = await adminDb.collection(PUSH_TOKEN_COLLECTION).get();
  if (tokensSnap.empty) return [] as string[];

  return Array.from(
    new Set(
      tokensSnap.docs
        .map((doc: QueryDocumentSnapshot) => doc.get('fcmToken'))
        .filter(
          (token: unknown): token is string =>
            typeof token === 'string' && token.length > 0,
        ),
    ),
  );
}

async function fetchAllUsers() {
  const usersSnap = await adminDb.collection('users').get();
  return usersSnap.docs.map((doc) => doc.id);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  console.info('[videoNotification] Incoming request', { requestId });

  try {
    const body = (await req.json()) as Partial<VideoNotificationPayload>;

    if (!isValidPayload(body)) {
      console.warn('[videoNotification] Invalid payload', { requestId, body });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { videoId, videoTitle, videoThumbnailUrl } = body;

    // Fetch all users to send in-app notifications
    const userIds = await fetchAllUsers();
    console.info('[videoNotification] Fetched users', { requestId, userCount: userIds.length });

    // Create in-app notifications for all users
    const notificationPromises = userIds.map((userId) =>
      adminDb
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .add({
          title: 'New Video Available',
          body: `Watch "${videoTitle}" now!`,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
          imageUrl: videoThumbnailUrl || null,
          // Canonical `key:value|key:value` shape the app parses. It used to
          // read `video:<id>`, which the app parsed as a `video` key and no
          // `id`, so every tap fell back to the video list.
          deepLink: `type:video|id:${videoId}`,
          type: 'video',
          scope: 'personal',
        }),
    );

    await Promise.all(notificationPromises);
    console.info('[videoNotification] Created in-app notifications', {
      requestId,
      count: notificationPromises.length,
    });

    // Send push notifications
    const tokens = await fetchPushTokens();
    console.info('[videoNotification] Retrieved push tokens', {
      requestId,
      tokenCount: tokens.length,
    });

    if (tokens.length > 0) {
      const message = {
        notification: {
          title: 'New Video Available',
          body: `Watch "${videoTitle}" now!`,
        },
        // The canonical payload the app resolves: `type` + `id` say where a tap
        // goes, `title` + `body` are what the user reads. Duplicate keys
        // (`videoId`, `videoTitle`, a `deepLink` restating the same ids) only
        // gave the client more shapes to guess between.
        data: {
          type: 'video',
          id: videoId,
          title: 'New Video Available',
          body: `Watch "${videoTitle}" now!`,
        },
      } as const;

      for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
        const batch = tokens.slice(i, i + MAX_TOKENS_PER_BATCH);
        console.info('[videoNotification] Sending push batch', {
          requestId,
          batchIndex: i / MAX_TOKENS_PER_BATCH,
          batchSize: batch.length,
        });

        const response = await adminMessaging.sendEachForMulticast({
          ...message,
          tokens: batch,
        });

        console.info('[videoNotification] Push batch result', {
          requestId,
          batchIndex: i / MAX_TOKENS_PER_BATCH,
          successCount: response.successCount,
          failureCount: response.failureCount,
        });
      }

      console.info('[videoNotification] Push notifications completed', {
        requestId,
        totalTokens: tokens.length,
      });
    } else {
      console.warn('[videoNotification] No push tokens registered', { requestId });
    }

    return NextResponse.json({
      ok: true,
      inAppNotifications: userIds.length,
      pushNotifications: tokens.length,
    });
  } catch (error) {
    console.error('[videoNotification] Failed to send notification', {
      requestId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 },
    );
  }
}
