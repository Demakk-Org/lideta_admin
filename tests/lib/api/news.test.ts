import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import { FUTURE_PUBLISH_ERROR, resolveCreatedAt } from '@/lib/api/news';

/**
 * The app only downloads published news whose createdAt is in the last 7 days
 * (plus the 2 newest), so createdAt must be the moment it went live — not the
 * day the draft was written — and must never move once published.
 */
const now = Timestamp.fromDate(new Date('2026-10-20T10:00:00Z'));
const past = Timestamp.fromDate(new Date('2026-10-01T10:00:00Z'));
const future = Timestamp.fromDate(new Date('2026-11-01T10:00:00Z'));

describe('resolveCreatedAt — publishing', () => {
  it('stamps now when a back-dated draft is published', () => {
    const out = resolveCreatedAt(
      { status: 'draft', createdAt: past },
      { status: 'published' },
      now,
    );
    expect(out?.toMillis()).toBe(now.toMillis());
  });

  it('ignores a past date sent along with the publish', () => {
    const out = resolveCreatedAt(
      { status: 'draft', createdAt: past },
      { status: 'published', createdAt: past.toDate().toISOString() },
      now,
    );
    expect(out?.toMillis()).toBe(now.toMillis());
  });

  it('stamps now when the draft has no date', () => {
    const out = resolveCreatedAt({ status: 'draft' }, { status: 'published' }, now);
    expect(out?.toMillis()).toBe(now.toMillis());
  });

  it('refuses a draft dated in the future', () => {
    expect(() =>
      resolveCreatedAt({ status: 'draft', createdAt: future }, { status: 'published' }, now),
    ).toThrow(FUTURE_PUBLISH_ERROR);
  });

  it('refuses a future date sent along with the publish', () => {
    expect(() =>
      resolveCreatedAt(
        { status: 'draft', createdAt: past },
        { status: 'published', createdAt: future.toDate().toISOString() },
        now,
      ),
    ).toThrow(FUTURE_PUBLISH_ERROR);
  });

  it('applies the same rules to a new doc created as published', () => {
    expect(resolveCreatedAt({}, { status: 'published' }, now)?.toMillis()).toBe(
      now.toMillis(),
    );
    expect(() =>
      resolveCreatedAt({}, { status: 'published', createdAt: future.toDate().toISOString() }, now),
    ).toThrow(FUTURE_PUBLISH_ERROR);
  });
});

describe('resolveCreatedAt — already published', () => {
  it('never changes createdAt on edit', () => {
    const prev = { status: 'published' as const, createdAt: past };
    expect(resolveCreatedAt(prev, { title: 'Edited' }, now)).toBeUndefined();
    expect(resolveCreatedAt(prev, { status: 'published' }, now)).toBeUndefined();
    expect(
      resolveCreatedAt(prev, { createdAt: future.toDate().toISOString() }, now),
    ).toBeUndefined();
  });
});

describe('resolveCreatedAt — drafts', () => {
  it('keeps a picked past or future date', () => {
    for (const ts of [past, future]) {
      const out = resolveCreatedAt(
        { status: 'draft' },
        { status: 'draft', createdAt: ts.toDate().toISOString() },
        now,
      );
      expect(out?.toMillis()).toBe(ts.toMillis());
    }
  });

  it('leaves createdAt alone when no date was picked', () => {
    expect(
      resolveCreatedAt({ status: 'draft', createdAt: past }, { status: 'draft' }, now),
    ).toBeUndefined();
  });
});
