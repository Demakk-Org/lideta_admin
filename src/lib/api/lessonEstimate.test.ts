import { describe, expect, it } from 'vitest';
import {
  LESSON_ESTIMATE,
  estimateLesson,
  formatDuration,
  parseDuration,
} from './lessonEstimate';
import { LessonContentType } from './lessons';
import type { LessonContentItem } from './lessons';

const words = (n: number, word = 'word') => Array(n).fill(word).join(' ');
const amharic = (n: number) => Array(n).fill('ቃል').join(' ');

const paragraph = (text: string): LessonContentItem => ({
  type: LessonContentType.Paragraph,
  value: text,
});

describe('estimateLesson', () => {
  it('reports zero for empty content', () => {
    const e = estimateLesson([]);
    expect(e.totalSeconds).toBe(0);
    expect(e.minutes).toBe(0);
  });

  it('reads Latin text at the Latin rate', () => {
    const e = estimateLesson([paragraph(words(LESSON_ESTIMATE.latinWordsPerMinute))]);
    expect(e.textSeconds).toBeCloseTo(60, 5);
    expect(e.minutes).toBe(1);
  });

  it('reads Ge’ez text more slowly than Latin at equal word counts', () => {
    const latin = estimateLesson([paragraph(words(100))]);
    const geez = estimateLesson([paragraph(amharic(100))]);
    expect(geez.textSeconds).toBeGreaterThan(latin.textSeconds);
    expect(geez.textSeconds).toBeCloseTo(
      (100 / LESSON_ESTIMATE.geezWordsPerMinute) * 60,
      5,
    );
  });

  it('lands between the two rates for mixed-script text', () => {
    // Equal letter counts: 6 Ge'ez fidel against 6 Latin letters.
    const mixed = estimateLesson([paragraph('ሀለሐመሠረ abcdef')]);
    const perWord = mixed.textSeconds / 2;
    const latinPerWord = 60 / LESSON_ESTIMATE.latinWordsPerMinute;
    const geezPerWord = 60 / LESSON_ESTIMATE.geezWordsPerMinute;
    expect(perWord).toBeGreaterThan(latinPerWord);
    expect(perWord).toBeLessThan(geezPerWord);
  });

  it("treats ፡ as a word separator", () => {
    expect(estimateLesson([paragraph('ሀለሐ፡መሠረ')]).textSeconds).toBeCloseTo(
      estimateLesson([paragraph('ሀለሐ መሠረ')]).textSeconds,
      5,
    );
  });

  it('rounds up to whole minutes and never reports zero for real content', () => {
    expect(estimateLesson([paragraph(words(5))]).minutes).toBe(1);
    // A minute and a half of reading rounds up to two.
    const ninetySeconds = words(
      Math.round(LESSON_ESTIMATE.latinWordsPerMinute * 1.5),
    );
    expect(estimateLesson([paragraph(ninetySeconds)]).minutes).toBe(2);
  });

  it('reads quotes more slowly than the same words in a paragraph', () => {
    const asParagraph = estimateLesson([paragraph(words(50))]);
    const asQuote = estimateLesson([
      { type: LessonContentType.Quote, value: { text: words(50), ref: 'John 3:16' } },
    ]);
    expect(asQuote.textSeconds).toBeGreaterThan(asParagraph.textSeconds);
  });

  it('charges per-item overhead on lists', () => {
    const three = estimateLesson([
      { type: LessonContentType.List, value: [words(10), words(10), words(10)] },
    ]);
    const flat = estimateLesson([paragraph(words(30))]);
    expect(three.textSeconds - flat.textSeconds).toBeCloseTo(
      3 * LESSON_ESTIMATE.listItemSeconds,
      5,
    );
  });

  it('counts media by its duration and separates it from text', () => {
    const e = estimateLesson([
      paragraph(words(LESSON_ESTIMATE.latinWordsPerMinute)),
      {
        type: LessonContentType.Audio,
        value: { url: 'https://a/x.mp3', durationSeconds: 130 },
      },
    ]);
    expect(e.textSeconds).toBeCloseTo(60, 5);
    expect(e.mediaSeconds).toBe(130);
    expect(e.blocksMissingDuration).toBe(0);
    expect(e.minutes).toBe(4);
  });

  it('flags media with no duration instead of guessing', () => {
    const e = estimateLesson([
      { type: LessonContentType.Video, value: { videoType: 'youtube', url: 'abc' } },
      { type: LessonContentType.Audio, value: { url: 'https://a/x.mp3' } },
    ]);
    expect(e.mediaSeconds).toBe(0);
    expect(e.blocksMissingDuration).toBe(2);
  });

  it('ignores blocks that are empty or have no readable text', () => {
    const e = estimateLesson([
      paragraph('   '),
      { type: LessonContentType.Title, value: '' },
      { type: LessonContentType.Banner, value: '' },
      { type: LessonContentType.List, value: [] },
    ]);
    expect(e.totalSeconds).toBe(0);
  });

  it('charges fixed costs for titles and banners', () => {
    const e = estimateLesson([
      { type: LessonContentType.Title, value: 'Section' },
      { type: LessonContentType.Banner, value: 'https://img/x.png' },
    ]);
    expect(e.textSeconds).toBe(LESSON_ESTIMATE.titleSeconds);
    expect(e.visualSeconds).toBe(LESSON_ESTIMATE.bannerSeconds);
  });

  it('drops a block when it is removed', () => {
    // Two blocks of exactly one minute each.
    const oneMinute = words(LESSON_ESTIMATE.latinWordsPerMinute);
    const blocks = [paragraph(oneMinute), paragraph(oneMinute)];
    expect(estimateLesson(blocks).minutes).toBe(2);
    expect(estimateLesson(blocks.slice(0, 1)).minutes).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats as mm:ss with a padded seconds field', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(754)).toBe('12:34');
  });

  it('rounds to the nearest second and floors at zero', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('parseDuration', () => {
  it('parses mm:ss', () => {
    expect(parseDuration('12:34')).toBe(754);
    expect(parseDuration(' 1:05 ')).toBe(65);
  });

  it('parses a bare seconds value', () => {
    expect(parseDuration('90')).toBe(90);
  });

  it('returns undefined rather than zero for unusable input', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('   ')).toBeUndefined();
    expect(parseDuration('0')).toBeUndefined();
    expect(parseDuration('0:00')).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('1:2:3')).toBeUndefined();
    expect(parseDuration('-5')).toBeUndefined();
  });
});
