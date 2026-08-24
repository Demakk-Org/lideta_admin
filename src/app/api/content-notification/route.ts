import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { adminDb, adminMessaging, FieldValue } from '@/lib/firebase/admin';

const PUSH_TOKEN_COLLECTION = 'push_tokens';
const MAX_TOKENS_PER_BATCH = 500;

/**
 * Content kinds an admin can broadcast. The `type` value is what the app reads
 * out of the notification payload to decide where a tap lands, so it must match
 * the client's deep-link registry — same contract the video route already uses.
 */
const CONTENT_TYPES = {
  audio: {
    title: 'New Audio Available',
    body: (t: string) => `Listen to "${t}" now!`,
  },
  news: {
    title: 'New Article Published',
    body: (t: string) => `Read "${t}" now!`,
  },
  event: {
    title: 'New Event Announced',
    body: (t: string) => `Check out "${t}"!`,
  },
  daily_verse: {
    title: 'Verse of the Day',
    body: (t: string) => `Today's verse: ${t}`,
  },
} as const;

type ContentType = keyof typeof CONTENT_TYPES;

type ContentNotificationPayload = {
  type: ContentType;
  id: string;
  title: string;
  imageUrl?: string;
};

function isValidPayload(
  payload: Partial<ContentNotificationPayload>,
): payload is ContentNotificationPayload {
  if (!payload) return false;
  const { type, id, title } = payload;
  return (
    typeof type === 'string' &&
    Object.prototype.hasOwnProperty.call(CONTENT_TYPES, type) &&
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof title === 'string' &&
    title.trim().length > 0
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
  console.info('[contentNotification] Incoming request', { requestId });

  try {
    const body = (await req.json()) as Partial<ContentNotificationPayload>;

    if (!isValidPayload(body)) {
      console.warn('[contentNotification] Invalid payload', { requestId, body });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { type, id, title, imageUrl } = body;
    const copy = CONTENT_TYPES[type];
    const notificationTitle = copy.title;
    const notificationBody = copy.body(title);

    const userIds = await fetchAllUsers();
    console.info('[contentNotification] Fetched users', {
      requestId,
      type,
      userCount: userIds.length,
    });

    const notificationPromises = userIds.map((userId) =>
      adminDb
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .add({
          title: notificationTitle,
          body: notificationBody,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
          imageUrl: imageUrl || null,
          // Canonical `key:value|key:value` shape the app parses.
          deepLink: `type:${type}|id:${id}`,
          type,
          scope: 'personal',
        }),
    );

    await Promise.all(notificationPromises);
    console.info('[contentNotification] Created in-app notifications', {
      requestId,
      type,
      count: notificationPromises.length,
    });

    const tokens = await fetchPushTokens();
    console.info('[contentNotification] Retrieved push tokens', {
      requestId,
      tokenCount: tokens.length,
    });

    if (tokens.length > 0) {
      const message = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        // `type` + `id` say where a tap goes, `title` + `body` are what the user
        // reads. No duplicate keys — the client has one shape to resolve.
        data: {
          type,
          id,
          title: notificationTitle,
          body: notificationBody,
        },
      } as const;

      for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
        const batch = tokens.slice(i, i + MAX_TOKENS_PER_BATCH);
        const response = await adminMessaging.sendEachForMulticast({
          ...message,
          tokens: batch,
        });

        console.info('[contentNotification] Push batch result', {
          requestId,
          batchIndex: i / MAX_TOKENS_PER_BATCH,
          successCount: response.successCount,
          failureCount: response.failureCount,
        });
      }
    } else {
      console.warn('[contentNotification] No push tokens registered', { requestId });
    }

    return NextResponse.json({
      ok: true,
      inAppNotifications: userIds.length,
      pushNotifications: tokens.length,
    });
  } catch (error) {
    console.error('[contentNotification] Failed to send notification', {
      requestId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 },
    );
  }
}
