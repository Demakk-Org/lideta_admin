import { describe, expect, it } from 'vitest';

import {
  planTranslation,
  resolveEntry,
  translateBlock,
} from './apply-course-translation.mjs';

const quotes = { gen5_24: 'ሄኖክም አካሄዱን ከእግዚአብሔር ጋር ስላደረገ አልተገኘም።' };
const tr = (base, entry) => translateBlock(base, entry, quotes, 'am');

describe('resolveEntry', () => {
  it('looks up an @reference', () => {
    expect(resolveEntry('@gen5_24', quotes)).toBe(quotes.gen5_24);
  });

  it('leaves plain text alone', () => {
    expect(resolveEntry('ጸሎት', quotes)).toBe('ጸሎት');
  });

  it('refuses an unknown reference rather than writing "@name"', () => {
    expect(() => resolveEntry('@nope', quotes)).toThrow('Unknown quote reference');
  });
});

describe('translateBlock', () => {
  it('adds the language to a paragraph without touching the others', () => {
    expect(
      tr({ type: 'paragraph', value: { en: 'God is eternal.' } }, 'እግዚአብሔር ዘላለማዊ ነው።'),
    ).toEqual({
      type: 'paragraph',
      value: { en: 'God is eternal.', am: 'እግዚአብሔር ዘላለማዊ ነው።' },
    });
  });

  it('writes nothing for a blank entry, leaving the app to fall back', () => {
    const base = { type: 'paragraph', value: { en: 'God is eternal.' } };
    expect(tr(base, '')).toEqual(base);
    expect(tr(base, null)).toEqual(base);
  });

  it('clears a language that is blanked out rather than storing ""', () => {
    expect(tr({ type: 'paragraph', value: { en: 'A', am: 'ለ' } }, '')).toEqual({
      type: 'paragraph',
      value: { en: 'A' },
    });
  });

  it('keeps the verse coordinates on a quote', () => {
    // The whole point: a translation must never move where a tapped verse
    // opens in the Bible reader.
    const base = {
      type: 'quote',
      value: {
        text: { en: 'Enoch walked faithfully with God.' },
        ref: '{"book":1,"chapter":5,"verse":24}',
        isBibleVerse: true,
      },
    };
    expect(tr(base, '@gen5_24')).toEqual({
      type: 'quote',
      value: {
        ref: '{"book":1,"chapter":5,"verse":24}',
        isBibleVerse: true,
        text: { en: 'Enoch walked faithfully with God.', am: quotes.gen5_24 },
      },
    });
  });

  it('stores a list as its own array per language', () => {
    expect(
      tr({ type: 'list', value: { en: ['Prayer', 'Scripture'] } }, ['ጸሎት', 'ቅዱሳት መጻሕፍት']),
    ).toEqual({
      type: 'list',
      value: { en: ['Prayer', 'Scripture'], am: ['ጸሎት', 'ቅዱሳት መጻሕፍት'] },
    });
  });

  it('shares the media file on a video, translating only the label', () => {
    const base = {
      type: 'video',
      value: {
        videoType: 'youtube',
        url: 'abc12345678',
        title: { en: 'Lecture' },
        durationSeconds: 600,
      },
    };
    expect(tr(base, { title: 'ትምህርት' })).toEqual({
      type: 'video',
      value: {
        videoType: 'youtube',
        url: 'abc12345678',
        durationSeconds: 600,
        title: { en: 'Lecture', am: 'ትምህርት' },
      },
    });
  });

  it('leaves a banner alone — one image serves every language', () => {
    const base = { type: 'banner', value: 'https://x/banner.jpg' };
    expect(tr(base, 'anything')).toEqual(base);
  });

  it('rejects an entry of the wrong shape', () => {
    expect(() => tr({ type: 'list', value: { en: ['a'] } }, 'not an array')).toThrow(
      'array of strings',
    );
    expect(() => tr({ type: 'paragraph', value: { en: 'a' } }, ['x'])).toThrow(
      'needs a string',
    );
  });
});

describe('planTranslation', () => {
  const course = {
    title: { en: 'Walking with God' },
    description: { en: 'An intro.' },
    availableLanguages: ['en'],
    defaultLanguage: 'en',
  };
  const lessons = [
    {
      id: 'l1',
      order: 1,
      title: { en: 'One' },
      shortDescription: { en: 'First.' },
      availableLanguages: ['en'],
      blocks: [
        { type: 'title', value: { en: 'A walk' } },
        { type: 'paragraph', value: { en: 'God is eternal.' } },
      ],
    },
    {
      id: 'l2',
      order: 2,
      title: { en: 'Two' },
      shortDescription: {},
      availableLanguages: ['en'],
      blocks: [{ type: 'title', value: { en: 'Two' } }],
    },
  ];
  const file = {
    courseId: 'c1',
    locale: 'am',
    course: { title: 'ከእግዚአብሔር ጋር መመላለስ', description: 'መግቢያ።' },
    lessons: {
      l1: { title: 'መመላለስ', shortDescription: 'መግቢያ።', blocks: ['ጉዞ', 'እግዚአብሔር ዘላለማዊ ነው።'] },
      l2: { title: 'ሁለት', blocks: ['ሁለት'] },
    },
  };

  it('adds the language without dropping what is already there', () => {
    const plan = planTranslation({ file, course, lessons });
    expect(plan.course.title).toEqual({
      en: 'Walking with God',
      am: 'ከእግዚአብሔር ጋር መመላለስ',
    });
    expect(plan.course.availableLanguages).toEqual(['en', 'am']);
    expect(plan.lessons[0].title).toEqual({ en: 'One', am: 'መመላለስ' });
    expect(plan.problems).toEqual([]);
  });

  it('derives a search key for every language, not just the new one', () => {
    const plan = planTranslation({ file, course, lessons });
    expect(plan.course.lowerCaseTitle).toEqual({
      en: 'walking with god',
      am: 'ከእግዚአብሔር ጋር መመላለስ',
    });
  });

  it('refuses a stale file whose block count no longer matches', () => {
    const stale = { ...file, lessons: { ...file.lessons, l1: { title: 'መመላለስ', blocks: ['ጉዞ'] } } };
    const plan = planTranslation({ file: stale, course, lessons });
    expect(plan.problems[0]).toContain('1 block(s) for a 2-block lesson');
    expect(plan.lessons.map((l) => l.id)).toEqual(['l2']);
  });

  it('reports a lesson the file skipped instead of half-listing the language', () => {
    const partial = { ...file, lessons: { l1: file.lessons.l1 } };
    expect(planTranslation({ file: partial, course, lessons }).missing).toEqual(['l2']);
  });

  it('refuses a lesson id that is not in the course', () => {
    const wrong = { ...file, lessons: { ...file.lessons, l9: { title: 'x', blocks: [] } } };
    expect(planTranslation({ file: wrong, course, lessons }).problems[0]).toContain(
      'not in this course',
    );
  });

  it('refuses to write the primary language through this path', () => {
    expect(() => planTranslation({ file: { ...file, locale: 'en' }, course, lessons })).toThrow(
      'not the primary language',
    );
  });

  it('refuses an unknown locale', () => {
    expect(() => planTranslation({ file: { ...file, locale: 'fr' }, course, lessons })).toThrow(
      'Unsupported locale',
    );
  });
});
