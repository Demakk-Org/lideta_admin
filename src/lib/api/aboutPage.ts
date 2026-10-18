import { db } from '@/lib/firebase/config';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { CONTENT_LOCALE_LABELS } from '@/lib/i18n/contentLocales';
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import {
  buildLocalized,
  coerceDefaultLanguage,
  localesOf,
  readLocalized,
} from '@/lib/i18n/localizedText';
import type { LocalizedText } from '@/lib/i18n/localizedText';

/**
 * The app's "About the church" screen, as two documents of the same shape:
 *
 *   about_page/draft      what the dashboard edits (admin only)
 *   about_page/published  what the app reads; written only by Publish
 *
 * The page is one document with fixed fields, not a list of records, so
 * there is no create or delete: saving always writes the whole draft.
 *
 * Text is per language, structure is shared (the lesson model): list items,
 * their order, ids, coordinates, URLs and platforms exist once for every
 * language. `churchName` decides which languages the page has.
 */
export const ABOUT_PAGE_COLLECTION = 'about_page';
export const ABOUT_PAGE_DRAFT_ID = 'draft';
export const ABOUT_PAGE_PUBLISHED_ID = 'published';

/** The church worships in Amharic, so a new page starts Amharic-primary. */
export const ABOUT_PAGE_PRIMARY_LOCALE: ContentLocale = 'am';

/** Closed set: the app picks the icon and label from it. */
export const SOCIAL_PLATFORMS = [
  'facebook',
  'youtube',
  'tiktok',
  'telegram',
  'instagram',
  'website',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Brand names, never translated. "Website" is translated in the app. */
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  instagram: 'Instagram',
  website: 'Website',
};

export type HistoryEntry = {
  id: string;
  /** Localized: "1960ዎቹ–70ዎቹ", "ዛሬ", "Har'a" are not plain years. */
  period: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
};

export type Belief = { id: string; title: LocalizedText; text: LocalizedText };

/** Free text per language: Amharic writes Ethiopian clock time. */
export type Service = { id: string; name: LocalizedText; time: LocalizedText };

export type SocialLink = { id: string; platform: SocialPlatform; url: string };

export type AboutPageVisit = {
  address: LocalizedText;
  landmark: LocalizedText;
  /** Both null when unset; the app then hides "Open in Maps". */
  lat: number | null;
  lng: number | null;
};

/** Everything an admin edits. */
export type AboutPageContent = {
  defaultLanguage: ContentLocale;
  churchName: LocalizedText;
  tagline: LocalizedText;
  /** '' when unset; the app falls back to its bundled logo. */
  logoUrl: string;
  intro: LocalizedText;
  history: HistoryEntry[];
  beliefs: Belief[];
  visit: AboutPageVisit;
  services: Service[];
  links: SocialLink[];
};

export type AboutPageDoc = AboutPageContent & {
  /** Derived on write from `churchName`. */
  availableLanguages: ContentLocale[];
  updatedAt: string | null;
  updatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
};

export function newItemId(): string {
  return crypto.randomUUID();
}

