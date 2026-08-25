import { LessonContentType } from './lessons';
import type { LessonContentItem } from './lessons';

/**
 * Tunable inputs to the lesson-time estimate. These are deliberately in one
 * place: they are guesses until real lessons prove them wrong, and tuning is
 * expected to be a matter of editing numbers here rather than logic below.
 */
export const LESSON_ESTIMATE = {
  /**
   * Ge'ez script is read more slowly per *word* than Latin: Amharic is
   * agglutinative, so a word carries more morphemes and each fidel is a whole
   * syllable. Blocks that mix scripts land between the two.
   *
   * Calibrated against "Rest Without Guilt" (Faith at Work, 735 words), which
   * an admin read in 7:00 and judged worth advertising as 8 minutes. These are
   * study-reading rates, well below the ~200 wpm of plain prose — lesson
   * content is read slowly, with scripture re-read. The Ge'ez rate keeps its
   * original 0.72 ratio to Latin; it has not been measured against a real
   * Amharic lesson yet.
   */
  geezWordsPerMinute: 75,
  latinWordsPerMinute: 105,
  /** Quotes get re-read; scripture especially. Multiplies the reading speed. */
  quoteSpeedFactor: 0.8,
  /** A heading is a beat, not a read. */
  titleSeconds: 3,
  /** Fixed look-at cost for a banner image. */
  bannerSeconds: 5,
  /** Per-bullet scanning overhead, on top of the words in it. */
  listItemSeconds: 2,
  /** The reference line under a quote. */
  quoteRefSeconds: 3,
} as const;

/** Ethiopic, Ethiopic Supplement, and Ethiopic Extended. */
const GEEZ = /[ሀ-᎟ⶀ-⷟]/g;
/** Latin letters, so punctuation and digits don't skew the script mix. */
const LATIN = /[A-Za-z]/g;
/** `፡` (U+1361) is a word separator in traditional Ge'ez typesetting. */
const WORD_SEPARATORS = /[\s፡]+/;

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(WORD_SEPARATORS).filter(Boolean).length;
}

/**
 * Reading speed for one run of text, interpolated by how much of it is Ge'ez.
 * All-Latin gives {@link LESSON_ESTIMATE.latinWordsPerMinute}, all-Ge'ez gives
 * the Ge'ez rate, and mixed text lands in between rather than snapping to
 * whichever script happens to have one more character.
 */
function wordsPerMinute(text: string): number {
  const geez = countMatches(text, GEEZ);
  const latin = countMatches(text, LATIN);
  const letters = geez + latin;
  if (letters === 0) return LESSON_ESTIMATE.latinWordsPerMinute;
  const geezShare = geez / letters;
  return (
    LESSON_ESTIMATE.latinWordsPerMinute * (1 - geezShare) +
    LESSON_ESTIMATE.geezWordsPerMinute * geezShare
  );
}

/** Seconds to read `text`, optionally slowed by `speedFactor` (< 1 is slower). */
function readingSeconds(text: string, speedFactor = 1): number {
  const words = wordCount(text);
  if (words === 0) return 0;
  return (words / (wordsPerMinute(text) * speedFactor)) * 60;
}

export type LessonEstimate = {
  /** Reading time: titles, paragraphs, quotes, lists. */
  textSeconds: number;
  /** Playback time of audio and video blocks with a known duration. */
  mediaSeconds: number;
  /** Time spent looking at banners. */
  visualSeconds: number;
  totalSeconds: number;
  /**
   * Audio/video blocks with no `durationSeconds`. They contribute nothing, so
   * the estimate is an undercount whenever this is above zero — the form
   * surfaces it rather than letting the number be quietly wrong.
   */
  blocksMissingDuration: number;
  /** `totalSeconds` rounded up, floored at 1 whenever anything was counted. */
  minutes: number;
};

/**
 * Estimated time to work through a lesson, derived purely from its content
 * blocks. An attached quiz is deliberately not counted — the quiz lives in a
 * separate document, and keeping this a pure function of `content` is what
 * lets the form recompute it on every keystroke.
 */
export function estimateLesson(content: LessonContentItem[]): LessonEstimate {
  let textSeconds = 0;
  let mediaSeconds = 0;
  let visualSeconds = 0;
  let blocksMissingDuration = 0;

  for (const block of content) {
    switch (block.type) {
      case LessonContentType.Title:
        if (block.value.trim()) textSeconds += LESSON_ESTIMATE.titleSeconds;
        break;
      case LessonContentType.Paragraph:
        textSeconds += readingSeconds(block.value);
        break;
      case LessonContentType.Quote:
        if (block.value.text.trim()) {
          textSeconds +=
            readingSeconds(block.value.text, LESSON_ESTIMATE.quoteSpeedFactor) +
            LESSON_ESTIMATE.quoteRefSeconds;
        }
        break;
      case LessonContentType.List: {
        const items = block.value.filter((item) => item.trim());
        textSeconds +=
          readingSeconds(items.join(' ')) +
          items.length * LESSON_ESTIMATE.listItemSeconds;
        break;
      }
      case LessonContentType.Banner:
        if (block.value.trim()) visualSeconds += LESSON_ESTIMATE.bannerSeconds;
        break;
      case LessonContentType.Video:
      case LessonContentType.Audio: {
        const duration = block.value.durationSeconds;
        if (typeof duration === 'number' && duration > 0) {
          mediaSeconds += duration;
        } else {
          blocksMissingDuration += 1;
        }
        break;
      }
    }
  }

  const totalSeconds = textSeconds + mediaSeconds + visualSeconds;
  return {
    textSeconds,
    mediaSeconds,
    visualSeconds,
    totalSeconds,
    blocksMissingDuration,
    minutes: totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : 0,
  };
}

/** `754` -> `"12:34"`. Rounds to the nearest second. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parses the duration field's `mm:ss` (or bare seconds) input. Returns
 * `undefined` for blank or unparseable input so the caller can drop the field
 * rather than storing a zero that reads as "known to be empty".
 */
export function parseDuration(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(':');
  if (parts.length > 2) return undefined;

  const nums = parts.map((p) => Number(p.trim()));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return undefined;

  const seconds = parts.length === 2 ? nums[0] * 60 + nums[1] : nums[0];
  return seconds > 0 ? Math.round(seconds) : undefined;
}
