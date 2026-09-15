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
type ContentTypeConfig = {
  title: (title: string) => string;
  body: (title: string, detail?: string) => string;
  scope: 'personal' | 'global';
  /**
   * Data-only pushes let the app render its own banner instead of the OS one.
   * Types that predate that contract keep the `notification` block.
   */
  dataOnly?: boolean;
};

const CONTENT_TYPES: Record<string, ContentTypeConfig> = {
  audio: {
    title: () => 'New Audio Available',
    body: (t: string) => `Listen to "${t}" now!`,
    scope: 'personal',
  },
  news: {
    title: () => 'New Article Published',
    body: (t: string) => `Read "${t}" now!`,
    scope: 'personal',
  },
  event: {
    title: () => 'New Event Announced',
    body: (t: string) => `Check out "${t}"!`,
    scope: 'personal',
  },
  course: {
    // Courses carry their own headline and blurb: the title names the course
    // and the body is the course description the admin already wrote.
    title: (t: string) => `New course: ${t}`,
    body: (t: string, detail?: string) =>
      detail?.trim() ? detail.trim() : `Start "${t}" now!`,
    scope: 'global',
    dataOnly: true,
  },
  daily_verse: {
    title: () => 'Verse of the Day',
    body: (t: string) => `Today's verse: ${t}`,
    scope: 'personal',
  },
};

type ContentType = keyof typeof CONTENT_TYPES;

type ContentNotificationPayload = {
  type: ContentType;
  id: string;
  title: string;
  /** Optional detail line; only `course` uses it today (its description). */
  body?: string;
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
    const notificationTitle = copy.title(title);
    const notificationBody = copy.body(title, body.body);

    // Canonical `key:value|key:value` shape the app parses.
    const deepLink = `type:${type}|id:${id}`;
    const record = {
      type,
      title: notificationTitle,
      body: notificationBody,
      deepLink,
      scope: copy.scope,
      isRead: false,
      imageUrl: imageUrl || null,
      createdAt: FieldValue.serverTimestamp(),
    };

    // A global notification is one document every member reads; a personal one
    // is fanned out into each user's own subcollection.
    let inAppNotifications: number;
    if (copy.scope === 'global') {
      await adminDb.collection('notifications').add(record);
      inAppNotifications = 1;
      console.info('[contentNotification] Created global notification', {
        requestId,
        type,
      });
    } else {
      const userIds = await fetchAllUsers();
      console.info('[contentNotification] Fetched users', {
        requestId,
        type,
        userCount: userIds.length,
      });

      await Promise.all(
        userIds.map((userId) =>
          adminDb
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .add(record),
        ),
      );
      inAppNotifications = userIds.length;
      console.info('[contentNotification] Created in-app notifications', {
        requestId,
        type,
        count: inAppNotifications,
      });
    }

    const tokens = await fetchPushTokens();
    console.info('[contentNotification] Retrieved push tokens', {
      requestId,
      tokenCount: tokens.length,
    });

    if (tokens.length > 0) {
      const message = {
        // `type` + `id` say where a tap goes, `title` + `body` are what the user
        // reads. Every value is a string — FCM rejects anything else in `data`.
        data: {
          type: String(type),
          id: String(id),
          title: notificationTitle,
          body: notificationBody,
        },
        // Data-only: the app draws its own banner. Older types still ship the
        // `notification` block so the OS renders one for them.
        ...(copy.dataOnly
          ? {}
          : {
              notification: {
                title: notificationTitle,
                body: notificationBody,
              },
            }),
      };

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
      scope: copy.scope,
      inAppNotifications,
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
