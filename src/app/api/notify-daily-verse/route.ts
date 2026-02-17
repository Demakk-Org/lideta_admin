import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { adminDb, adminMessaging } from '@/lib/firebase/admin';

const DAILY_VERSE_COLLECTION = 'daily_verse';
const PUSH_TOKEN_COLLECTION = 'push_tokens';
const MAX_TOKENS_PER_BATCH = 500;
const TIME_ZONE = 'Africa/Addis_Ababa';
const CRON_SECRET = process.env.CRON_SECRET;

function getLocalDateKey() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    key: `${year}-${month}-${day}`,
    year,
    month,
    day,
  };
}

async function fetchTodayVerse(dateKey: string) {
  const verseSnap = await adminDb
    .collection(DAILY_VERSE_COLLECTION)
    .where('display_date_key', '==', dateKey)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  return verseSnap.empty ? undefined : verseSnap.docs[0];
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

function validateCronRequest(req: NextRequest) {
  if (!CRON_SECRET) return true; // allow all if secret not configured
  const headerSecret = req.headers.get('x-cron-secret');
  return headerSecret === CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!validateCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { key } = getLocalDateKey();
    const verseDoc = await fetchTodayVerse(key);

    if (!verseDoc) {
      return NextResponse.json(
        { ok: false, message: 'No daily verse found' },
        { status: 200 },
      );
    }

    const tokens = await fetchPushTokens();
    if (!tokens.length) {
      return NextResponse.json(
        { ok: false, message: 'No push tokens registered' },
        { status: 200 },
      );
    }

    const verse = verseDoc.data() as Record<string, unknown>;
    const reference = verse.reference?.toString() || 'Daily Verse';
    const title = 'Daily reminder to read your Bible';
    const body = `Today's verse: ${reference}, Click to continue!`;

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        type: 'daily_verse',
        book: String((verse as { book?: number }).book ?? 1),
        chapter: String((verse as { chapter?: number }).chapter ?? 1),
        verse: String((verse as { verse?: number }).verse ?? 1),
      },
    } as const;

    for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
      const batch = tokens.slice(i, i + MAX_TOKENS_PER_BATCH);
      await adminMessaging.sendEachForMulticast({
        ...message,
        tokens: batch,
      });
    }

    return NextResponse.json({ ok: true, sent: tokens.length });
  } catch (error) {
    console.error('[notifyDailyVerse] Failed to send notification', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
