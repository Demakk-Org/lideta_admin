# Course translations v2 — every text field owns its translations

> **Status: the admin side is built and the data is migrated.** Every document
> in Firestore is on this shape; the v1 sidecar and the `content/{lang}`
> subcollection are gone. The app side is next — hand the team
> [course-translations-frontend-contract.md](course-translations-frontend-contract.md).
>
> Because this is still development, §5.1's tolerant reader was **dropped**: the
> app reads v2 only, and there is no other shape left in the database to read.

Replaces `COURSE_TRANSLATIONS_PLAN.md`. That plan put translations in a sidecar
map (`translations.{lang}.{field}`) beside legacy flat fields, and lesson bodies
in per-language subdocuments. This one inverts it: **a translatable field *is* a
map of languages.**

```jsonc
// v1 — sidecar beside a legacy mirror          // v2 — the field is the map
{                                                {
  "title": "Walking with God",                     "title": {
  "translations": {                                  "en": "Walking with God",
    "en": { "title": "Walking with God" },           "am": "ከእግዚአብሔር ጋር መመላለስ"
    "am": { "title": "ከእግዚአብሔር ጋር መመላለስ" }         }
  }                                              }
}
```

Why v2 is better where it counts:

- **One place per field.** v1 wrote the English title twice — once flat, once in
  `translations.en` — and a publish gate existed largely to catch them drifting.
  In v2 there is nothing to drift.
- **Structure cannot desync.** v1 stored a whole parallel block array per
  language in `content/{lang}`; keeping three arrays the same length and the
  same type at every index needed an alignment pass on every write. In v2 there
  is one array, and only the text inside a block varies by language.
- **Adding a language is additive.** `title.am` is a single surgical field
  write. No new document, no mirror to update.

## 0. Decisions taken

| | Decision |
|---|---|
| Field shape | **Replace in place.** `title` / `description` / `shortDescription` / `name` become maps. No legacy flat mirror. |
| Lesson body | **Inline in the lesson document.** One `content` array; each block's text is a locale map. No `content/{lang}` subcollection. |
| Existing data | **Convert, then delete.** Migrate v1 → v2, verify, then drop `translations` and the `content/{lang}` documents. The Amharic *Walking with God* work is preserved. |

---

## 1. The shape

Two types carry everything:

```ts
type LocalizedText = { [lang: string]: string };    // { en: "…", am: "…" }
type LocalizedList = { [lang: string]: string[] };  // list-block items
```

**The rule for what gets a map:** a field is localized if and only if a human
reads it as prose. Never localized — ids, URLs, enum values, numbers, dates,
booleans, `status`, `order`, `author_id`, `categoryId`, `correctOptionId`,
`durationSeconds`, and the verse coordinates on a quote block.

### 1.1 `courses/{courseId}`