export function emptyAboutPageContent(): AboutPageContent {
  return {
    defaultLanguage: ABOUT_PAGE_PRIMARY_LOCALE,
    churchName: {},
    tagline: {},
    logoUrl: '',
    intro: {},
    history: [],
    beliefs: [],
    visit: { address: {}, landmark: {}, lat: null, lng: null },
    services: [],
    links: [],
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function records(val: unknown): Record<string, unknown>[] {
  return Array.isArray(val)
    ? val.filter(
        (v): v is Record<string, unknown> => typeof v === 'object' && v !== null,
      )
    : [];
}

function isSocialPlatform(val: unknown): val is SocialPlatform {
  return (
    typeof val === 'string' &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(val)
  );
}

/** Forgiving read, like every other mapper in `lib/api`. */
export function readAboutPage(data: Record<string, unknown>): AboutPageDoc {
  const churchName = readLocalized(data.churchName);
  const visit = (
    typeof data.visit === 'object' && data.visit !== null ? data.visit : {}
  ) as Record<string, unknown>;

  return {
    defaultLanguage: coerceDefaultLanguage(data.defaultLanguage, churchName),
    availableLanguages: localesOf(churchName),
    churchName,
    tagline: readLocalized(data.tagline),
    logoUrl: str(data.logoUrl),
    intro: readLocalized(data.intro),
    history: records(data.history).map((h) => ({
      id: str(h.id) || newItemId(),
      period: readLocalized(h.period),
      title: readLocalized(h.title),
      text: readLocalized(h.text),
    })),
    beliefs: records(data.beliefs).map((b) => ({
      id: str(b.id) || newItemId(),
      title: readLocalized(b.title),
      text: readLocalized(b.text),
    })),
    visit: {
      address: readLocalized(visit.address),
      landmark: readLocalized(visit.landmark),
      lat: num(visit.lat),
      lng: num(visit.lng),
    },
    services: records(data.services).map((s) => ({
      id: str(s.id) || newItemId(),
      name: readLocalized(s.name),
      time: readLocalized(s.time),
    })),
    // An unknown platform has no icon in the app, so it is dropped.
    links: records(data.links)
      .filter((l) => isSocialPlatform(l.platform))
      .map((l) => ({
        id: str(l.id) || newItemId(),
        platform: l.platform as SocialPlatform,
        url: str(l.url),
      })),
    updatedAt: str(data.updatedAt) || null,
    updatedBy: str(data.updatedBy) || null,
    publishedAt: str(data.publishedAt) || null,
    publishedBy: str(data.publishedBy) || null,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidLinkUrl(platform: SocialPlatform, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return false;
  if (platform === 'telegram') return parsed.hostname === 't.me';
  return true;
}

/**
 * Reads coordinates out of a pasted Google Maps link (`@lat,lng`,
 * `?q=lat,lng`, `!3dlat!4dlng`) or a bare "lat, lng".
 */
export function parseMapsLocation(
  input: string,
): { lat: number; lng: number } | null {
  const text = decodeURIComponent(input.trim());
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validLat(lat) && validLng(lng)) return { lat, lng };
  }
  return null;
}

function validLat(n: number) {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function validLng(n: number) {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

function has(value: LocalizedText, locale: ContentLocale): boolean {
  return !!value[locale]?.trim();
}

/** Problems that block a save, as messages for the admin. Empty = valid. */
export function validateAboutPage(content: AboutPageContent): string[] {
  const primary = content.defaultLanguage;
  const errors: string[] = [];

  if (!has(content.churchName, primary)) {
    errors.push('Church name is required in the primary language.');
  }
  // `churchName` decides which languages exist; text in any other language
  // would be dropped on write without a word.
  for (const l of languagesWithText(content)) {
    if (l !== primary && !has(content.churchName, l)) {
      errors.push(
        `Add the church name in ${CONTENT_LOCALE_LABELS[l]}, or its text in that language is not saved.`,
      );
    }
  }
  content.history.forEach((h, i) => {
    if (!has(h.title, primary)) {
      errors.push(`Our story, entry ${i + 1}: title is required.`);
    }
  });
  content.beliefs.forEach((b, i) => {
    if (!has(b.title, primary)) {
      errors.push(`What we believe, item ${i + 1}: title is required.`);
    }
  });
  content.services.forEach((s, i) => {
    if (!has(s.name, primary)) {
      errors.push(`Services, row ${i + 1}: name is required.`);
    }
  });
  content.links.forEach((l, i) => {
    if (!isValidLinkUrl(l.platform, l.url)) {
      errors.push(
        l.platform === 'telegram'
          ? `Follow us, link ${i + 1}: Telegram links must start with https://t.me/`
          : `Follow us, link ${i + 1}: URL must start with https://`,
      );
    }
  });

  const { lat, lng } = content.visit;
  if ((lat === null) !== (lng === null)) {
    errors.push('Visit us: enter both latitude and longitude, or neither.');
  } else if (lat !== null && lng !== null) {
    if (!validLat(lat)) errors.push('Visit us: latitude must be between -90 and 90.');
    if (!validLng(lng)) errors.push('Visit us: longitude must be between -180 and 180.');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * The Firestore shape. Trims text, drops blank languages and any language
 * `churchName` doesn't have ("no field outruns the title"), and never writes
 * `undefined` (the web SDK rejects it).
 */
export function buildAboutPageWrite(
  content: AboutPageContent,
  meta: { uid: string; now: string },
): Record<string, unknown> {
  const errors = validateAboutPage(content);
  if (errors.length) throw new Error(errors[0]);

  const churchName = buildLocalized(content.churchName);
  const languages = localesOf(churchName);
  const text = (value: LocalizedText): LocalizedText => {
    const built = buildLocalized(value);
    const out: LocalizedText = {};
    for (const l of languages) if (built[l] !== undefined) out[l] = built[l];
    return out;
  };

  const out: Record<string, unknown> = {
    defaultLanguage: coerceDefaultLanguage(content.defaultLanguage, churchName),
    availableLanguages: languages,
    churchName,
    tagline: text(content.tagline),
    intro: text(content.intro),
    history: content.history.map((h) => ({
      id: h.id,
      period: text(h.period),
      title: text(h.title),
      text: text(h.text),
    })),
    beliefs: content.beliefs.map((b) => ({
      id: b.id,
      title: text(b.title),
      text: text(b.text),
    })),
    visit: {
      address: text(content.visit.address),
      landmark: text(content.visit.landmark),
      lat: content.visit.lat,
      lng: content.visit.lng,
    },
    services: content.services.map((s) => ({
      id: s.id,
      name: text(s.name),
      time: text(s.time),
    })),
    links: content.links.map((l) => ({
      id: l.id,
      platform: l.platform,
      url: l.url.trim(),
    })),
    updatedAt: meta.now,
    updatedBy: meta.uid,
  };
  const logoUrl = content.logoUrl.trim();
  if (logoUrl) out.logoUrl = logoUrl;
  return out;
}

/**
 * Applies `fn` to every translatable field and returns the new content.
 * Structure (ids, order, URLs, coordinates) is untouched.
 */
export function mapAboutTexts(
  content: AboutPageContent,
  fn: (value: LocalizedText) => LocalizedText,
): AboutPageContent {
  return {
    ...content,
    churchName: fn(content.churchName),
    tagline: fn(content.tagline),
    intro: fn(content.intro),
    history: content.history.map((h) => ({
      ...h,
      period: fn(h.period),
      title: fn(h.title),
      text: fn(h.text),
    })),
    beliefs: content.beliefs.map((b) => ({
      ...b,
      title: fn(b.title),
      text: fn(b.text),
    })),
    visit: {
      ...content.visit,
      address: fn(content.visit.address),
      landmark: fn(content.visit.landmark),
    },
    services: content.services.map((s) => ({
      ...s,
      name: fn(s.name),
      time: fn(s.time),
    })),
  };
}

/** Removes one language from every field (removing a language tab). */
export function clearAboutLocale(
  content: AboutPageContent,
  locale: ContentLocale,
): AboutPageContent {
  return mapAboutTexts(content, (value) => {
    const next = { ...value };
    delete next[locale];
    return next;
  });
}

/**
 * Fields that have primary-language text but none in `locale`: what the app
 * would show in the primary language instead.
 */
export function countMissing(
  content: AboutPageContent,
  locale: ContentLocale,
): number {
  let missing = 0;
  mapAboutTexts(content, (value) => {
    if (has(value, content.defaultLanguage) && !has(value, locale)) missing++;
    return value;
  });
  return missing;
}

/** Languages any field has text in, whether or not `churchName` has them. */
export function languagesWithText(content: AboutPageContent): ContentLocale[] {
  const found = new Set<ContentLocale>();
  mapAboutTexts(content, (value) => {
    for (const l of localesOf(buildLocalized(value))) found.add(l);
    return value;
  });
  return localesOf(Object.fromEntries([...found].map((l) => [l, ''])));
}

/** Just the content, for "has this changed?" comparisons. */
export function contentOf(doc: AboutPageContent): AboutPageContent {
  return {
    defaultLanguage: doc.defaultLanguage,
    churchName: doc.churchName,
    tagline: doc.tagline,
    logoUrl: doc.logoUrl,
    intro: doc.intro,
    history: doc.history,
    beliefs: doc.beliefs,
    visit: doc.visit,
    services: doc.services,
    links: doc.links,
  };
}

/**
 * Compares two pages by what the app would show, ignoring timestamps and
 * blank text. Both sides go through the write path, so `{ en: '' }` and `{}`
 * compare equal.
 */
export function sameAboutContent(
  a: AboutPageContent,
  b: AboutPageContent,
): boolean {
  const key = (c: AboutPageContent) => {
    try {
      const w = buildAboutPageWrite(c, { uid: '', now: '' });
      delete w.updatedAt;
      delete w.updatedBy;
      return JSON.stringify(w);
    } catch {
      // Invalid content can't have been saved, so it differs from anything that was.
      return JSON.stringify(c);
    }
  };
  return key(a) === key(b);
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

const draftRef = () => doc(db, ABOUT_PAGE_COLLECTION, ABOUT_PAGE_DRAFT_ID);
const publishedRef = () =>
  doc(db, ABOUT_PAGE_COLLECTION, ABOUT_PAGE_PUBLISHED_ID);

export async function getAboutPage(): Promise<{
  draft: AboutPageDoc | null;
  published: AboutPageDoc | null;
}> {
  try {
    const [draft, published] = await Promise.all([
      getDoc(draftRef()),
      getDoc(publishedRef()),
    ]);
    return {
      draft: draft.exists()
        ? readAboutPage(draft.data() as Record<string, unknown>)
        : null,
      published: published.exists()
        ? readAboutPage(published.data() as Record<string, unknown>)
        : null,
    };
  } catch (err) {
    console.error('[aboutPageApi] getAboutPage error', err);
    throw new Error('Failed to load the About page');
  }
}

/**
 * Writes the whole draft. `setDoc`, not `updateDoc`: the first save is also
 * what creates the document.
 */
export async function saveAboutPageDraft(
  content: AboutPageContent,
  uid: string,
): Promise<AboutPageDoc> {
  const data = buildAboutPageWrite(content, {
    uid,
    now: new Date().toISOString(),
  });
  try {
    await setDoc(draftRef(), data);
  } catch (err) {
    console.error('[aboutPageApi] saveAboutPageDraft error', err);
    throw new Error('Failed to save the draft');
  }
  return readAboutPage(data);
}

/**
 * Copies the saved draft over `about_page/published`: what every app user
 * sees. Reads the draft inside the transaction, so what goes live is what is
 * stored, not whatever the form happens to hold.
 */
export async function publishAboutPage(uid: string): Promise<AboutPageDoc> {
  const now = new Date().toISOString();
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(draftRef());
      if (!snap.exists()) throw new Error('Save a draft before publishing.');
      const draft = snap.data() as Record<string, unknown>;
      const errors = validateAboutPage(contentOf(readAboutPage(draft)));
      if (errors.length) throw new Error(errors[0]);
      const data = { ...draft, publishedAt: now, publishedBy: uid };
      tx.set(publishedRef(), data);
      return readAboutPage(data);
    });
  } catch (err) {
    console.error('[aboutPageApi] publishAboutPage error', err);
    throw err instanceof Error ? err : new Error('Failed to publish');
  }
}
