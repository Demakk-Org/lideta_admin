import { describe, expect, it } from 'vitest';

import {
  convertCategory,
  convertCourse,
  convertLesson,
  isLocalized,
  mergeBodies,
  toLocalized,
  verifyCourse,
} from './migrate-course-translations-v2.mjs';

describe('toLocalized', () => {
  it('seeds the default language from the flat field, the rest from the sidecar', () => {
    // v1's rule was that the flat field mirrors `translations[defaultLanguage]`,
    // so the flat value *is* that language's text.
    expect(
      toLocalized(
        'Walking with God',
        { en: { title: 'Walking with God' }, am: { title: 'ከእግዚአብሔር ጋር መመላለስ' } },
        'title',
      ),
    ).toEqual({ en: 'Walking with God', am: 'ከእግዚአብሔር ጋር መመላለስ' });
  });

  it('converts a pre-v1 document with no sidecar at all', () => {
    expect(toLocalized('Walking with God', undefined, 'title')).toEqual({
      en: 'Walking with God',
    });
  });

  it('honours a non-English default language', () => {
    expect(toLocalized('ከእግዚአብሔር', { am: { title: 'ከእግዚአብሔር' } }, 'title', 'am')).toEqual({
      am: 'ከእግዚአብሔር',
    });
  });
});

describe('mergeBodies', () => {
  const en = [
    { type: 'title', value: 'A walk' },
    { type: 'paragraph', value: 'God is eternal.' },
    { type: 'list', value: ['Prayer', 'Scripture'] },
    {
      type: 'quote',
      value: { text: 'Enoch walked…', ref: '{"book":1}', isBibleVerse: true },
    },
    { type: 'banner', value: 'https://x/banner.jpg' },
  ];
  const am = [
    { type: 'title', value: 'ጉዞ' },
    { type: 'paragraph', value: 'እግዚአብሔር ዘላለማዊ ነው።' },
    { type: 'list', value: ['ጸሎት', 'ቅዱሳት መጻሕፍት'] },
    { type: 'quote', value: { text: 'ሄኖክም…', ref: '{"book":1}', isBibleVerse: true } },
    { type: 'banner', value: 'https://x/banner.jpg' },
  ];

  it('folds two bodies into one array of maps', () => {
    const { content, problems } = mergeBodies({ en, am });
    expect(problems).toEqual([]);
    expect(content[0]).toEqual({ type: 'title', value: { en: 'A walk', am: 'ጉዞ' } });
    expect(content[2].value).toEqual({
      en: ['Prayer', 'Scripture'],
      am: ['ጸሎት', 'ቅዱሳት መጻሕፍት'],
    });
  });

  it('keeps the verse coordinates flat and shared', () => {
    const { content } = mergeBodies({ en, am });
    expect(content[3]).toEqual({
      type: 'quote',
      value: {
        ref: '{"book":1}',
        isBibleVerse: true,
        text: { en: 'Enoch walked…', am: 'ሄኖክም…' },
      },
    });
  });

  it('leaves a banner as one shared URL', () => {
    expect(mergeBodies({ en, am }).content[4]).toEqual({
      type: 'banner',
      value: 'https://x/banner.jpg',
    });
  });

  it('reports a body that drifted instead of reshaping the lesson', () => {
    const { problems, content } = mergeBodies({ en, am: am.slice(0, 2) });
    expect(problems[0]).toContain('2 block(s) against 5');
    // Structure still comes from the default language.
    expect(content).toHaveLength(5);
  });

  it('ignores a translated block whose type no longer matches', () => {
    const drifted = [{ type: 'paragraph', value: 'wrong type' }, ...am.slice(1)];
    expect(mergeBodies({ en, am: drifted }).content[0]).toEqual({
      type: 'title',
      value: { en: 'A walk' },
    });
  });
});

describe('convertCourse', () => {
  it('builds every v2 field from v1', () => {
    const { update } = convertCourse({
      title: 'Walking with God',
      description: 'An intro.',
      defaultLanguage: 'en',
      availableLanguages: ['en', 'am'],
      translations: {
        en: { title: 'Walking with God', description: 'An intro.' },
        am: { title: 'ከእግዚአብሔር ጋር መመላለስ', description: 'መግቢያ።' },
      },
    });
    expect(update.title).toEqual({
      en: 'Walking with God',
      am: 'ከእግዚአብሔር ጋር መመላለስ',
    });
    expect(update.lowerCaseTitle.en).toBe('walking with god');
    expect(update.availableLanguages).toEqual(['en', 'am']);
    expect(update.defaultLanguage).toBe('en');
  });

  it('is idempotent — an already-converted course is skipped', () => {
    expect(convertCourse({ title: { en: 'Walking with God' } })).toBeNull();
  });

  it('refuses a course with no title', () => {
    expect(convertCourse({ title: '  ' }).problem).toContain('no title');
  });
});

