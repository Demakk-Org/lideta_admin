import { BASE_CONTENT_LOCALE, CONTENT_LOCALES, isContentLocale } from './contentLocales';
import type { ContentLocale } from './contentLocales';

/**
 * A translatable field *is* a map of languages. There is no sidecar
 * `translations` object and no flat mirror to keep in step — the field holds
 * every language it has, and nothing else holds any of them.
 *
 *   title: { en: "Walking with God", am: "ከእግዚአብሔር ጋር መመላለስ" }
 *
 * The rule for what gets a map: a field is localized if and only if a human
 * reads it as prose. Ids, URLs, enum values, numbers, dates and the verse
 * coordinates on a quote block stay flat.
 *
 * A language is present only when it has text. An empty string is never
 * written: `{ am: "" }` would list a course under Amharic and then render it
 * blank, which is worse than not offering it in Amharic at all.
 */
export type LocalizedText = Partial<Record<ContentLocale, string>>;

/** The same, for a list block's items. */
export type LocalizedList = Partial<Record<ContentLocale, string[]>>;

/**
 * Forgiving read. Unknown locale keys, non-string values and blanks are
 * dropped rather than thrown on, matching every other mapper in `lib/api`.
 *
 * A bare string reads as English — the shape documents carried before v2, and
 * the shape a hand-edited document can still arrive in.
 */
export function readLocalized(raw: unknown): LocalizedText {
  if (typeof raw === 'string') {
    return raw.trim() ? { [BASE_CONTENT_LOCALE]: raw } : {};
  }
  if (typeof raw !== 'object' || raw === null) return {};

  const out: LocalizedText = {};
  for (const [locale, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isContentLocale(locale)) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    out[locale] = value;
  }
  return out;
}

/** As {@link readLocalized}, for list blocks. A bare array reads as English. */
export function readLocalizedList(raw: unknown): LocalizedList {
  const items = (val: unknown): string[] =>
    Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];

  if (Array.isArray(raw)) {
    const list = items(raw);
    return list.length ? { [BASE_CONTENT_LOCALE]: list } : {};
  }
  if (typeof raw !== 'object' || raw === null) return {};

  const out: LocalizedList = {};
  for (const [locale, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isContentLocale(locale)) continue;
    const list = items(value);
    if (list.length) out[locale] = list;
  }
  return out;
}

/** Write side: trims, and drops any language left blank. */
export function buildLocalized(input: LocalizedText): LocalizedText {
  const out: LocalizedText = {};
  for (const locale of CONTENT_LOCALES) {
    const text = (input[locale] ?? '').trim();
    if (text) out[locale] = text;
  }
  return out;
}

export function buildLocalizedList(input: LocalizedList): LocalizedList {
  const out: LocalizedList = {};
  for (const locale of CONTENT_LOCALES) {
    const list = (input[locale] ?? []).map((v) => v.trim()).filter(Boolean);
    if (list.length) out[locale] = list;
  }
  return out;
}

/** Languages present, always in `en → am → om` order. */
export function localesOf(value: LocalizedText | LocalizedList): ContentLocale[] {
  return CONTENT_LOCALES.filter((l) => value[l] !== undefined);
}

/**
 * The per-language search key. Catalog search is a prefix range on
 * `lowerCaseTitle.{lang}` and Firestore cannot lowercase for you.
 *
 * For Amharic this equals the title (Geʽez is unicameral); it is written
 * anyway, because the query needs the field to exist.
 */
export function lowerCaseOf(title: LocalizedText): LocalizedText {
  const out: LocalizedText = {};
  for (const locale of localesOf(title)) {
    out[locale] = title[locale]!.toLowerCase();
  }
  return out;
}

/**
 * `value[selected]` → `value[defaultLanguage]` → `value.en` → `''`.
 *
 * `resolved` is the language actually used, so the UI can say "available in
 * English only" instead of silently showing the wrong language.
 */
export function resolveLocalized(
  value: LocalizedText,
  opts: { selected?: ContentLocale; defaultLanguage?: ContentLocale } = {},
): { value: string; resolved: ContentLocale | null } {
  const chain: ContentLocale[] = [];
  if (opts.selected) chain.push(opts.selected);
  if (opts.defaultLanguage) chain.push(opts.defaultLanguage);
  chain.push(BASE_CONTENT_LOCALE);

  for (const locale of chain) {
    const text = value[locale];
    if (typeof text === 'string' && text.trim()) return { value: text, resolved: locale };
  }
  // Nothing in the fallback chain: take whatever the field does have rather
  // than render an empty card.
  const first = localesOf(value)[0];
  return first
    ? { value: value[first]!, resolved: first }
    : { value: '', resolved: null };
}

export function resolveLocalizedList(
  value: LocalizedList,
  opts: { selected?: ContentLocale; defaultLanguage?: ContentLocale } = {},
): string[] {
  const chain: ContentLocale[] = [];
  if (opts.selected) chain.push(opts.selected);
  if (opts.defaultLanguage) chain.push(opts.defaultLanguage);
  chain.push(BASE_CONTENT_LOCALE);

  for (const locale of chain) {
    const list = value[locale];
    if (list?.length) return list;
  }
  const first = localesOf(value)[0];
  return first ? value[first]! : [];
}

/**
 * What the dashboard shows in a list, a picker or a toast — one string, in the
 * document's own primary language.
 */
export function displayText(
  value: LocalizedText,
  defaultLanguage?: ContentLocale,
): string {
  return resolveLocalized(value, { selected: defaultLanguage }).value;
}
