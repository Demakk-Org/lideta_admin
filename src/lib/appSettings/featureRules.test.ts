import { describe, expect, it } from 'vitest';

import { FEATURES, FEATURE_KEYS } from '@/lib/featureKeys';
import {
  applyToggle,
  canEditVersion,
  canPublishVersion,
  defaultSelectedVersion,
  nextVersionNumber,
  dependencyViolations,
  diffFeatures,
  enabledDependents,
  missingDependencies,
  requiredFeatures,
  unknownFeatureKeys,
  unsetFeatureKeys,
} from './featureRules';

const allOn = () => Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));

describe('feature constant', () => {
  it('has unique keys and only depends on known keys', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
    for (const f of FEATURES) {
      for (const dep of f.dependsOn) expect(FEATURE_KEYS).toContain(dep);
    }
  });

  it('has no dependency cycles', () => {
    for (const key of FEATURE_KEYS) {
      expect(requiredFeatures(key)).not.toContain(key);
    }
  });
});

describe('missingDependencies', () => {
  it('allows turning on a feature whose needs are all on', () => {
    expect(missingDependencies('voiceChat', allOn())).toEqual([]);
  });

  it('blocks turning on voiceChat while chat is off', () => {
    expect(missingDependencies('voiceChat', { ...allOn(), chat: false })).toEqual([
      'chat',
    ]);
  });

  it('follows dependencies transitively and treats missing / non-boolean as off', () => {
    const features = { bibleStudy: 'yes', dailyVerse: true };
    expect(missingDependencies('voiceChat', features)).toEqual([
      'bibleStudy',
      'chat',
    ]);
    expect(missingDependencies('streak', features)).toEqual([]);
    expect(missingDependencies('calendar', {})).toEqual(['events']);
  });
});

describe('enabledDependents', () => {
  it('lists every enabled feature that needs the one being turned off', () => {
    expect(enabledDependents('bibleStudy', allOn())).toEqual([
      'chat',
      'voiceChat',
      'studyQuiz',
      'meetingSummary',
    ]);
  });

  it('skips dependents that are already off', () => {
    const features = { ...allOn(), streak: false };
    expect(enabledDependents('dailyVerse', features)).toEqual(['dailyQuiz']);
  });

  it('is empty for a leaf feature', () => {
    expect(enabledDependents('voiceChat', allOn())).toEqual([]);
  });
});

describe('dependencyViolations', () => {
  it('flags enabled features whose needs are off', () => {
    expect(dependencyViolations({ ...allOn(), events: false })).toEqual([
      { key: 'calendar', missing: ['events'] },
    ]);
  });

  it('ignores disabled features', () => {
    expect(
      dependencyViolations({ ...allOn(), events: false, calendar: false }),
    ).toEqual([]);
  });
});

describe('diffFeatures', () => {
  it('returns nothing when the maps match', () => {
    expect(diffFeatures(allOn(), allOn())).toEqual({});
  });

  it('reports changed keys with from and to', () => {
    expect(
      diffFeatures({ events: true, news: true }, { events: false, news: true }),
    ).toEqual({ events: { from: true, to: false } });
  });

  it('reports missing and non-boolean values as null', () => {
    expect(diffFeatures({ quiz: 'on' }, { quiz: true, videos: false })).toEqual({
      quiz: { from: null, to: true },
      videos: { from: null, to: false },
    });
  });

  it('includes unknown keys and removed keys', () => {
    expect(diffFeatures({ legacy: true }, {})).toEqual({
      legacy: { from: true, to: null },
    });
  });
});

describe('applyToggle', () => {
  it('records a change and drops it when toggled back', () => {
    const raw = { news: true };
    const off = applyToggle(raw, {}, 'news', false);
    expect(off).toEqual({ news: false });
    expect(applyToggle(raw, off, 'news', true)).toEqual({});
  });

  it('treats a missing key as off, so toggling it off is a no-op', () => {
    const on = applyToggle({}, {}, 'quiz', true);
    expect(on).toEqual({ quiz: true });
    expect(applyToggle({}, on, 'quiz', false)).toEqual({});
  });
});

describe('key checks', () => {
  it('finds keys Firestore has but the constant does not', () => {
    expect(unknownFeatureKeys({ ...allOn(), zeta: true, alpha: false })).toEqual([
      'alpha',
      'zeta',
    ]);
  });

  it('finds known keys without a stored boolean', () => {
    const features: Record<string, unknown> = { ...allOn(), tutorial: 1 };
    delete features.quiz;
    expect(unsetFeatureKeys(features)).toEqual([
      'quiz',
      'tutorial',
    ]);
  });
});

describe('version helpers', () => {
  it('only lets drafts be edited', () => {
    expect(canEditVersion('draft')).toBe(true);
    expect(canEditVersion('published')).toBe(false);
    expect(canEditVersion('archived')).toBe(false);
  });

  it('publishes drafts and archived versions, not the live one', () => {
    expect(canPublishVersion('draft')).toBe(true);
    expect(canPublishVersion('archived')).toBe(true);
    expect(canPublishVersion('published')).toBe(false);
  });

  it('numbers the next version past the highest, not the count', () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([{ version: 2 }, { version: 7 }, { version: 3 }])).toBe(8);
  });

  it('opens on the newest draft, else the published version, else the newest', () => {
    expect(defaultSelectedVersion([])).toBeNull();
    expect(
      defaultSelectedVersion([
        { version: 1, status: 'archived' },
        { version: 2, status: 'published' },
        { version: 3, status: 'draft' },
        { version: 4, status: 'draft' },
      ]),
    ).toBe(4);
    expect(
      defaultSelectedVersion([
        { version: 3, status: 'archived' },
        { version: 2, status: 'published' },
      ]),
    ).toBe(2);
    expect(defaultSelectedVersion([{ version: 5, status: 'archived' }])).toBe(5);
  });
});