```jsonc
{
  "title":          { "en": "Walking with God", "am": "ከእግዚአብሔር ጋር መመላለስ" },
  "lowerCaseTitle": { "en": "walking with god", "am": "ከእግዚአብሔር ጋር መመላለስ" },
  "description":    { "en": "What happens after you know who God is…", "am": "…" },

  "availableLanguages": ["en", "am"],
  "defaultLanguage": "en",

  "coverImageUrl": "https://…",
  "categoryId": "christian-living",
  "ageGroup": "all",
  "level": "beginner",
  "lessonCount": 6,
  "sequential": true,
  "hasFinalQuiz": true,
  "lessonQuizCount": 5,
  "prerequisiteCourseIds": ["knowing-god"],
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

Gone: the flat `title` / `description` strings and the `translations` map.

`lowerCaseTitle` is **derived on write**, per language — search is a prefix
range on `lowerCaseTitle.{lang}` and Firestore cannot lowercase for you. For
Amharic it equals the title (Geʽez is unicameral); write it anyway, the query
needs the field to exist.

`availableLanguages` is also **derived on write**, from the key set of `title`.
It is not authored, because the catalog filters on it with `array-contains` and
never opens the maps — a language listed there with no title is a course that is
listed and then renders blank. Keeping the name from v1 means the indexes and
the app's existing `languageCodes` parsing carry over unchanged.

`defaultLanguage` must be a key of `title`. It is what a member falls back to.

### 1.2 `courses/{courseId}/lessons/{lessonId}`

```jsonc
{
  "order": 1,
  "title":            { "en": "From Knowing to Walking", "am": "ከማወቅ ወደ መመላለስ" },
  "shortDescription": { "en": "What changes on the Monday…", "am": "…" },
  "category":         { "en": "Foundations", "am": "መሠረቶች" },
  "tags":             { "en": ["faith", "basics"], "am": ["እምነት", "መሠረታዊ"] },

  "availableLanguages": ["en", "am"],
  "content": [ /* §1.3 */ ],

  "author_id": "abune-yohannes",
  "imageUrl": "https://…",
  "estimatedMinutes": 12,
  "hasQuiz": true,
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

A lesson carries no `defaultLanguage` — it mirrors its course's, so the two can
never disagree about which language is primary. `category` here is the
free-form label, not the course category id, so it is prose and is localized.

### 1.3 Content blocks

The array is shared. Only the text inside a block varies.

```jsonc
{ "type": "title",     "value": { "en": "A walk, not a position", "am": "…" } }

{ "type": "paragraph", "value": { "en": "Scripture almost never…", "am": "…" } }

{ "type": "list",      "value": { "en": ["Prayer — speaking to…"],
                                  "am": ["ጸሎት — ላወቃችሁት…"] } }

{ "type": "quote",     "value": { "text": { "en": "Enoch walked…", "am": "ሄኖክም አካሄዱን…" },
                                  "ref": "{\"book\":1,\"chapter\":5,\"verse\":24}",
                                  "isBibleVerse": true } }

{ "type": "banner",    "value": "https://…/banner.jpg" }

{ "type": "video",     "value": { "videoType": "youtube",
                                  "url": "dQw4w9WgXcQ",
                                  "thumbnailUrl": "https://…",
                                  "durationSeconds": 600,
                                  "title":   { "en": "Lecture one", "am": "…" },
                                  "caption": { "en": "…", "am": "…" } } }

{ "type": "audio",     "value": { "url": "https://…/track.mp3",
                                  "audioId": "sermon-14",
                                  "thumbnailUrl": "https://…",
                                  "durationSeconds": 420,
                                  "title":   { "en": "…", "am": "…" },
                                  "caption": { "en": "…", "am": "…" } } }
```

`ref` and `isBibleVerse` stay flat: they are coordinates, and a translation that
could move them would send a tapped verse to the wrong chapter. `banner` stays a
plain URL — **per-language artwork is out of scope for v2**; if it is wanted
later it becomes a `LocalizedText` of URLs and nothing else changes.

### 1.4 `course_categories/{categoryId}`

```jsonc
{
  "name":        { "en": "Christian Living", "am": "የክርስትና ኑሮ" },
  "description": { "en": "…", "am": "…" },
  "availableLanguages": ["en", "am"],
  "imageUrl": "https://…"
}
```

No `defaultLanguage` — categories fall back to `en`.

### 1.5 Resolution

One helper, identical on both sides:

```
value[selected] → value[defaultLanguage] → value['en'] → ''
```

An **empty string counts as absent**, so a half-filled translation falls back to
real text instead of rendering a blank title. Only the last step may yield `''`.

The helper returns *which* language it landed on. When that is not the language
the member asked for, the UI says so — a silent fallback is the failure mode
worth avoiding.

---

## 2. Document size — measured, not assumed

v1 rejected inlining the body because "three languages triples it and a long
lesson can approach the 1 MB cap". Against the actual catalog that does not hold:

| | English today | At 3 languages |
|---|---|---|
| Largest lesson body | 4.8 KB | ~20 KB — **2% of the 1 MB cap** |
| Median lesson body | 1.6 KB | ~7 KB |
| Every body in the catalog | 44 KB | ~132 KB |
| Largest single course | 15 KB | ~63 KB |

(Amharic runs about 1.6× English in UTF-8 bytes; the 3-language figures assume
Amharic and Afan Oromo at that rate.)

So the lesson list downloading all three languages costs ~132 KB for the whole
catalog. That is smaller than one cover image. **Inline is the right call at
this content size.**

Revisit only if a single lesson body passes ~250 KB in one language — at that
point it is a book chapter, and the fix is to split the lesson, not the schema.

---

## 3. Queries and indexes

| Query | v2 | Change |
|---|---|---|
| Language filter | `where('availableLanguages', array-contains, code)` | none |
| Catalog facets (`categoryId` / `level` / `ageGroup` + `createdAt`) | unchanged | none — they never touched translation fields |
| Title search | prefix range on `lowerCaseTitle.{lang}` | **3 indexes replaced** |

Concretely, in `firestore.indexes.json` replace the three
`status + availableLanguages + translations.{lang}.lowerCaseTitle` composites
with `status + availableLanguages + lowerCaseTitle.{lang}`. The eight catalog
composites added for v1 stay exactly as they are.

Nested field paths are first-class in Firestore, so `lowerCaseTitle.en` needs no
special handling beyond the index.

---

## 4. Authoring UX

### 4.1 Creating

A new course or lesson is **English only** and shows no language UI at all —
one Title input, one Description input. Translating is never part of creating.

### 4.2 The `+` affordance

After it exists, the course card and the lesson row show the languages the
document actually has, followed by a `+`:

```
  Walking with God                    [EN] [አማ] [＋]
  Knowing God                         [EN] [＋]
```

`+` opens that document's edit modal with a small menu of the languages it does
not yet have. Picking one adds a tab, switches to it, and renders **one empty
input per translatable field**, each showing the default-language text above it
as read-only reference:

```
 ┌ English ─┬ አማርኛ ●─┬────────────────────────────┐
 │                                                │
 │  Title (አማርኛ)                                  │
 │  ┌────────────────────────────────────────────┐│
 │  │ Walking with God                           ││ ← reference, read-only
 │  └────────────────────────────────────────────┘│
 │  ┌────────────────────────────────────────────┐│
 │  │ ከእግዚአብሔር ጋር መመላለስ                          ││ ← the input
 │  └────────────────────────────────────────────┘│
 │                                                │
 │  Description (አማርኛ)          … same pattern    │
 └────────────────────────────────────────────────┘
```

A tab is only persisted if its **title** is non-empty. Closing the modal with an
empty tab writes nothing — no `{"am": ""}` placeholder, which would list the
course under Amharic and then render blank.

### 4.3 Rules the form enforces

- **Non-translatable fields render only on the default-language tab.** Showing
  the category select or the cover upload on the Amharic tab implies they are
  per-language, which they are not.
- **Structure belongs to the default language.** Add Block, Remove, reorder and
  the type `<select>` appear only on that tab. Other tabs get one input per
  existing block. Changing the structure re-aligns every other language in the
  same edit.
- **Blank inherits.** A blank field on a translation tab is written as absent,
  and the reader falls back. It never renders as empty.
- **Removing a language** is an `×` on a non-default chip inside the modal,
  behind a confirm. It deletes that key from every field on the document.

### 4.4 Publish gate

Two checks, replacing v1's four:

1. `availableLanguages` equals the key set of `title` (it is derived, so this
   only ever fires on a document written by a seeder or by hand).
2. Every language the course lists has a non-empty title on the course **and**
   on each published lesson.

The v1 checks for "legacy mirror out of step" and "missing `content/{lang}`
document" disappear with the things they were guarding.

---

## 5. Migration

`scripts/migrate-course-translations-v2.mjs`, three phases, dry-run by default,
same shape as the two existing migration scripts.

**Phase `convert`** — for each course, lesson and category:

- `title` ← `{ ...translations[lang].title }`, falling back to the flat string
  for any document v1 never reached. Same for `description`,
  `shortDescription`, `name`.
- `lowerCaseTitle` ← derived per language from the new `title`.
- `category` and `tags` on a lesson ← `{ en: <current value> }`.
- `content` ← the `content/{lang}` bodies merged block by block into one array
  of locale maps, using the default language's array for structure and type.
- `availableLanguages` ← the key set of the new `title`.
- Idempotent: a document whose `title` is already a map is skipped.

**Phase `verify`** — re-reads everything and asserts: every `title` is a map;
`availableLanguages` equals its key set; `defaultLanguage` is one of them; every
block has the same type in every language and the same count; no lesson still
has a `content` subcollection with documents the new array does not cover.
Fails loudly rather than proceeding.

**Phase `drop`** — deletes `translations` from every document and every
`courses/*/lessons/*/content/{lang}` document. Refuses to run if `verify` did
not pass.

### 5.1 Sequencing — not used (development phase)

> Superseded: the tolerant reader below was for avoiding an outage on *released*
> builds. In development the conversion simply ran, and the app reads v2 only.


Replacing fields in place means the moment `convert` runs, a client reading
`title` as a string breaks. The fix is not to delay the migration but to make
**one app release read both shapes**:

```dart
// json_utils.dart — deleted once `drop` has run and the old build is retired.
LocalizedText parseLocalized(dynamic value, {String legacyLanguage = 'en'}) {
  if (value is Map) return {…};                    // v2
  if (value is String) return {legacyLanguage: value};  // v1 / pre-translations
  return const {};
}
```

That is ~15 lines in one helper and it removes the flag day entirely:

1. Ship the app build with the tolerant reader. It writes nothing, so it is safe
   against both shapes.
2. Ship the admin, which **writes v2 only**.
3. Run `convert`. Old builds break here — but the tolerant build is already out,
   so the window is "users who have not updated", not "everyone".
4. Run `verify`, then `drop`.
5. Delete the v1 branch of `parseLocalized` in the release after that.

Steps 1–2 can be the same release. Only step 3 is irreversible, and it is a
script you can dry-run first.

---

## 6. Work breakdown

### Admin (`lideta_admin`)

| File | Change |
|---|---|
| `src/lib/i18n/localizedText.ts` | **new** — `LocalizedText`, `resolveLocalized`, `buildLocalized` (trim, drop empty, derive key set), `localesOf` |
| `src/lib/i18n/translations.ts` | **delete** — the sidecar builder/reader has no v2 equivalent |
| `src/lib/i18n/contentLocales.ts` | keep as is |
| `src/lib/api/courses.ts` | `CourseDoc` fields become `LocalizedText`; `buildCourseLocalization` → derive `lowerCaseTitle` + `availableLanguages` from `title`; publish gate down to the two §4.4 checks |
| `src/lib/api/lessons.ts` | same for `title`/`shortDescription`/`category`/`tags`; **delete** `getLessonBodies`, `writeBodies`, `alignTranslatedContent`, and the content-subcollection cleanup in `deleteLesson` |
| `src/lib/api/courseCategories.ts` | `name`/`description` become maps |
| `src/components/ui/LocaleTabs.tsx` | takes the document's own language set + an `onAddLanguage`; renders the `+` and the `×` |
| `CourseFormModal`, `LessonFormModal`, `CourseCategoriesClient` | per-field maps; non-translatable fields only on the default tab |
| `LessonTranslationBlocksEditor` | keeps its shape; reads/writes block-value maps instead of a parallel array |
| `CoursesList`, `LessonsModal` | language chips + `+` entry point |
| `firestore.indexes.json` | replace the 3 search composites |
| `scripts/apply-course-translation.mjs` | writer updated to v2; **the `translations/*.json` source files stay valid as they are** |
| `scripts/backfill-course-translations.mjs` | retire once `drop` has run |

### App (`new_church_project`)

| File | Change |
|---|---|
| `data/model/json_utils.dart` | `parseTranslations`/`resolveTranslated` → `parseLocalized`/`parseLocalizedList`/`resolveLocalized`, with the §5.1 tolerant reader |
| `data/model/course.dart`, `lesson.dart`, `course_category.dart` | localized fields change type — **see §7 on Hive ids** |
| `data/data_source/remote_course_data_source.dart` | search switches to `lowerCaseTitle.{lang}`; **delete** the `content/{lang}` fetch — the body arrives with the lesson |
| `data/data_source/local_course_data_source.dart` | the `contentsByLanguage` merge on cache write disappears with the per-language documents |
| `domain/entity/*_model.dart` | getters follow the model types |
| `presentation/ui/content_language.dart`, `course_card.dart`, `lesson_tile.dart` | resolve through the new helper; the "available in X only" badge is unchanged in spirit |
| `test/features/courses/course_translations_test.dart` and siblings | rewritten against the new shape; keep the legacy-document case as the regression guard |

---

## 7. Risks

**Hive field types change, and that is the one thing a cache cannot absorb.**
`Course.title` is `@HiveField(1) String` today; a box written by the current
build holds a string there. Reading it back as `Map<String, String>` is a type
error, and it happens on a device that has already updated — the worst place to
find out.

Do not reuse those ids. Burn them and claim new ones:

| Model | typeId | Ids in use | Burn | Next free |
|---|---|---|---|---|
| `Course` | 79 | 0–17 (10 already burned) | 1 `title`, 2 `description` | **18** |
| `Lesson` | 80 | 0–15 | title, shortDescription, category, tags, content | **16** |
| `CourseCategory` | 81 | 0–4 | name, description | **5** |

The v1 fields `languageCodes` (15), `translations` (16) and `defaultLanguage`
(17) on `Course` — and their counterparts on the other two — keep their ids;
only `translations` becomes dead and gets burned in turn.

**Other risks**

| Risk | Mitigation |
|---|---|
| `convert` runs before the tolerant build is out | §5.1 sequencing; `convert` is dry-run by default and prints every document it would touch |
| Firestore cannot patch an array element, so adding a language to a body rewrites the whole `content` array | Read-modify-write inside a transaction; two admins translating the same lesson at once is otherwise last-write-wins |
| A seeder writes a flat `title` again after the migration | `scripts/seed-walking-with-god.mjs` still emits the pre-translation shape — update it in the same PR or it re-introduces v1 documents |
| Search index missing for a language | Ship all three; a missing composite fails silently as an empty result, the same trap as the quiz pagination indexes |

---

## 8. Out of scope

Quiz translations (`quizzes/{id}` and its `questions`), and the other content
types in `docs/i18n-content-translations.md` (events, news, categories). The
primitives in §1.5 and the `+` UX in §4.2 are generic — applying them there is
mechanical, and worth doing only once this has settled.
