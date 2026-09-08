import { describe, expect, it } from 'vitest';

import { STEP_MS, planBackfill } from './migrate-course-order-to-createdat.mjs';

const NOW = Date.parse('2026-08-24T00:00:00.000Z');
const at = (iso) => Date.parse(iso);

function course(id, order, createdAt = null) {
  return { id, title: id, order, hasOrder: order != null, createdAt };
}

/** The catalog reads newest-first, so derived dates must descend with order. */
function sequenceOf(courses, derived) {
  return [...courses]
    .map((c) => ({ id: c.id, ms: c.createdAt ?? derived.get(c.id) }))
    .sort((a, b) => b.ms - a.ms)
    .map((c) => c.id);
}

describe('planBackfill', () => {
  it('leaves courses that already have createdAt alone', () => {
    const courses = [course('a', 10, at('2026-01-01T00:00:00Z'))];
    const { derived } = planBackfill(courses, NOW);
    expect(derived.size).toBe(0);
  });

  it('lays an unanchored catalog out backwards from now, lowest order newest', () => {
    const courses = [course('c', 30), course('a', 10), course('b', 20)];
    const { derived } = planBackfill(courses, NOW);
    expect(derived.get('a')).toBe(NOW);
    expect(derived.get('b')).toBe(NOW - STEP_MS);
    expect(derived.get('c')).toBe(NOW - 2 * STEP_MS);
    expect(sequenceOf(courses, derived)).toEqual(['a', 'b', 'c']);
  });

  it('interpolates a run between two anchors so curation is preserved', () => {
    const courses = [
      course('newest', 10, at('2026-03-01T00:00:00Z')),
      course('mid1', 20),
      course('mid2', 30),
      course('oldest', 40, at('2026-01-01T00:00:00Z')),
    ];
    const { derived, warnings } = planBackfill(courses, NOW);
    expect(warnings).toEqual([]);
    expect(derived.get('mid1')).toBeLessThan(at('2026-03-01T00:00:00Z'));
    expect(derived.get('mid1')).toBeGreaterThan(derived.get('mid2'));
    expect(derived.get('mid2')).toBeGreaterThan(at('2026-01-01T00:00:00Z'));
    expect(sequenceOf(courses, derived)).toEqual([
      'newest',
      'mid1',
      'mid2',
      'oldest',
    ]);
  });

  it('places a leading run above the first anchor', () => {
    const courses = [
      course('lead1', 10),
      course('lead2', 20),
      course('anchor', 30, at('2026-01-01T00:00:00Z')),
    ];
    const { derived } = planBackfill(courses, NOW);
    expect(sequenceOf(courses, derived)).toEqual(['lead1', 'lead2', 'anchor']);
  });

  it('places a trailing run below the last anchor', () => {
    const courses = [
      course('anchor', 10, at('2026-01-01T00:00:00Z')),
      course('tail1', 20),
      course('tail2', 30),
    ];
    const { derived } = planBackfill(courses, NOW);
    expect(sequenceOf(courses, derived)).toEqual(['anchor', 'tail1', 'tail2']);
  });

  it('warns instead of guessing when the surviving dates contradict the order', () => {
    const courses = [
      course('newer-order-older-date', 10, at('2026-01-01T00:00:00Z')),
      course('gap', 20),
      course('older-order-newer-date', 30, at('2026-03-01T00:00:00Z')),
    ];
    const { derived, warnings } = planBackfill(courses, NOW);
    expect(warnings).toHaveLength(1);
    expect(derived.get('gap')).toBe(at('2026-01-01T00:00:00Z') - STEP_MS);
  });

  it('gives courses with no order at all a place at the end', () => {
    const courses = [course('ordered', 10), course('orphan', null)];
    const { derived } = planBackfill(courses, NOW);
    expect(sequenceOf(courses, derived)).toEqual(['ordered', 'orphan']);
  });
});
