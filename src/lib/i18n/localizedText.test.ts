import { describe, expect, it } from 'vitest';

import {
  buildLocalized,
  buildLocalizedList,
  displayText,
  localesOf,
  lowerCaseOf,
  readLocalized,
  readLocalizedList,
  resolveLocalized,
  resolveLocalizedList,
} from './localizedText';

describe('readLocalized', () => {
  it('reads a locale map', () => {
    expect(readLocalized({ en: 'Walking with God', am: 'ከእግዚአብሔር ጋር መመላለስ' })).toEqual({
      en: 'Walking with God',
      am: 'ከእግዚአብሔር ጋር መመላለስ',
    });
  });

  it('reads a bare string as English', () => {
    // The shape documents carried before v2, and what a hand edit can produce.
    expect(readLocalized('Walking with God')).toEqual({ en: 'Walking with God' });
  });

  it('drops unknown locales, non-strings and blanks', () => {
    expect(
      readLocalized({ en: 'Title', fr: 'Titre', am: 42, om: '   ' }),
    ).toEqual({ en: 'Title' });
  });

  it('reads a missing field as no languages at all', () => {
    expect(readLocalized(undefined)).toEqual({});
    expect(readLocalized(null)).toEqual({});
    expect(readLocalized('')).toEqual({});
  });
});

describe('readLocalizedList', () => {
  it('reads a bare array as English', () => {
    expect(readLocalizedList(['Prayer', 'Scripture'])).toEqual({
      en: ['Prayer', 'Scripture'],
    });
  });

  it('drops non-strings inside a language', () => {
    expect(readLocalizedList({ en: ['Prayer', 7, 'Scripture'] })).toEqual({
      en: ['Prayer', 'Scripture'],
    });
  });

  it('drops a language whose list is empty', () => {
    expect(readLocalizedList({ en: ['Prayer'], am: [] })).toEqual({
      en: ['Prayer'],
    });
  });
});

describe('buildLocalized', () => {
  it('trims and drops blanks, so `{ am: "" }` is never written', () => {
    // An empty placeholder would list the course under Amharic and then
    // render a blank card.
    expect(buildLocalized({ en: '  Title  ', am: '   ', om: '' })).toEqual({
      en: 'Title',
    });
  });
});

describe('buildLocalizedList', () => {
  it('trims items and drops the empties', () => {
    expect(buildLocalizedList({ en: [' Prayer ', '', 'Scripture'] })).toEqual({
      en: ['Prayer', 'Scripture'],
    });
  });
});

describe('localesOf', () => {
  it('returns present languages in canonical order', () => {
    expect(localesOf({ om: 'c', en: 'a', am: 'b' })).toEqual(['en', 'am', 'om']);
  });
});

describe('lowerCaseOf', () => {
  it('derives one search key per language', () => {
    expect(lowerCaseOf({ en: 'Walking With God', am: 'ከእግዚአብሔር' })).toEqual({
      en: 'walking with god',
      am: 'ከእግዚአብሔር',
    });
  });
});

describe('resolveLocalized', () => {
  const title = { en: 'Walking with God', am: 'ከእግዚአብሔር ጋር መመላለስ' };

  it('takes the selected language when it has text', () => {
    expect(resolveLocalized(title, { selected: 'am' })).toEqual({
      value: 'ከእግዚአብሔር ጋር መመላለስ',
      resolved: 'am',
    });
  });

  it('reports the language it actually fell back to', () => {
    // The badge reads `resolved`: a silent fallback is the failure mode.
    expect(
      resolveLocalized(title, { selected: 'om', defaultLanguage: 'en' }),
    ).toEqual({ value: 'Walking with God', resolved: 'en' });
  });

  it('walks selected -> default -> en', () => {
    expect(
      resolveLocalized({ om: "Bu'uura" }, { selected: 'am', defaultLanguage: 'om' }),
    ).toEqual({ value: "Bu'uura", resolved: 'om' });
  });

  it('takes whatever exists rather than rendering an empty card', () => {
    expect(resolveLocalized({ om: "Bu'uura" }, { selected: 'am' })).toEqual({
      value: "Bu'uura",
      resolved: 'om',
    });
  });

  it('yields empty only when the field has no language at all', () => {
    expect(resolveLocalized({}, { selected: 'en' })).toEqual({
      value: '',
      resolved: null,
    });
  });

  it('treats a blank string as absent', () => {
    expect(resolveLocalized({ am: '  ', en: 'Title' }, { selected: 'am' })).toEqual(
      { value: 'Title', resolved: 'en' },
    );
  });
});

describe('resolveLocalizedList', () => {
  it('falls back a whole list at a time', () => {
    expect(
      resolveLocalizedList({ en: ['Prayer'] }, { selected: 'am' }),
    ).toEqual(['Prayer']);
  });

  it('is empty when nothing is there', () => {
    expect(resolveLocalizedList({}, { selected: 'am' })).toEqual([]);
  });
});

describe('displayText', () => {
  it('gives the dashboard one string in the document"s own language', () => {
    expect(displayText({ en: 'Walking with God', am: 'ከእግዚአብሔር' }, 'am')).toBe(
      'ከእግዚአብሔር',
    );
  });
});
