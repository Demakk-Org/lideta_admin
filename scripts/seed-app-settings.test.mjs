import { describe, expect, it } from 'vitest';

import { FEATURE_KEYS } from '../src/lib/featureKeys.ts';
import { planSeed } from './seed-app-settings.mjs';

describe('planSeed', () => {
  it('publishes version 1 with every key true when nothing exists', () => {
    const plan = planSeed({ published: null, legacy: null, latestVersion: 0 });
    expect(plan.action).toBe('publish');
    expect(plan.source).toBe('none');
    expect(plan.version).toBe(1);
    expect(plan.publishedVersion).toBeNull();
    expect(Object.keys(plan.features)).toEqual([...FEATURE_KEYS]);
    expect(Object.values(plan.features).every((v) => v === true)).toBe(true);
  });

  it('imports the legacy document, keeping values an admin turned off', () => {
    const plan = planSeed(
      { published: null, legacy: { features: { news: false }, version: 4 }, latestVersion: 0 },
      ['news', 'quiz'],
    );
    expect(plan.action).toBe('publish');
    expect(plan.source).toBe('legacy');
    expect(plan.version).toBe(1);
    expect(plan.features).toEqual({ news: false, quiz: true });
    expect(plan.added).toEqual(['quiz']);
  });

  it('numbers the new version past existing drafts', () => {
    const plan = planSeed({ published: null, legacy: null, latestVersion: 3 }, ['bible']);
    expect(plan.version).toBe(4);
  });

  it('publishes a copy of the published version with only missing keys added', () => {
    const plan = planSeed(
      {
        published: { features: { bible: true, news: false }, version: 4 },
        legacy: { features: { news: true } },
        latestVersion: 6,
      },
      ['bible', 'news', 'quiz', 'videos'],
    );
    expect(plan.action).toBe('publish');
    expect(plan.source).toBe('published');
    expect(plan.version).toBe(7);
    expect(plan.publishedVersion).toBe(4);
    expect(plan.added).toEqual(['quiz', 'videos']);
    expect(plan.features).toEqual({ bible: true, news: false, quiz: true, videos: true });
  });

  it('never flips an existing value, even a non-boolean one', () => {
    const plan = planSeed(
      { published: { features: { bible: false, news: 'yes' }, version: 2 }, legacy: null, latestVersion: 2 },
      ['bible', 'news', 'quiz'],
    );
    expect(plan.features.bible).toBe(false);
    expect(plan.features.news).toBe('yes');
    expect(plan.invalid).toEqual(['news']);
  });

  it('keeps keys it does not know about', () => {
    const plan = planSeed(
      { published: { features: { legacyThing: false }, version: 1 }, legacy: null, latestVersion: 1 },
      ['bible'],
    );
    expect(plan.features).toEqual({ legacyThing: false, bible: true });
    expect(plan.unknown).toEqual(['legacyThing']);
  });

  it('writes nothing when the published version has every key', () => {
    const plan = planSeed(
      { published: { features: { bible: false, quiz: true }, version: 7 }, legacy: null, latestVersion: 9 },
      ['bible', 'quiz'],
    );
    expect(plan.action).toBe('none');
    expect(plan.version).toBe(7);
    expect(plan.added).toEqual([]);
  });

  it('republishes when the published document has no usable features map', () => {
    const plan = planSeed(
      { published: { features: ['bad'], version: 2 }, legacy: null, latestVersion: 2 },
      ['bible'],
    );
    expect(plan.action).toBe('publish');
    expect(plan.version).toBe(3);
    expect(plan.features).toEqual({ bible: true });
  });
});
