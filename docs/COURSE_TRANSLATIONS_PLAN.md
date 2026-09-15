> **Superseded by [COURSE_TRANSLATIONS_V2_PLAN.md](COURSE_TRANSLATIONS_V2_PLAN.md).**
> The sidecar shape described below (`translations.{lang}.{field}` beside legacy
> flat fields, lesson bodies in `content/{lang}` subdocuments) is being replaced
> by per-field locale maps — `title: {en, am}`. Kept for the migration's sake:
> §4 is what the data looks like *before* the v2 conversion runs, and Phase 4b
> (age group) shipped and is unaffected.

# Course translations — implementation plan

Goal: a course (its lessons, categories and text) can exist in **English,
Amharic and Afan Oromo**, members read it in their language, and the catalog
filter gains a **Language** control.

App languages are already fixed by `AppLanguage` (`lib/common/utils/types.dart:937`):
`english` / `amharic` / `afanOromo`. Codes used on the wire: `en`, `am`, `om` —
the same codes slang uses, so `AppLanguage.appLocale.languageCode` is the single
source of truth for the string.

---

## 1. The shape decision

Three options were on the table:

| | Shape | Verdict |
|---|---|---|
| A | One course document **per language**, linked by a `translationGroupId` (how `bible_sources` does it) | ✗ Triples the catalog, splits progress (`course_progress` is keyed by course id), and every prerequisite/quiz id has to be language-aware |
| B | Everything embedded: `translations.{lang}` on the course **and** the lesson, lesson bodies included | ✗ `getLessons` already downloads every lesson body up front; ×3 languages triples that, and a long 3-language lesson can approach the 1 MB doc cap |
| C | **Hybrid** — language-neutral doc + embedded map for short text, lesson **bodies** in a per-language subdocument | ✓ Recommended |

### Recommended shape (C)

```
courses/{courseId}
  categoryId, level, ageGroup, sequential, hasFinalQuiz, lessonQuizCount,
  prerequisiteCourseIds, lessonCount, status, createdAt   ← unchanged, language-neutral
  defaultLanguage: "en"
  availableLanguages: ["en", "am"]                        ← query filter
  translations: {
    en: { title, description, lowerCaseTitle },
    am: { title, description, lowerCaseTitle }
  }
  title, description, lowerCaseTitle                      ← legacy mirror of defaultLanguage (keep writing)

courses/{courseId}/lessons/{lessonId}
  order, author_id, imageUrl, category, tags, estimatedMinutes,
  hasQuiz, status, createdAt                              ← unchanged
  availableLanguages: ["en", "am"]
  translations: { en: { title, shortDescription }, am: { … } }   ← list-tile text only
  title, shortDescription                                 ← legacy mirror
  content: [...]                                          ← legacy mirror of defaultLanguage

courses/{courseId}/lessons/{lessonId}/content/{lang}
  blocks: [ {type, value}, … ]                            ← the heavy part, fetched on open

course_categories/{categoryId}
  translations: { en: { name, description }, am: { … } }
  name, description                                       ← legacy mirror
```

Why this split:

- **Progress stays language-agnostic.** `course_progress` keys off course id and
  lesson id, so switching reading language mid-course keeps the streak, the
  sequential gate, and the completion state. This is the main reason not to fork
  documents per language.
- **The lesson list gets cheaper, not dearer.** Today `getLessons` pulls every
  body. After this it pulls titles only; a body is one extra read when a lesson
  is opened. Three languages then cost *less* traffic than one does today.
- **Nothing breaks on day one.** Every legacy top-level field keeps being
  written as a mirror of `defaultLanguage`, and the client falls back to it, so
  already-seeded courses render untouched and can be back-filled at leisure.

### Resolution / fallback chain

`translations[selected]` → `translations[defaultLanguage]` → `translations['en']`
→ legacy top-level field. Only the *last* step is allowed to yield `''`.

When the resolved language ≠ the selected one, the UI says so (badge on the
card / header: "Available in English only"). Silent fallback is the failure mode
to avoid — a member who filtered to Amharic and got English text should be told
why.

---

## 2. Phases

