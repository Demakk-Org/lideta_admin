/**
 * Locating the occurrence a reminder is due for.
 *
 * Split out of the cron route the way `recurrenceForm` is split out of the
 * editor: this is the one piece of real logic in the reminder tick, and a route
 * file cannot export anything but its HTTP handlers, so it could not be tested
 * in place.
 *
 * Dashboard-only. Unlike `recurrence.ts` this has no counterpart in the app —
 * the app expands occurrences to display them, and never asks which one a push
 * belongs to.
 */
import { nextOccurrenceAfter, ymdInAddis } from './recurrence';
import type { Recurrence } from './recurrence';

/**
 * How far the walk will go before giving up. A weekly series reaches ~9 years
 * of history first, and a rule that can never produce another date is caught by
 * `nextOccurrenceAfter` returning null well before this.
 */
export const MAX_OCCURRENCE_WALK = 520;

export type FoundOccurrence = {
  /** The instant the occurrence starts. */
  start: Date;
  /** 1-based, counting the anchor as occurrence 1. */
  index: number;
};

/**
 * The occurrence falling on `targetYmd` (an Addis 'YYYY-MM-DD'), or null.
 *
 * Walks forward from the anchor because that is the only date stored: under the
 * V4 model `start_date_time` is occurrence 1 for the life of the series and
 * nothing may advance it (docs/RECURRING_EVENTS_V4_PLAN.md §1). The walk stops
 * as soon as it passes the target day, so a long-running series costs one step
 * per elapsed period.
 *
 * `count` is enforced here — `nextOccurrenceAfter` deliberately leaves it to
 * the caller — so a finished series stops matching instead of reminding forever.
 */
export function occurrenceOn(
  anchorStart: Date,
  rule: Recurrence,
  targetYmd: string,
): FoundOccurrence | null {
  if (Number.isNaN(anchorStart.getTime())) return null;

  const limit =
    rule.endMode === 'count' && rule.count
      ? Math.min(rule.count, MAX_OCCURRENCE_WALK)
      : MAX_OCCURRENCE_WALK;

  let cursor = anchorStart;
  for (let index = 1; index <= limit; index += 1) {
    const ymd = ymdInAddis(cursor);
    if (ymd === targetYmd) return { start: cursor, index };
    // Occurrences only move forward, so passing the target day means it is not
    // in the series at all.
    if (ymd > targetYmd) return null;

    const next = nextOccurrenceAfter(cursor, rule);
    if (!next) return null;
    cursor = next;
  }
  return null;
}

/** Which tick is running: 1 = the day-before pass, 0 = the morning-of pass. */
export type ReminderLead = 0 | 1;

/**
 * Whether a given tick is the one that should remind about this event.
 *
 *   important -> day before (14:00)
 *   otherwise -> morning of (08:00)
 *
 * Importance decides the timing, not whether a reminder happens at all: every
 * event gets exactly one. The split is social rather than technical — a
 * day-before nudge reads as "make time for this", a morning-of one as "this is
 * happening today".
 *
 * Exactly one tick matches any event, which is what stops the two schedules
 * reminding the same occurrence twice. Whether the event recurs is irrelevant
 * here: a one-off event is a series with a single occurrence.
 */
export function isDueOnTick(isImportant: boolean, lead: ReminderLead): boolean {
  return isImportant ? lead === 1 : lead === 0;
}
