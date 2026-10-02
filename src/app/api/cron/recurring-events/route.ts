// app/api/cron/recurring-events/route.ts
/**
 * Day-of reminders for events — docs/RECURRING_EVENTS_V4_PLAN.md §5.
 *
 * Covers BOTH kinds, because they fail the member in opposite ways. A weekly
 * service is habitual and barely needs reminding; a one-off conference
 * announced three weeks ahead is exactly what gets forgotten, and its creation
 * push was the only notice anyone got. So a one-off event is treated here as a
 * series with a single occurrence.
 *
 * **This route must never write dates.** Under the V4 anchor model
 * `start_date_time` is occurrence 1 for the life of the series and every later
 * date is derived from it at read time, by the app and by the dashboard's
 * preview alike. Advancing the anchor would renumber every occurrence and make
 * the dates already behind it underivable (§1). The only field written here is
 * the reminder dedupe key.
 *
 * Shape follows the daily-verse sibling: an external scheduler (cron-job.org)
 * POSTs here with `Bearer ${CRON_SECRET}`, once a day at 03:00 Africa/Addis_Ababa.
 * The schedule lives outside the repo; nothing in here records what is
 * registered.
 *
 * The scheduler retries failed executions, so the route runs twice for the same
 * tick. `reminded_ymd` is what stops a duplicate push, and it is claimed inside
 * a transaction so two concurrent ticks cannot both send.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

import { adminDb, adminMessaging, FieldValue } from '@/lib/firebase/admin';
import { atAddisTime, ymdInAddis } from '@/lib/events/recurrence';
import type { Recurrence } from '@/lib/events/recurrence';
import { addisClock } from '@/lib/events/recurrenceForm';
import { isDueOnTick, occurrenceOn } from '@/lib/events/reminders';
import type { ReminderLead } from '@/lib/events/reminders';

const PUSH_TOKENS_COLLECTION = 'push_tokens';

/** FCM's per-multicast ceiling. */
const MAX_TOKENS_PER_BATCH = 500;

/** Bounds the tick: cron-job.org treats a slow response as a failed execution. */
const MAX_EVENTS = 500;

/**
 * Which pass this invocation is, taken from `?lead=`:
 *
 *   lead=1  registered for 14:00 Addis — important events, reminded the day before
 *   lead=0  registered for 08:00 Addis — every other event, on the morning of
 *
 * Two registrations against one route rather than two routes: the selection
 * rule (`isDueOnTick`) is what differs, and keeping it in one place is what
 * stops an event being reminded by both.
 */
