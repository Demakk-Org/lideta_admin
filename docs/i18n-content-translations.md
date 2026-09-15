# Content Translations — Implementation Plan

Translating the **content the admin authors** (events, news, categories, quizzes,
questions) — not the admin dashboard chrome. Dashboard UI stays English.

This is the admin-side answer to open question #6 in the Flutter app's
`LOCALIZATION_IMPLEMENTATION.md` ("localize server-driven content too, or UI chrome
only?"). The app already ships **slang** with `base_locale: en` and locales
**en / am / om**; this plan makes Firestore content follow the same contract.

## Locked decisions

| Decision | Value |
|---|---|
| Locales | `en` (base), `am` (Amharic), `om` (Afan Oromo) — mirrors `slang.yaml` |
| Base locale | `en`. Existing top-level fields **are** the English content; nothing migrates. |
| Storage | Sidecar `translations` map on the same doc, holding only non-base locales |
| Fallback | Any missing locale/field falls back to the base field (same as slang's `fallback_strategy: base_locale`) |
| Authoring | Manual — a language tab strip in each form modal. No AI/CSV. |
| Scope | `events`, `news`, `event_categories`, `quiz_categories`, `quizzes`, `quizzes/{id}/questions` |
| Out of scope (for now) | bible studies, bible study groups + categories, audios, daily verse. The primitives below are generic — adding them later is mechanical. |

---

## 1. The contract

Base fields stay exactly where they are. Translations are additive:

```jsonc
// events/{id}
{
  "title": "Evening Worship Service",     // base (en) — unchanged, still the source of truth
  "programme": "Sunday Programme",
  "short_description": "An evening sermon…",
  "tags": ["Worship", "Evening"],
  "location": { "primary": "Main Hall", "secondary": "2nd floor" },
  "description": [
    { "type": "title",     "value": "Welcome" },
    { "type": "banner",    "value": "https://…/banner.jpg" },
    { "type": "paragraph", "value": "Join us…" }
  ],
  "category": "Worship",                  // NOT translated — see §2
  "imageUrl": "https://…",                // NOT translated
  "start_date_time": "…",                 // NOT translated

  "translations": {
    "am": {
      "title": "የምሽት አምልኮ",
      "short_description": "…",
      "description": [                    // SAME length, SAME type at each index
        { "type": "title",     "value": "እንኳን ደህና መጡ" },
        { "type": "banner",    "value": "" },   // "" = reuse the base banner URL
        { "type": "paragraph", "value": "…" }
      ]
      // `programme`, `tags`, `location` omitted -> fall back to English
    },
    "om": { "title": "…" }                // partial locales are valid
  }
}
```

**Invariants** (enforced by the write-side sanitizer, §4):

1. `translations` only ever contains non-base locales (`am`, `om`). Never `en`.
2. A locale object only contains **translatable text keys** for that collection.
   URLs, ids, dates, numbers, enums, `status`, `author_id`, `correctOptionId` are
   never in it.
3. Per-locale keys are **optional and independent** — omit what isn't translated yet.
4. **Index-aligned arrays.** A translated `description` / `content` / `options`
   array must have the same length as the base array, and blocks must have the same
   `type` at each index. This is non-negotiable for `options`, because
   `correctOptionId` is a positional index into it.
5. Empty strings mean "fall back to base", they do not mean "blank". An entirely
   empty locale is stripped before write, so we never persist `{ "am": {} }`.

### Client (Flutter) read contract

The app team needs this one helper; everything else falls out of it.

```dart
/// Base-locale fallback, per field. `doc` is the raw Firestore map.
String tr(Map<String, dynamic> doc, String field, AppLocale locale) {
  if (locale == AppLocale.en) return doc[field] as String? ?? '';
  final v = (doc['translations'] as Map?)?[locale.languageCode]?[field];
  return (v is String && v.trim().isNotEmpty) ? v : (doc[field] as String? ?? '');
}
```

For block arrays, walk the base array and take `translations[locale].description[i].value`
when it's a non-empty string, else the base `value`. Same for `options`.

> ⚠️ **`answerText` grading.** Short-answer questions are graded by comparing the
> user's typed answer against `answerText`. If the app renders the question in
> Amharic, the user answers in Amharic — so the app must grade against the
> **translated** `answerText` for the active locale (falling back to base). Flag
> this to the app team; getting it wrong silently marks every non-English
> short-answer wrong.

---

## 2. Two things to fix BEFORE any of this works

### 2a. `updateEvent` / `updateNews` create a new doc instead of updating (blocker)

[events.ts:342](../src/lib/api/events.ts#L342) and [news.ts:202](../src/lib/api/news.ts#L202)
both call `addDoc` — the real `updateDoc` is commented out one line above, with a
`TODO: … for development purpose only … revert when done`.

Translation authoring is an **edit-heavy** workflow: an admin opens an existing
event and adds an Amharic tab. Under the current code that forks a brand-new event
document every single time. **Revert both to `updateDoc` first** — this plan is
unshippable otherwise. (It is also, independently, a live bug: every edit today
duplicates the record.)

### 2b. `events.category` / `news.category` store the category *name*, not an id

`EventDoc.category` is the category **name string** (`"Worship"`), and the form's
`<select>` uses names as values. So translating `event_categories.name` cannot touch
the base name — it's a foreign key in disguise.

**This plan's stance:** the base `name` remains the join key and is never rewritten.
`event_categories` / `quiz_categories` get a `translations` map for **display only**;
the app looks the category name up and renders the translated label. Events keep
storing the English name.

That works, but it's fragile — renaming a category in English still orphans every
event pointing at it (true today, too). **Recommended follow-up (separate PR, not
blocking):** migrate `events.category` / `news.category` to `categoryId`, the way
`bible_studies.categoryId` and `quizzes.categoryId` already do it. Do it before the
category list grows.

---

## 3. Shared primitives (new files)

### `src/lib/i18n/contentLocales.ts`

```ts
export const CONTENT_LOCALES = ['en', 'am', 'om'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const BASE_CONTENT_LOCALE = 'en' satisfies ContentLocale;
export type TranslatedLocale = Exclude<ContentLocale, 'en'>;   // 'am' | 'om'
export const TRANSLATED_LOCALES = ['am', 'om'] as const satisfies readonly TranslatedLocale[];

export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  en: 'English',
  am: 'አማርኛ',
  om: 'Afaan Oromoo',
};

/** Sidecar map: partial per-locale, partial per-field. */
export type Translations<T> = Partial<Record<TranslatedLocale, Partial<T>>>;
```

### `src/lib/i18n/translations.ts`

Pure functions, no React, no Firestore — mirrors the `docs/architecture.md` rule that
`lib/` stays framework-free.

- `sanitizeTranslations<T>(raw, allowedKeys, opts)` → drops unknown keys, trims
  strings, removes empty strings/arrays, drops locales that end up empty, never emits
  `en`. **This is the single choke point every collection calls on write.**
- `alignBlocks(base, translated)` → forces a translated block array to the base
  array's length and per-index `type`, filling missing entries with `{ type, value: '' }`
  and discarding extras. Throws if `base` is missing. Used for events `description`,
  news `content`.
- `alignOptions(base, translated)` → same for `string[]`; pads/truncates to
  `base.length` so `correctOptionId` stays valid.
- `readTranslations<T>(raw, allowedKeys)` → the read-side counterpart, so the
  whitelisting `mapDoc`s (§4c/§4d) don't silently drop the field.
- `localeCompletion(base, translations, keys)` → `Record<TranslatedLocale, 'empty' | 'partial' | 'complete'>`, for the tab badges and list-view indicators.

### `src/components/ui/LocaleTabs.tsx`

A tab strip: `English | አማርኛ | Afaan Oromoo`, each with a completion dot
(hollow / half / filled) driven by `localeCompletion`. Props:
`{ active, onChange, completion }`. Used unchanged by all five form modals.

---

## 4. Per-collection changes

For each: add the field to the type, add it to the write payload (**most of these
sanitizers are strict whitelists — adding it to the TS type alone silently drops
it**), add it to the read mapper if the mapper whitelists.

### 4a. `events.ts`

- Translatable keys: `title`, `programme`, `short_description`, `tags`, `location`
  (`primary`, `secondary`), `description` (block `value`s only — `banner` values are
  URLs, blank ⇒ base).
- `EventDoc.translations?: Translations<EventTranslatableFields>`.
- `sanitizeEventForWrite` — run `sanitizeTranslations` + `alignBlocks(base.description, …)`.
- Read: `listEvents` spreads raw data, so `translations` survives — but run it through
  `readTranslations` so a malformed doc can't crash the form.

### 4b. `news.ts`

Same as events. Keys: `title`, `short_description`, `tags`, `content` (blocks).
Not translated: `status`, `author_id`, `imageUrl`, `createdAt`, `category`.

### 4c. `quizzes.ts`

- Keys: `title`, `description`.
- ⚠️ `sanitizeWrite` ([quizzes.ts:173](../src/lib/api/quizzes.ts#L173)) is a literal-object
  whitelist, and `updateQuiz` lists its fields explicitly — `translations` must be
  added in **both**. `mapDoc` whitelists on read too.

### 4d. `questions.ts`

- Keys: `text`, `options`, `explanation`, `answerText`.
- Never translated: `correctOptionId`, `questionType`, `order`, `referenceVerse`, `id`, `quizId`.
- `buildWritePayload` ([questions.ts:216](../src/lib/api/questions.ts#L216)) is a literal
  whitelist → add `translations`, and run `alignOptions(payload.options, t.options)` so a
  translated array can never desync from `correctOptionId`.
- `mapDoc` ([questions.ts:115](../src/lib/api/questions.ts#L115)) whitelists → add it there.
- True/False questions store `options: []` (labels live in the app's slang strings),
  so there is nothing to translate but `text` / `explanation`. The form must reflect that.

### 4e. `eventCategories.ts` / `quizCategories.ts`

- Key: `name` only. Base `name` is immutable-as-a-join-key (§2b).
- `eventCategories` spreads raw input on write (no whitelist) — still route it through
  `sanitizeTranslations` rather than trusting the caller.
- `quizCategories.updateQuizCategory` explicitly whitelists `{ name }` → add `translations`.

### 4f. Redux slices

No structural change. `translations` rides along inside the existing `items` payloads.
Only the thunk **input** types widen.

---

## 5. Form UI

Pattern, identical in all five modals:

```ts
type EventLocaleFields = {
  title: string; programme: string; shortDesc: string; tagsText: string;
  locationPrimary: string; locationSecondary: string; descItems: FormDescItem[];
};

const [activeLocale, setActiveLocale] = useState<ContentLocale>('en');
const [byLocale, setByLocale] = useState<Record<ContentLocale, EventLocaleFields>>(…);
const f = byLocale[activeLocale];
```

Non-translatable fields (category select, dates, image upload, status, `correctOptionId`,
question type) stay in their own flat `useState` and are **only rendered on the base
tab** — showing them on the Amharic tab implies they're per-locale, which they aren't.

**Structure is locked to the base tab.** On `am` / `om`:

- `DescriptionBlocksEditor` gets `readOnlyStructure` + `baseItems` props: the type
  `<select>`, Add Block, Remove, and drag-reorder are all disabled, and each input
  renders the **English text above it as a read-only reference** so the translator can
  see what they're translating. Blocks are seeded from the base structure with empty values.
- Same for question options: option count and the correct-answer radio come from the
  base tab; the translation tab shows N text inputs, each labelled with the English option.
- Banner blocks on a translation tab: keep the upload control (a locale may want a
  banner with translated text baked in), but blank ⇒ inherit the base URL.

On submit, build `translations` from the non-base slices, run it through
`sanitizeTranslations`, and drop locales that came out empty. **Translation is never
required** — an admin can ship English-only and fill in Amharic later, exactly as the
app's base-locale fallback intends.

Files: `EventsFormModal`, `DescriptionBlocksEditor`, `NewsFormModal`,
`NewsDescriptionBlocksEditor`, `QuizFormModal`, `QuestionFormModal`,
`EventCategoriesClient`, `QuizCategoriesClient`.

---

## 6. Phases

| Phase | Work | Notes |
|---|---|---|
| **0** | Revert `updateEvent`/`updateNews` to `updateDoc` (§2a) | Blocker. Standalone, mergeable now. |
| **1** | `contentLocales.ts`, `translations.ts`, `LocaleTabs.tsx` | Pure additions, nothing consumes them yet. |
| **2** | Categories (`event_categories`, `quiz_categories`) end-to-end | Smallest surface — one field. Proves the pattern. |
| **3** | Events + News (api → slice → modal → blocks editor) | The bulk. Blocks editor is the fiddly part. |
| **4** | Quizzes + Questions | `alignOptions` + `correctOptionId` safety is the risk here. |
| **5** | Translation-status column in list views | Optional polish; `localeCompletion` already exists by then. |

Phases 2–4 are independent of each other once phase 1 lands, so they can go in parallel.

**No data migration.** Existing docs have no `translations` key, which reads as "English
only" — which is exactly what they are.

---

## 7. Test checklist

- [ ] Editing an existing event **updates** it and does not create a duplicate (§2a).
- [ ] Saving with no translations produces a doc with **no** `translations` key.
- [ ] A locale filled in then blanked out is removed from the map, not left as `{}`.
- [ ] `translations.en` can never be written.
- [ ] Adding a description block on the base tab after translating: the `am` array
      re-aligns to the new length instead of desyncing.
- [ ] Multiple-choice: reordering/adding options on base keeps `correctOptionId`
      pointing at the same *option*, and `am.options` stays the same length.
- [ ] True/False question exposes no options on the translation tabs.
- [ ] Round-trip: save with `am`, reload the modal, the Amharic tab is populated.
- [ ] Firestore doc stays well under 1 MB with 3 locales of block content (worst
      realistic case is a long news article — check one).

## 8. Handoff to the Flutter app

The admin can ship all of this and the app keeps working unchanged (it just ignores an
unknown `translations` key). Reading it is a separate app-side task; give the app team
§1 — the shape, the fallback helper, and the `answerText` grading warning.
