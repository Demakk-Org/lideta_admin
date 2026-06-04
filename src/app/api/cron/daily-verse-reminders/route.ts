// app/api/cron/daily-verse-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminMessaging } from '@/lib/firebase/admin';

// CHANGE ME — match the actual collection name in your Firestore.
const PUSH_TOKENS_COLLECTION = 'push_tokens';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Per-day cap. Must match `maxRemindCount` in the Flutter cubit
// (lib/features/daily_verse/presentation/bloc/daily_verse_reads_cubit.dart).
// Docs with remindCount > MAX_REMIND_COUNT are skipped to avoid nagging.
// The client also writes remindAt=null in that case (so they wouldn't
// match the cron query anyway), but this check is defense in depth.
const MAX_REMIND_COUNT = 3;

const LOG_PREFIX = '[daily-verse-reminders]';

function log(message: string, meta?: Record<string, unknown>) {
  console.log(`${LOG_PREFIX} ${message}`, meta ? JSON.stringify(meta) : '');
}

function logError(message: string, meta?: Record<string, unknown>) {
  console.error(`${LOG_PREFIX} ${message}`, meta ? JSON.stringify(meta) : '');
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  log('invoked');

  if (
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    logError('unauthorized request — missing or invalid CRON_SECRET');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);

  log('querying due reminders', {
    window: { from: oneDayAgo.toISOString(), to: now.toISOString() },
  });

  let snap;
  try {
    snap = await adminDb
      .collectionGroup('daily_verse_reads')
      .where('decision', '==', 'reminded')
      .where('remindAt', '<=', Timestamp.fromDate(now))
      .where('remindAt', '>=', Timestamp.fromDate(oneDayAgo))
      .limit(500)
      .get();
  } catch (e) {
    logError('query failed', { error: errMessage(e) });
    return NextResponse.json(
      { error: 'query failed', detail: errMessage(e) },
      { status: 500 },
    );
  }

  log('query complete', { matched: snap.size });

  let sent = 0;
  let skippedAlreadyNotified = 0;
  let skippedCapReached = 0;
  let skippedNoTokens = 0;
  const errors: { uid: string; reason: string }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const notifiedAt = data.notifiedAt as Timestamp | undefined;
    const remindAt = data.remindAt as Timestamp | undefined;

    // Only skip if we already notified for this remind time (or a later one).
    // If remindAt is newer than the last notifiedAt, a fresh reminder was
    // scheduled after we last notified — so send again.
    if (
      notifiedAt &&
      remindAt &&
      notifiedAt.toMillis() >= remindAt.toMillis()
    ) {
      skippedAlreadyNotified++;
      continue;
    }

    // Per-day cap: the user has dismissed the reminder too many times
    // today. Don't pester further until the date rolls over.
    const remindCount = (data.remindCount as number | undefined) ?? 0;
    if (remindCount > MAX_REMIND_COUNT) {
      skippedCapReached++;
      continue;
    }

    const uid = doc.ref.parent.parent?.id;
    if (!uid) {
      logError('skipping doc with no parent uid', { docPath: doc.ref.path });
      continue;
    }

    const tokens = await fetchTokensForUser(uid);
    if (tokens.length === 0) {
      skippedNoTokens++;
      log('no tokens for user', { uid });
      continue;
    }

    let sendResults: boolean[];
    try {
      sendResults = await Promise.all(tokens.map((t) => sendOne(uid, t)));
    } catch (e) {
      logError('send threw for user', { uid, error: errMessage(e) });
      errors.push({ uid, reason: errMessage(e) });
      continue;
    }
    const anySucceeded = sendResults.some((ok) => ok);

    if (anySucceeded) {
      await doc.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
      sent++;
      log('reminder sent', { uid, tokenCount: tokens.length });
    } else {
      errors.push({ uid, reason: 'all tokens failed' });
      logError('all tokens failed for user', {
        uid,
        tokenCount: tokens.length,
      });
    }
  }

  const summary = {
    processed: snap.size,
    sent,
    skippedAlreadyNotified,
    skippedCapReached,
    skippedNoTokens,
    errorCount: errors.length,
    durationMs: Date.now() - startedAt,
  };
  log('done', summary);

  return NextResponse.json({ ...summary, errors });
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function fetchTokensForUser(userId: string): Promise<string[]> {
  // Android-only: iOS users get the local OS notification scheduled by
  // the Flutter app's DailyVerseReminderScheduler, which works reliably
  // on iOS. Sending FCM to iOS too would cause duplicate notifications.
  const snap = await adminDb
    .collection(PUSH_TOKENS_COLLECTION)
    .where('userId', '==', userId)
    .where('platform', '==', 'android')
    .get();
  return snap.docs
    .map((d) => d.data().fcmToken as string | undefined)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/** Returns true if delivered, false if token was dead and cleaned up. */
async function sendOne(uid: string, token: string): Promise<boolean> {
  try {
    await adminMessaging.send({
      token,
      notification: {
        title: "Today's verse is waiting",
        body: "Take a moment to read today's daily verse.",
      },
      data: { type: 'daily_verse_reminder' },
      android: {
        priority: 'high',
        notification: {
          channelId: 'daily_verse_reminder',
          sound: 'default',
          visibility: 'public',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            sound: 'default',
            'interruption-level': 'time-sensitive',
          },
        },
      },
    });
    return true;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      // Token is dead — delete from Firestore so we stop retrying it.
      const stale = await adminDb
        .collection(PUSH_TOKENS_COLLECTION)
        .where('fcmToken', '==', token)
        .get();
      await Promise.all(stale.docs.map((d) => d.ref.delete()));
      console.warn(
        `${LOG_PREFIX} removed dead token for ${uid}`,
        JSON.stringify({ code, removed: stale.size }),
      );
      return false;
    }
    logError('FCM send failed', { uid, code, error: errMessage(e) });
    throw e;
  }
}