function readLead(req: NextRequest): ReminderLead {
  return req.nextUrl.searchParams.get('lead') === '1' ? 1 : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const LOG_PREFIX = '[event-reminders]';

function log(message: string, meta?: Record<string, unknown>) {
  console.log(`${LOG_PREFIX} ${message}`, meta ? JSON.stringify(meta) : '');
}

function logError(message: string, meta?: Record<string, unknown>) {
  console.error(`${LOG_PREFIX} ${message}`, meta ? JSON.stringify(meta) : '');
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  log('invoked');

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse rather than fall open: an unauthenticated route here can push to
    // every registered device.
    logError('CRON_SECRET is not configured');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    logError('unauthorized request — missing or invalid CRON_SECRET');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const lead = readLead(req);
  // The day whose occurrences are being reminded about, on the church clock.
  const targetYmd = ymdInAddis(new Date(now.getTime() + lead * DAY_MS));

  log('tick', { now: now.toISOString(), targetYmd, lead });

  // The target day on the church clock. Addis is UTC+3 with no DST, so the day
  // starts at 21:00 UTC the evening before — which is why this cannot be a
  // plain UTC date boundary.
  const dayStart = atAddisTime(new Date(now.getTime() + lead * DAY_MS), 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  let candidates: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    // Two queries, because one cannot answer both halves. A recurring series is
    // found by its flag and expanded by rule — its stored date is the anchor,
    // usually nowhere near today. A one-off event is found by its date alone.
    const [recurring, dated] = await Promise.all([
      adminDb
        .collection('events')
        .where('recurrence_active', '==', true)
        .limit(MAX_EVENTS)
        .get(),
      adminDb
        .collection('events')
        .where('start_date_time', '>=', Timestamp.fromDate(dayStart))
        .where('start_date_time', '<', Timestamp.fromDate(dayEnd))
        .limit(MAX_EVENTS)
        .get(),
    ]);

    // A recurring anchor can also fall inside the target day; the flag query
    // already owns it, so dedupe by id and let the recurring path handle it.
    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const d of recurring.docs) byId.set(d.id, d);
    for (const d of dated.docs) if (!byId.has(d.id)) byId.set(d.id, d);
    candidates = [...byId.values()];

    log('query complete', {
      recurring: recurring.size,
      datedOnTargetDay: dated.size,
      matched: candidates.length,
    });
  } catch (e) {
    logError('query failed', { error: errMessage(e) });
    return NextResponse.json(
      { error: 'query failed', detail: errMessage(e) },
      { status: 500 },
    );
  }

  let sent = 0;
  let skippedNotDue = 0;
  let skippedAlreadyReminded = 0;
  let skippedFinished = 0;
  let skippedUnusable = 0;
  let skippedOtherTick = 0;
  const errors: { eventId: string; reason: string }[] = [];

  // Fetched once for the whole tick: an event reminder is a broadcast, the same
  // way `content-notification` treats a new event, so every event in this tick
  // goes to the same token set.
  let tokens: string[] = [];
  try {
    tokens = await fetchAllTokens();
  } catch (e) {
    logError('token fetch failed', { error: errMessage(e) });
    return NextResponse.json(
      { error: 'token fetch failed', detail: errMessage(e) },
      { status: 500 },
    );
  }
  log('tokens loaded', { tokenCount: tokens.length });

  for (const doc of candidates) {
    const data = doc.data();
    const rule = readRecurrence(data.recurrence);
    const anchorStart = toDate(data.start_date_time);
    const anchorEnd = toDate(data.end_date_time);

    if (!anchorStart) {
      skippedUnusable += 1;
      logError('skipping event with no usable start date', { eventId: doc.id });
      continue;
    }
    if (data.recurrence_active === true && !rule) {
      // Flagged as recurring but the rule is unreadable — the app cannot expand
      // this one either, so it is a data problem rather than a quiet tick.
      skippedUnusable += 1;
      logError('skipping recurring event with no usable rule', { eventId: doc.id });
      continue;
    }

    if (!isDueOnTick(data.is_important === true, lead)) {
      skippedOtherTick += 1;
      continue;
    }

    // A one-off event is its own single occurrence: the dated query already
    // established that it falls on the target day.
    const hit = rule
      ? occurrenceOn(anchorStart, rule, targetYmd)
      : ymdInAddis(anchorStart) === targetYmd
        ? { index: 1, start: anchorStart }
        : null;
    if (!hit) {
      skippedNotDue += 1;
      continue;
    }

    // With no lead time the tick can land after the occurrence has already
    // finished — a late or retried execution. Reminding then is pure noise.
    const durationMs =
      anchorEnd && anchorEnd > anchorStart
        ? anchorEnd.getTime() - anchorStart.getTime()
        : 0;
    if (hit.start.getTime() + durationMs <= now.getTime()) {
      skippedFinished += 1;
      log('occurrence already over', {
        eventId: doc.id,
        occurrence: hit.index,
        start: hit.start.toISOString(),
      });
      continue;
    }

    if (data.reminded_ymd === targetYmd) {
      skippedAlreadyReminded += 1;
      continue;
    }

    // Claim before sending. Two executions of the same tick both pass the check
    // above; only one wins the transaction, and the loser skips.
    let claim: { previous: string | null } | 'skip';
    try {
      claim = await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const previous = fresh.get('reminded_ymd') as
          | string
          | undefined;
        if (previous === targetYmd) return 'skip' as const;
        tx.update(doc.ref, { reminded_ymd: targetYmd });
        return { previous: previous ?? null };
      });
    } catch (e) {
      logError('claim transaction failed', {
        eventId: doc.id,
        error: errMessage(e),
      });
      errors.push({ eventId: doc.id, reason: errMessage(e) });
      continue;
    }

    if (claim === 'skip') {
      skippedAlreadyReminded += 1;
      continue;
    }

    if (tokens.length === 0) {
      // Nothing to send to; release the claim so a later tick can still try.
      await releaseClaim(doc.ref, claim.previous);
      skippedUnusable += 1;
      continue;
    }

    let delivered = 0;
    try {
      delivered = await sendReminder({
        eventId: doc.id,
        ymd: targetYmd,
        title: typeof data.title === 'string' ? data.title : '',
        start: hit.start,
        location: readLocation(data.location),
        tokens,
        lead,
      });
    } catch (e) {
      logError('send threw', { eventId: doc.id, error: errMessage(e) });
      errors.push({ eventId: doc.id, reason: errMessage(e) });
      await releaseClaim(doc.ref, claim.previous);
      continue;
    }

    if (delivered > 0) {
      sent += 1;
      log('reminder sent', {
        eventId: doc.id,
        occurrence: hit.index,
        start: hit.start.toISOString(),
        delivered,
        tokenCount: tokens.length,
      });
    } else {
      errors.push({ eventId: doc.id, reason: 'all tokens failed' });
      logError('all tokens failed', { eventId: doc.id, tokenCount: tokens.length });
      await releaseClaim(doc.ref, claim.previous);
    }
  }

  const summary = {
    targetYmd,
    lead,
    processed: candidates.length,
    sent,
    skippedNotDue,
    skippedAlreadyReminded,
    skippedFinished,
    skippedUnusable,
    skippedOtherTick,
    errorCount: errors.length,
    durationMs: Date.now() - startedAt,
  };
  log('done', summary);

  return NextResponse.json({ ...summary, errors });
}

/** Undo a claim whose push never went out, so a later tick can retry. */
async function releaseClaim(
  ref: FirebaseFirestore.DocumentReference,
  previous: string | null,
) {
  try {
    await ref.update({
      reminded_ymd: previous ?? FieldValue.delete(),
    });
  } catch (e) {
    logError('releasing claim failed', {
      docPath: ref.path,
      error: errMessage(e),
    });
  }
}