describe('convertLesson', () => {
  it('merges the bodies and drops the sidecar', () => {
    const { update } = convertLesson(
      {
        title: 'Who Is God?',
        shortDescription: 'His nature.',
        category: 'Doctrine',
        tags: ['god'],
        content: [{ type: 'paragraph', value: 'God is eternal.' }],
        translations: { am: { title: 'እግዚአብሔር ማን ነው?' } },
      },
      {
        en: [{ type: 'paragraph', value: 'God is eternal.' }],
        am: [{ type: 'paragraph', value: 'እግዚአብሔር ዘላለማዊ ነው።' }],
      },
      'en',
    );
    expect(update.title).toEqual({ en: 'Who Is God?', am: 'እግዚአብሔር ማን ነው?' });
    expect(update.content[0].value).toEqual({
      en: 'God is eternal.',
      am: 'እግዚአብሔር ዘላለማዊ ነው።',
    });
    expect(update.category).toEqual({ en: 'Doctrine' });
    expect(update.tags).toEqual({ en: ['god'] });
  });

  it('falls back to the flat content array when no body documents exist', () => {
    const { update } = convertLesson(
      { title: 'Who Is God?', content: [{ type: 'paragraph', value: 'God is eternal.' }] },
      {},
      'en',
    );
    expect(update.content[0].value).toEqual({ en: 'God is eternal.' });
  });
});

describe('convertCategory', () => {
  it('converts name and description', () => {
    const { update } = convertCategory({
      name: 'Christian Living',
      description: 'How faith lands on a Tuesday.',
      translations: { am: { name: 'የክርስትና ኑሮ' } },
    });
    expect(update.name).toEqual({ en: 'Christian Living', am: 'የክርስትና ኑሮ' });
    expect(update.availableLanguages).toEqual(['en', 'am']);
  });
});

describe('verifyCourse', () => {
  const good = {
    title: { en: 'Walking with God' },
    lowerCaseTitle: { en: 'walking with god' },
    availableLanguages: ['en'],
    defaultLanguage: 'en',
  };
  const lesson = (data, bodyDocs = []) => ({ id: 'l1', data, bodyDocs });

  it('passes a coherent document', () => {
    expect(
      verifyCourse(good, [lesson({ title: { en: 'One' }, content: [] })]),
    ).toEqual([]);
  });

  it('catches a course the conversion missed', () => {
    expect(verifyCourse({ title: 'Walking with God' }, [])[0]).toContain(
      'title is not a map',
    );
  });

  it('catches availableLanguages drifting from the title', () => {
    expect(
      verifyCourse({ ...good, availableLanguages: ['en', 'am'] }, [])[0],
    ).toContain('does not equal');
  });

  it('catches a leftover translations map', () => {
    expect(verifyCourse({ ...good, translations: {} }, [])[0]).toContain(
      'still carries',
    );
  });

  it('catches a leftover content/{lang} document', () => {
    const issues = verifyCourse(good, [
      lesson({ title: { en: 'One' }, content: [] }, [{ id: 'am' }]),
    ]);
    expect(issues[0]).toContain('content/{lang}');
  });

  it('catches a block whose text never became a map', () => {
    const issues = verifyCourse(good, [
      lesson({ title: { en: 'One' }, content: [{ type: 'paragraph', value: 'flat' }] }),
    ]);
    expect(issues[0]).toContain('text is not a map');
  });

  it('does not flag a banner, which is a URL rather than prose', () => {
    expect(
      verifyCourse(good, [
        lesson({ title: { en: 'One' }, content: [{ type: 'banner', value: 'https://x' }] }),
      ]),
    ).toEqual([]);
  });
});

describe('isLocalized', () => {
  it('tells a v2 map from a v1 string', () => {
    expect(isLocalized({ en: 'x' })).toBe(true);
    expect(isLocalized('x')).toBe(false);
    expect(isLocalized([])).toBe(false);
    expect(isLocalized(undefined)).toBe(false);
  });
});