### Phase 1 — Backend contract (blocking; nothing else lands without it)

1. Update `COURSES_BACKEND_SPEC.md`:
   - §2 `courses`: add `defaultLanguage`, `availableLanguages`, `translations`;
     note the legacy mirror rule and that `availableLanguages` **must** list
     exactly the keys of `translations` (the filter trusts it, the renderer
     doesn't).
   - §3 `lessons`: add `availableLanguages`, `translations`; move `content` to
     §3.1 as `lessons/{id}/content/{lang}.blocks`, legacy `content` kept as the
     default-language mirror.
   - §5 `course_categories`: add `translations`.
   - §7 Cloud Functions: extend the publish-time validation (§7.4) to reject a
     publish where `availableLanguages` and `translations` disagree, or where a
     listed language has no `content/{lang}` doc for a published lesson.
   - §8: the new indexes below.
   - §11 QA checklist: one course seeded in all three languages, one in English
     only, one legacy course with no `translations` at all.
2. `firestore.indexes.json` — `availableLanguages` is an `array-contains`, so it
   needs its own composite per existing filter combination:

   | Collection | Fields |
   |---|---|
   | `courses` | `status` ASC, `availableLanguages` ARRAY, `createdAt` DESC, `__name__` DESC |
   | `courses` | `status` ASC, `availableLanguages` ARRAY, `categoryId` ASC, `createdAt` DESC, `__name__` DESC |
   | `courses` | `status` ASC, `availableLanguages` ARRAY, `level` ASC, `createdAt` DESC, `__name__` DESC |
   | `courses` | `status` ASC, `availableLanguages` ARRAY, `ageGroup` ASC, `createdAt` DESC, `__name__` DESC |
   | `courses` | `status` ASC, `availableLanguages` ARRAY, `translations.{en,am,om}.lowerCaseTitle` ASC (one per language) |

   Category + level + language together needs its own index too — same rule as
   today's category + age group. Ship whatever combinations the filter sheet can
   actually produce; a missing one fails **silently** (empty list, "load more"
   never advances) — same trap as the quiz pagination indexes.

### Phase 2 — Models

New shared helper, `lib/features/courses/data/model/localized_field.dart`:

```dart
String resolveLocalized(
  Map<String, Map<String, String>> translations,
  String field, {
  required String selected,
  required String defaultLanguage,
  required String legacy,
});
```

plus `parseTranslations(dynamic raw)` next to the existing `parseStringList` in
`json_utils.dart` — forgiving, drops non-map entries rather than throwing (same
rule the content-block parser follows).

- `course.dart` — add `availableLanguages` (`HiveField(15)`), `defaultLanguage`
  (`16`), `translations` (`17`, `Map<String, Map<String, String>>`). Keep
  `title`/`description` as the **resolved** value at construction time so every
  existing widget keeps compiling; add `titleIn(lang)` / `descriptionIn(lang)`
  for the cases that need another language. Field 10 stays burned.
- `lesson.dart` — `availableLanguages` (`14`), `translations` (`15`),
  `contentsByLanguage` (`16`, `Map<String, List<ContentModel>>`); `contents`
  becomes the resolved list, seeded from legacy `content` when the map is empty.
- `course_category.dart` — `translations` (`4`), `name` resolved.
- Domain entities (`course_model.dart`, `lesson_model.dart`,
  `course_category_model.dart`) gain the matching getters.

No new Hive adapters are needed: `Map<String, String>` and
`Map<String, List<ContentModel>>` serialize with the already-registered
`ContentModel` adapter, and `AppLanguageAdapter` is registered in
`bootstrap.dart:227`. Type ids 0–84 are taken; nothing new is claimed here.

### Phase 3 — Data sources

`remote_course_data_source.dart`:
- `getCourses` — `where('availableLanguages', arrayContains: code)` when
  `filter.language != null`; search switches its prefix range from
  `lowerCaseTitle` to `translations.{code}.lowerCaseTitle` when a language is
  selected (Firestore accepts the nested field path), and keeps the flat field
  for "all languages".
- New `getLessonContent({courseId, lessonId, language})` reading
  `lessons/{id}/content/{lang}`; returns `null` on miss so the caller can walk
  the fallback chain, and falls back to the lesson doc's legacy `content`.
- `getLessons` stops relying on the body, so it stays a single query.

`local_course_data_source.dart`:
- Mirror the language predicate in the cached `getCourses` filter (it already
  mirrors category/level/ageGroup/query).
- `cacheLessons` must **merge** `contentsByLanguage` rather than overwrite, so a
  lesson read in Amharic and then in English keeps both offline. The
  `'${courseId}:${id}'` key stays as-is.

`course_repository_impl.dart` — thread the language through, unchanged fetch
policy.

### Phase 4 — Filter and blocs

- `CourseFilter` (`data/model/types.dart`) gains `final AppLanguage? language`
  — `null` means *all languages*. Add it to `props`, `copyWith` and `toString`.
  It is a **query-affecting** field, so it must **not** be listed in
  `sameQueryAs`'s exemptions (only `progress` and `sort` are exempt) — a
  language change has to re-run the remote query.
- `CourseListBloc` seeds the initial filter with the member's current
  `AppSettings.language` rather than `null`, so the catalog opens in their
  language, and re-queries when the app language changes (subscribe to
  `AppSettingsCubit`). Guard: if the first page comes back empty for their
  language, surface the empty state with a "show all languages" action rather
  than silently widening the query.
- `_reset()` in the filter sheet clears back to the app language, not to `null`
  — same spirit as it keeping the search term.

### Phase 4b — Age group (independent of translations; ship first, it is nearly free)

Age group is **already plumbed end to end** — the only thing missing is the
control in the sheet:

| Layer | State |
|---|---|
| `Course.ageGroup` + `fromJson`/`toJson` | ✓ `course.dart:36,73,129` |
| `CourseFilter.ageGroup` (`props`, `copyWith`) | ✓ `types.dart:123,131,166` |
| Remote query `where('ageGroup', …)` | ✓ `remote_course_data_source.dart:65` |
| Cached query predicate | ✓ `local_course_data_source.dart:38` |
| Active-filter badge count | ✓ `course_filter_button.dart:23` |
| Firestore index `status + ageGroup + createdAt + __name__` | ✓ spec §8 |
| i18n `courses.ageGroup*` keys | ✓ `en.i18n.json:537-541` (already in all three locales) |
| **Filter sheet control** | ✗ **missing** |

So the work is one widget: an `_AgeGroupFilter` `_FilterSection` in
`course_filter_modal_sheet.dart`, modelled on `_LevelFilter` — a
`DropdownButton<AgeGroup>` over `AgeGroup.values` labelled from
`t.courses.ageGroupChildren` / `Youth` / `Adults` / `ageGroupAll`, with
`AgeGroup.all` as the "any" value (the same role `CourseLevel.any` plays). Wire
it with `_filter.copyWith(ageGroup: value)` like the others.

Two things to watch:

- `AgeGroup.fromString` **throws** on an unknown value
  (`types.dart:610`), unlike `CourseLevel.fromString`, which falls back to
  `beginner`. `Course.fromJson` only defaults the *missing* case (`?? 'all'`),
  so one mistyped `ageGroup` in Firestore throws mid-parse and drops the whole
  page, not just that course. Fix this while here — either a `tryFromString` or
  a try/catch in `Course.fromJson` falling back to `AgeGroup.all`.
- Age group + category (or + level, or + language) each need their own composite
  index; the spec already lists the plain one but not the combinations.

Optional and cheap once the control exists: an age-group chip on
`course_card.dart` for anything that isn't `AgeGroup.all`, so a member can see
*why* a course matched.

### Phase 5 — UI

- `course_filter_modal_sheet.dart` — the age-group section from Phase 4b, plus a
  `_FilterSection` holding a `DropdownButton<AppLanguage?>`: *All languages*,
  English, አማርኛ, Afaan Oromoo. Language names render in their own script (not
  translated), matching `language_selector.dart`. That brings the sheet to six
  sections — it already scrolls, so no layout change is needed.
- `course_card.dart` — small badge when the card's resolved language ≠ the
  selected one, and a multi-language indicator when
  `availableLanguages.length > 1`.
- `course_screen.dart` — a reading-language switcher in the header, shown only
  when the course has more than one translation. Selection persists in
  `AppSettings` as a new `courseLanguage` (`HiveField(17)`, null ⇒ follow UI
  language) so it is sticky across courses and survives restart, and it is
  **independent of the UI language** — a member can read Amharic courses with an
  English interface.
- `lesson_screen.dart` — resolves the body via the fallback chain, shows the
  "only in X" notice once at the top rather than per block.
- `learn_screen.dart` / `course_home_section.dart` — home rails inherit the same
  language preference.

### Phase 6 — i18n

New keys under `courses` in `en.i18n.json`, `am.i18n.json`, `om.i18n.json`:
`language`, `allLanguages`, `availableInOnly`, `readingLanguage`,
`noCoursesInLanguage`, `showAllLanguages`.

Then **`dart run slang`** — these keys stay undefined until it runs;
build_runner does not generate them.

### Phase 7 — Tests

Under `test/features/courses/`:
- `Course.fromJson` / `Lesson.fromJson` with (a) full translations, (b) one
  language only, (c) a **legacy** document with no `translations` key at all —
  case (c) is the regression guard for already-seeded content.
- Fallback chain order, including the "resolved ≠ selected" flag the badge reads.
- `CourseFilter.sameQueryAs` returns `false` across a language change.
- Local data source: language predicate, and `cacheLessons` merging two
  languages of the same lesson.

### Phase 8 — Follow-up (explicitly out of scope here)

Quiz translations. `quizzes/{id}/questions/{id}` carries its own text, and a
course's final quiz / lesson quizzes are reached by id
(`course-{courseId}`, `lesson-{courseId}-{lessonId}`). Translating a course
without its quizzes leaves a member reading Amharic lessons and answering
English questions. Same `translations` map shape applies; it is a separate
feature slice with its own seeder and `meta/stat` bootstrap.

---

## 3. Rollout order

0. **Phase 4b (age group)** ships on its own, ahead of everything else — it
   touches one widget and needs no schema change.
1. Spec + indexes deployed (indexes **before** any client that queries them).
2. Client ships reading the new fields with full legacy fallback — safe against
   the current, untranslated data.
3. Backend back-fills `translations` + `content/{lang}` per course; each course
   lights up as it is translated. No flag day.

## 4. Document formats (hand this to the backend)

Language keys are exactly `en` | `am` | `om`. Nothing else is recognised.

Three rules that apply to every document below:

1. `availableLanguages` **must equal the key set of `translations`**. The catalog
   filter trusts this array and never opens the map; a mismatch means a course
   that is listed but renders blank.
2. `defaultLanguage` must be a member of `availableLanguages`. It is the
   fallback the client resolves to when the member's language is absent.
3. The **legacy top-level fields** (`title`, `description`, `lowerCaseTitle`,
   `name`, `content`) stay required and must mirror `translations[defaultLanguage]`
   exactly. Old clients and the existing search index read them.

### 4.1 `courses/{courseId}`

```json
{
  "defaultLanguage": "en",
  "availableLanguages": ["en", "am", "om"],
  "translations": {
    "en": {
      "title": "Foundations of Faith",
      "lowerCaseTitle": "foundations of faith",
      "description": "An eight-lesson introduction to the core doctrines of the Church."
    },
    "am": {
      "title": "የእምነት መሠረቶች",
      "lowerCaseTitle": "የእምነት መሠረቶች",
      "description": "የቤተ ክርስቲያንን መሠረታዊ ትምህርቶች የሚያስተዋውቅ ስምንት ትምህርት።"
    },
    "om": {
      "title": "Bu'uura Amantii",
      "lowerCaseTitle": "bu'uura amantii",
      "description": "Barumsa saddeet kan barsiisa bu'uuraa Bataskaanaa ibsu."
    }
  },

  "title": "Foundations of Faith",
  "lowerCaseTitle": "foundations of faith",
  "description": "An eight-lesson introduction to the core doctrines of the Church.",

  "coverImageUrl": "https://…/foundations.jpg",
  "categoryId": "doctrine",
  "ageGroup": "youth",
  "level": "beginner",
  "lessonCount": 8,
  "sequential": true,
  "hasFinalQuiz": true,
  "lessonQuizCount": 6,
  "prerequisiteCourseIds": [],
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

`lowerCaseTitle` inside each translation is that language's own title
lowercased — search runs a prefix range on `translations.{lang}.lowerCaseTitle`.
For Amharic it is identical to `title` (Geʽez is unicameral); write it anyway,
the query needs the field to exist. Everything below `translations` is
language-neutral and is **not** duplicated per language.

### 4.2 `courses/{courseId}/lessons/{lessonId}`

Titles only — the body is a separate document (§4.3).

```json
{
  "order": 1,
  "availableLanguages": ["en", "am", "om"],
  "translations": {
    "en": { "title": "Who Is God?", "shortDescription": "The nature and attributes of God." },
    "am": { "title": "እግዚአብሔር ማን ነው?", "shortDescription": "የእግዚአብሔር ባሕርይ እና ባሕርያት።" },
    "om": { "title": "Waaqni Eenyu?", "shortDescription": "Amala fi gooddaa Waaqaa." }
  },

  "title": "Who Is God?",
  "shortDescription": "The nature and attributes of God.",
  "content": [ { "type": "paragraph", "value": "…" } ],

  "author_id": "abune-yohannes",
  "imageUrl": "https://…/lesson-1.jpg",
  "category": "doctrine",
  "tags": ["god", "trinity"],
  "estimatedMinutes": 12,
  "hasQuiz": true,
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

Do **not** write `courseId` — the parent path owns it and the client overwrites
any stored value.

### 4.3 `courses/{courseId}/lessons/{lessonId}/content/{lang}`

One document per language, id = the language code. Fetched only when the lesson
is opened, which is what keeps the lesson list cheap.

```json
{
  "language": "am",
  "blocks": [
    { "type": "title",     "value": "እግዚአብሔር ማን ነው?" },
    { "type": "paragraph", "value": "እግዚአብሔር ዘላለማዊ…" },
    { "type": "quote",     "value": { "text": "በመጀመሪያ እግዚአብሔር…", "reference": "ዘፍጥረት 1:1" } },
    { "type": "list",      "value": ["ሁሉን ቻይ", "ሁሉን አዋቂ", "በሁሉ ቦታ የሚገኝ"] }
  ]
}
```

`blocks` uses the **exact** block format already documented in
`COURSES_BACKEND_SPEC.md` §4 — same `{type, value}` pairs, same renderer. The
only change is where the array lives. `language` is redundant with the doc id;
it is there so an export of the collection is readable on its own.

A published lesson must have a `content/{lang}` document for **every** language
in its `availableLanguages`. The `content/en` document and the legacy top-level
`content` array both exist and carry the same blocks for `defaultLanguage`.

### 4.4 `course_categories/{categoryId}`

```json
{
  "availableLanguages": ["en", "am", "om"],
  "translations": {
    "en": { "name": "Doctrine", "description": "Core teachings of the Church." },
    "am": { "name": "ትምህርተ ሃይማኖት", "description": "የቤተ ክርስቲያን መሠረታዊ ትምህርቶች።" },
    "om": { "name": "Barsiisa", "description": "Barsiisa bu'uuraa Bataskaanaa." }
  },

  "name": "Doctrine",
  "description": "Core teachings of the Church.",
  "imageUrl": "https://…/doctrine.jpg"
}
```

Categories have no `defaultLanguage` — they fall back to `en`, then to the
legacy `name`.

### 4.5 Partial translation — the common case

A course translated into English and Amharic but not yet Afan Oromo simply omits
`om` from **both** `availableLanguages` and `translations`:

```json
{
  "defaultLanguage": "en",
  "availableLanguages": ["en", "am"],
  "translations": {
    "en": { "title": "Foundations of Faith", "lowerCaseTitle": "foundations of faith", "description": "…" },
    "am": { "title": "የእምነት መሠረቶች", "lowerCaseTitle": "የእምነት መሠረቶች", "description": "…" }
  },
  "title": "Foundations of Faith",
  "lowerCaseTitle": "foundations of faith",
  "description": "…"
}
```

A member browsing in Afan Oromo will not see this course while the Language
filter is set to Afan Oromo; with the filter on *All languages* they see it and
the card is badged "English only". Never write an empty placeholder
(`"om": { "title": "" }`) to make a course appear — an empty string renders as a
blank card, which is worse than being filtered out.

A course and its lessons may disagree — a course listing `am` whose lesson 5 has
no Amharic body falls back per lesson and shows the notice there. It is legal
but should be treated as an authoring bug.

### 4.6 A legacy document stays valid

No `translations`, no `availableLanguages`, no `defaultLanguage`:

```json
{
  "title": "Foundations of Faith",
  "lowerCaseTitle": "foundations of faith",
  "description": "…",
  "categoryId": "doctrine",
  "level": "beginner",
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

The client treats this as English-only and renders it exactly as it does today.
This is why the back-fill can proceed course by course with no flag day.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Missing composite index → empty catalog, no error | Ship every combination the sheet can produce; add the failure to the QA checklist |
| `availableLanguages` disagrees with `translations` → course listed but renders blank | Publish-time validation (§7.4); client resolves via fallback rather than showing empty |
| Lesson body doc missing for a listed language | `getLessonContent` returns null → fallback chain → "only in X" notice |
| Hive schema drift on existing installs | New fields only, all with defaults; no type id reused, field 10 stays burned |
| Index explosion as filters multiply | Language is the last server-side filter added; anything further (tags, duration) goes client-side like `progress`/`sort` |
---

## 6. Admin implementation status (this repo)

The authoring half of §4 is implemented in `lideta_admin`. The app is free to
ship its read side whenever it likes — everything below keeps the legacy
top-level fields correct, so an un-migrated client sees no change.

| Piece | Where |
|---|---|
| Locale constants (`en`/`am`/`om`, labels, `LocaleMap`) | `src/lib/i18n/contentLocales.ts` |
| `translations` read/write rules + fallback chain | `src/lib/i18n/translations.ts` |
| Language tab strip with completion dots | `src/components/ui/LocaleTabs.tsx` |
| Course `translations` / `availableLanguages` / `defaultLanguage` + legacy mirror | `src/lib/api/courses.ts` (`buildCourseLocalization`) |
| Lesson `translations` + `content/{lang}` subdocuments | `src/lib/api/lessons.ts` (`localize`, `writeBodies`, `getLessonBodies`) |
| Category `translations` | `src/lib/api/courseCategories.ts` |
| Publish gate (§7.4 language half) | `validateCourseLanguages` / `validateLessonLanguages` in `courses.ts` |
| Language tabs in the forms | `CourseFormModal`, `LessonFormModal`, `LessonTranslationBlocksEditor`, `CourseCategoriesClient` |
| §1 composite indexes | `firestore.indexes.json` (8 catalog + 3 per-language search) |

Decisions the admin side settles:

- **`availableLanguages` is never authored.** It is derived from the key set of
  `translations` on every write, so rule 1 of §4 cannot be violated by the
  dashboard. The publish gate still checks it, because the seeder and any
  hand-edited document can still get it wrong.
- **A language with no title is not written.** Blanking a tab removes the
  language rather than persisting `{ "om": { "title": "" } }`.
- **Lessons have no `defaultLanguage`.** They mirror the owning course's, so
  the legacy fields on both always hold the same language.
- **Lesson body structure is owned by the primary language.** Translation tabs
  cannot add, remove, reorder or retype a block; retyping on the primary tab
  re-aligns every translation. Blank means *inherit*, and inheritance is
  resolved **at write time**, so each `content/{lang}` document is complete and
  the client needs no per-block fallback.
- **Deletes cascade by hand.** `deleteLesson` and `deleteCourse` now remove the
  `content/{lang}` documents too — Firestore does not, and an orphan body would
  be adopted by the next lesson created with the same id.

Still open, unchanged from above: Phases 2–7 (the Flutter read side) and Phase
8 (quiz translations).