type ReminderInput = {
  eventId: string;
  ymd: string;
  title: string;
  start: Date;
  location: string;
  tokens: string[];
  /** Decides whether the body reads "Today" or "Tomorrow". */
  lead: ReminderLead;
};

/** Returns how many tokens accepted the push. */
async function sendReminder(input: ReminderInput): Promise<number> {
  const title = input.title.trim() || 'Upcoming event';
  const when = `${whenWord(input.lead)} at ${addisClock(input.start)}`;
  const body = input.location ? `${when} · ${input.location}` : when;

  const message = {
    // `type` + `id` say where a tap lands. The id is the derived occurrence
    // (`<docId>#<YYYY-MM-DD>`), so the app opens that date rather than the
    // anchor; `#` cannot occur in a Firestore id, so the split is unambiguous.
    data: {
      type: 'event',
      id: `${input.eventId}#${input.ymd}`,
      title,
      body,
    },
    // `event` is not a data-only type in `content-notification`, so the OS
    // renders the banner here too.
    notification: { title, body },
  };

  let delivered = 0;
  const dead: string[] = [];

  for (let i = 0; i < input.tokens.length; i += MAX_TOKENS_PER_BATCH) {
    const batch = input.tokens.slice(i, i + MAX_TOKENS_PER_BATCH);
    const response = await adminMessaging.sendEachForMulticast({
      ...message,
      tokens: batch,
    });
    delivered += response.successCount;

    response.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = (r.error as { code?: string } | undefined)?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        dead.push(batch[idx]);
      }
    });
  }

  if (dead.length) await removeDeadTokens(dead);
  return delivered;
}

/** How the lead time reads in the notification body. */
function whenWord(lead: ReminderLead): string {
  return lead === 1 ? 'Tomorrow' : 'Today';
}

async function fetchAllTokens(): Promise<string[]> {
  const snap = await adminDb.collection(PUSH_TOKENS_COLLECTION).get();
  const tokens = snap.docs
    .map((d) => d.get('fcmToken') as string | undefined)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  // The same token can be stored under several device docs — a deviceId that
  // churned on reinstall while the token survived. Sending twice puts two
  // banners on one phone.
  return Array.from(new Set(tokens));
}

async function removeDeadTokens(tokens: string[]) {
  try {
    const found = await Promise.all(
      tokens.map((t) =>
        adminDb
          .collection(PUSH_TOKENS_COLLECTION)
          .where('fcmToken', '==', t)
          .get(),
      ),
    );
    const refs = found.flatMap((s) => s.docs.map((d) => d.ref));
    await Promise.all(refs.map((ref) => ref.delete()));
    log('removed dead tokens', { requested: tokens.length, removed: refs.length });
  } catch (e) {
    logError('dead token cleanup failed', { error: errMessage(e) });
  }
}

/** Stored as a Timestamp by the dashboard; older documents hold a string. */
function toDate(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function readLocation(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (val && typeof val === 'object') {
    const primary = (val as Record<string, unknown>).primary;
    if (typeof primary === 'string') return primary.trim();
  }
  return '';
}

/**
 * The rule as stored. The dashboard normalizes on write, so this only has to
 * refuse what would make the expansion meaningless — a tick must not throw over
 * one malformed document.
 */
function readRecurrence(val: unknown): Recurrence | null {
  if (!val || typeof val !== 'object') return null;
  const raw = val as Record<string, unknown>;

  const freq = raw.freq;
  if (freq !== 'weekly' && freq !== 'monthly') return null;

  const intervalRaw = Number(raw.interval);
  const endMode =
    raw.endMode === 'until' || raw.endMode === 'count' ? raw.endMode : 'never';

  const rule: Recurrence = {
    freq,
    interval:
      Number.isFinite(intervalRaw) && intervalRaw >= 1 ? Math.floor(intervalRaw) : 1,
    endMode,
  };

  const byWeekday = intList(raw.byWeekday, 0, 6);
  if (freq === 'weekly' && byWeekday) rule.byWeekday = byWeekday;
  const byMonthDay = intList(raw.byMonthDay, 1, 31);
  if (freq === 'monthly' && byMonthDay) rule.byMonthDay = byMonthDay;

  if (endMode === 'until') {
    const until = toDate(raw.until);
    if (until) rule.until = until.toISOString();
    else rule.endMode = 'never';
  }
  if (endMode === 'count') {
    const count = Number(raw.count);
    if (Number.isFinite(count) && count >= 1) rule.count = Math.floor(count);
    else rule.endMode = 'never';
  }

  if (Array.isArray(raw.exceptions)) {
    const days = raw.exceptions
      .map((v) => String(v))
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
    if (days.length) rule.exceptions = Array.from(new Set(days));
  }

  return rule;
}

function intList(val: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(val)) return null;
  const out = Array.from(
    new Set(
      val
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= min && n <= max),
    ),
  ).sort((a, b) => a - b);
  return out.length ? out : null;
}
