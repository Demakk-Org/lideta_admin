/**
 * Locales for the *content* the admin authors — not the dashboard chrome,
 * which stays English.
 *
 * These are exactly the app's `AppLanguage` codes (`en` / `am` / `om`), the
 * same ones slang uses. Nothing else is recognised: a locale key the app has
 * never heard of renders as nothing.
 */
export const CONTENT_LOCALES = ['en', 'am', 'om'] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * The language a document falls back to when the member's language is absent
 * and the document itself names no default.
 */
export const BASE_CONTENT_LOCALE: ContentLocale = 'en';

/** Each language in its own script — never translated. */
export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  en: 'English',
  am: 'አማርኛ',
  om: 'Afaan Oromoo',
};

/** Short tag for badges and list columns. */
export const CONTENT_LOCALE_SHORT: Record<ContentLocale, string> = {
  en: 'EN',
  am: 'አማ',
  om: 'OM',
};

export function isContentLocale(val: unknown): val is ContentLocale {
  return (
    typeof val === 'string' &&
    (CONTENT_LOCALES as readonly string[]).includes(val)
  );
}

/** Partial per-locale map — a document carries only the languages it has. */
export type LocaleMap<T> = Partial<Record<ContentLocale, T>>;

/** Present keys of a locale map, always in `CONTENT_LOCALES` order. */
export function localesOf<T>(map: LocaleMap<T>): ContentLocale[] {
  return CONTENT_LOCALES.filter((l) => map[l] !== undefined);
}
