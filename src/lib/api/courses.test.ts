import { describe, expect, it } from 'vitest';

import { validatePrerequisites } from './courses';
import type { PrerequisiteCandidate } from './courses';

function course(
  id: string,
  status: 'draft' | 'published' = 'published',
  prerequisiteCourseIds: string[] = [],
): PrerequisiteCandidate {
  return { id, title: id.toUpperCase(), status, prerequisiteCourseIds };
}

describe('validatePrerequisites', () => {
  const catalog = [
    course('physics'),
    course('dynamics', 'published', ['physics']),
    course('draft-one', 'draft'),
  ];

  it('accepts published ids that resolve', () => {
    expect(validatePrerequisites('dynamics', ['physics'], catalog)).toEqual([]);
  });

  it('rejects an id with no course behind it', () => {
    expect(validatePrerequisites('dynamics', ['gone'], catalog)).toEqual([
      'Prerequisite "gone" is not an existing course',
    ]);
  });

  it('rejects an unpublished prerequisite', () => {
    expect(validatePrerequisites('dynamics', ['draft-one'], catalog)).toEqual([
      'Prerequisite "DRAFT-ONE" is not published',
    ]);
  });

  it('rejects a course requiring itself', () => {
    expect(validatePrerequisites('physics', ['physics'], catalog)).toEqual([
      'A course cannot require itself',
    ]);
  });

  it('rejects a duplicate entry', () => {
    expect(
      validatePrerequisites('dynamics', ['physics', 'physics'], catalog),
    ).toEqual(['"PHYSICS" is listed twice']);
  });

  it('rejects a direct cycle', () => {
    // physics would require dynamics, which already requires physics.
    const issues = validatePrerequisites('physics', ['dynamics'], catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/cycle/);
  });

  it('rejects a cycle through an intermediate course', () => {
    const deep = [
      course('a', 'published', ['b']),
      course('b', 'published', ['c']),
      course('c'),
    ];
    const issues = validatePrerequisites('c', ['a'], deep);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/cycle/);
  });

  it('allows a diamond, which is not a cycle', () => {
    const diamond = [
      course('root'),
      course('left', 'published', ['root']),
      course('right', 'published', ['root']),
      course('top'),
    ];
    expect(validatePrerequisites('top', ['left', 'right'], diamond)).toEqual([]);
  });

  it('cannot report a cycle when adding, since nothing points at the course yet', () => {
    expect(validatePrerequisites(null, ['physics'], catalog)).toEqual([]);
  });
});
