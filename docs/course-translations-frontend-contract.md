# Course translations — frontend contract

**Hand this to the app team.** It is the whole read contract for the new
translation shape: what a document looks like now, the one helper everything
falls out of, and the file-by-file changes on the Flutter side.

The admin writes this shape today, and every document in Firestore has already
been migrated. There is no other shape left in the database — nothing to
support, nothing to fall back to.

---

## 1. What changed

Translations used to live in a sidecar map beside a flat "legacy" field, and
lesson bodies lived in per-language subdocuments. Both are gone.

```jsonc
// BEFORE                                    // NOW
{                                            {
  "title": "Walking with God",                 "title": {
  "translations": {                              "en": "Walking with God",
    "en": { "title": "Walking with God" },       "am": "ከእግዚአብሔር ጋር መመላለስ"
    "am": { "title": "ከእግዚአብሔር…" }               }
  }                                          }
}

// lessons/{id}/content/en  → { blocks: [...] }     ← DELETED, the
// lessons/{id}/content/am  → { blocks: [...] }     ← subcollection is gone
```

**Every text field is now a map of language code → text.** Nothing else holds
a translation, and there is no flat mirror to read instead.

| Gone | Replaced by |
|---|---|
| `translations.{lang}.{field}` | the field itself being a map |
| flat `title` / `description` / `shortDescription` / `name` strings | the same names, now maps |
| `courses/{c}/lessons/{l}/content/{lang}` subcollection | `content` on the lesson document |
| flat `lowerCaseTitle` string | `lowerCaseTitle` map, one entry per language |

`availableLanguages` and `defaultLanguage` are unchanged in name and meaning.

---

## 2. The documents

Language keys are exactly `en` | `am` | `om`. **A language is present only when
it has text** — there is never an empty string, and a language with no entry
simply is not offered.

### 2.1 `courses/{courseId}`

```jsonc
{
  "title":          { "en": "Walking with God", "am": "ከእግዚአብሔር ጋር መመላለስ" },
  "lowerCaseTitle": { "en": "walking with god", "am": "ከእግዚአብሔር ጋር መመላለስ" },
  "description":    { "en": "What happens after…", "am": "…" },

  "availableLanguages": ["en", "am"],   // always equals the key set of `title`
  "defaultLanguage": "en",              // always one of them

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

Guarantees the admin enforces on every write, so the client can rely on them:

1. `availableLanguages` **equals** the key set of `title`. It is derived, never
   authored. Filter on it freely; it can't claim a language the course lacks.
2. `defaultLanguage` is always one of `availableLanguages`.
3. `lowerCaseTitle` has exactly the same keys as `title`, each lowercased.

### 2.2 `courses/{courseId}/lessons/{lessonId}`

```jsonc
{
  "order": 1,
  "title":            { "en": "From Knowing to Walking", "am": "ከማወቅ ወደ መመላለስ" },
  "shortDescription": { "en": "What changes on the Monday…", "am": "…" },
  "category":         { "en": "Foundations" },     // free-form label, not the course category
  "tags":             { "en": ["faith", "basics"] },

  "availableLanguages": ["en", "am"],
  "content": [ /* §2.3 — the body is here now */ ],

  "author_id": "abune-yohannes",
  "imageUrl": "https://…",
  "estimatedMinutes": 12,
  "hasQuiz": true,
  "status": "published",
  "createdAt": "<Timestamp>"
}
```

A lesson has **no `defaultLanguage`** — it mirrors its course's, so the two can
never disagree. Pass the course's down when you resolve a lesson.

### 2.3 Content blocks

**One array, shared by every language.** Only the text inside a block varies,
so a lesson has the same blocks in the same order no matter who reads it.

```jsonc
{ "type": "title",     "value": { "en": "A walk, not a position", "am": "…" } }

{ "type": "paragraph", "value": { "en": "Scripture almost never…", "am": "…" } }

{ "type": "list",      "value": { "en": ["Prayer — speaking to…", "…"],
                                  "am": ["ጸሎት — ላወቃችሁት…", "…"] } }

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

**What is a map and what is not:**

| Localized | Not localized |
|---|---|
| `title`, `paragraph` block values | `banner` value — one image serves every language |
| `quote.text` | `quote.ref`, `quote.isBibleVerse` — **verse coordinates, never translated** |
| `list` values (a list per language) | `video.url`, `videoType`, `audio.url`, `audioId` |
| `video.title` / `caption`, `audio.title` / `caption` | `thumbnailUrl`, `durationSeconds` |

The rule: **a field is a map if and only if a human reads it as prose.**

`quote.ref` staying flat is deliberate — a per-language copy could drift onto
the wrong chapter and send a verse tap to the wrong place.

### 2.4 `course_categories/{categoryId}`

```jsonc
{
  "name":        { "en": "Christian Living", "am": "የክርስትና ኑሮ" },
  "description": { "en": "…", "am": "…" },
  "availableLanguages": ["en", "am"],
  "imageUrl": "https://…"
}
```

Categories have **no `defaultLanguage`** — fall back to `en`.

---

## 3. The one helper

Everything else falls out of this. Put it in `json_utils.dart`.

```dart
/// A translatable field: language code → text. Only languages that have text
/// are present; there are never empty strings.
typedef LocalizedText = Map<String, String>;

/// Forgiving parse — a malformed entry is dropped rather than throwing, the
/// same rule the content-block parser already follows.
LocalizedText parseLocalized(dynamic value) {
  if (value is! Map) return const {};
  final out = <String, String>{};
  value.forEach((key, text) {
    if (key is String && text is String && text.trim().isNotEmpty) {
      out[key] = text;
    }
  });
  return out;
}

Map<String, List<String>> parseLocalizedList(dynamic value) {
  if (value is! Map) return const {};
  final out = <String, List<String>>{};
  value.forEach((key, list) {
    if (key is! String || list is! List) return;
    final items = list.whereType<String>().toList();
    if (items.isNotEmpty) out[key] = items;
  });
  return out;
}

/// `selected → defaultLanguage → en → anything present → ''`.
///
/// Empty counts as absent, so a half-filled translation falls back to real
/// text instead of rendering a blank title.
String resolveLocalized(
  LocalizedText value, {
  String? selected,
  String? defaultLanguage,
}) {
  for (final code in [selected, defaultLanguage, 'en']) {
    if (code == null) continue;
    final text = value[code];
    if (text != null && text.trim().isNotEmpty) return text;
  }
  // Rather than render an empty card, take whatever the field does have.
  return value.values.firstWhere(
    (t) => t.trim().isNotEmpty,
    orElse: () => '',
  );
}

/// Which language [resolveLocalized] actually landed on — null when the field
/// is empty. Drive the "available in English only" badge off this: a silent
/// fallback is the failure mode to avoid.
String? resolvedLanguageOf(
  LocalizedText value, {
  String? selected,
  String? defaultLanguage,
}) {
  for (final code in [selected, defaultLanguage, 'en']) {
    if (code == null) continue;
    final text = value[code];
    if (text != null && text.trim().isNotEmpty) return code;
  }
  return value.entries
      .where((e) => e.value.trim().isNotEmpty)
      .map((e) => e.key)
      .firstOrNull;
}
```

`AppLanguage.appLocale.languageCode` is the string to pass as `selected` — the
same `en` / `am` / `om` codes slang uses.

### 3.1 Rendering a body

Keep `ContentRenderer` exactly as it is. Project the shared array down to one
language first, and it receives the same flat blocks it always has:

```dart
/// One language's view of a body. The only place the fallback chain runs for
/// content — after this, nothing downstream knows a block's text is a map.
List<Content> contentFor(String? language, String defaultLanguage) {
  String text(dynamic v) => resolveLocalized(
        parseLocalized(v),
        selected: language,
        defaultLanguage: defaultLanguage,
      );

  return content.map((block) {
    switch (block.contentType) {
      case ContentType.banner:
        return block;                                   // a URL, shared
      case ContentType.list:
        final lists = parseLocalizedList(block.value);
        return Content(
          contentType: block.contentType,
          value: lists[language] ?? lists[defaultLanguage] ?? lists['en'] ?? const [],
        );
      case ContentType.quote:
        final v = Map<String, dynamic>.from(block.value as Map);
        return Content(
          contentType: block.contentType,
          // `ref` and `isBibleVerse` pass through untouched.
          value: {...v, 'text': text(v['text'])},
        );
      case ContentType.video:
      case ContentType.audio:
        final v = Map<String, dynamic>.from(block.value as Map);
        return Content(
          contentType: block.contentType,
          value: {...v, 'title': text(v['title']), 'caption': text(v['caption'])},
        );
      default:
        return Content(contentType: block.contentType, value: text(block.value));
    }
  }).toList();
}
```

---

## 4. Changes file by file

### 4.1 `data/model/json_utils.dart`

- **Delete** `parseTranslations` and `resolveTranslated` — the sidecar has no
  v2 equivalent.
- **Add** `parseLocalized`, `parseLocalizedList`, `resolveLocalized`,
  `resolvedLanguageOf` from §3.

### 4.2 `data/model/course.dart`, `lesson.dart`, `course_category.dart`

Field types change from `String` to `Map<String, String>`.

> ⚠️ **Do not reuse the existing Hive field ids.** `Course.title` is
> `@HiveField(1) String` today; a box written by the current build holds a
> string there, and reading it back as a map is a type error on a device that
> has *already updated* — the worst place to find out. Burn the old ids and
> claim new ones.

| Model | typeId | Ids in use | Burn | Next free |
|---|---|---|---|---|
| `Course` | 79 | 0–17 (10 already burned) | 1 `title`, 2 `description` | **18** |
| `Lesson` | 80 | 0–15 | title, shortDescription, category, tags, content | **16** |
| `CourseCategory` | 81 | 0–4 | name, description | **5** |

`languageCodes` (15), `translations` (16) and `defaultLanguage` (17) on
`Course`: keep 15 and 17, **burn 16** — `translations` no longer exists.

Parsing becomes:

```dart
title: parseLocalized(json['title']),
description: parseLocalized(json['description']),
languageCodes: parseStringList(json['availableLanguages']),
defaultLanguage: json['defaultLanguage'] as String? ?? 'en',
```

Keep `titleFor(AppLanguage?)` / `descriptionFor(AppLanguage?)` as the public
surface — only their bodies change, so no widget has to move:

```dart
@override
String titleFor(AppLanguage? language) => resolveLocalized(
      title,
      selected: language?.appLocale.languageCode,
      defaultLanguage: defaultLanguage,
    );
```

`matchesTitlePrefix` gets simpler — it is now just a scan of one map's values.

### 4.3 `data/data_source/remote_course_data_source.dart`

- **Search** switches from `lowerCaseTitle` to the nested path:

  ```dart
  final field = 'lowerCaseTitle.${code}';       // 'lowerCaseTitle.am'
  query = query.orderBy(field).startAt([term]).endAt(['$term']);
  ```

  Indexes are deployed for all three languages
  (`status + availableLanguages + lowerCaseTitle.{lang}`). **A missing
  composite index fails silently — empty list, "load more" never advances** —
  so if search returns nothing for one language, suspect the index first.

- **Language filter** is unchanged:
  `where('availableLanguages', arrayContains: code)`.

- **Delete `getLessonContent`** and everything that reads
  `lessons/{id}/content/{lang}`. That subcollection no longer exists. The body
  arrives with the lesson document, in one query, as it did before
  translations.

### 4.4 `data/data_source/local_course_data_source.dart`

- **Delete the `contentsByLanguage` merge** on cache write. There is one body
  now, so there is nothing to merge — caching a lesson caches every language of
  it automatically.
- The language predicate in the cached `getCourses` filter stays as is.

### 4.5 UI

Unchanged in spirit; only the resolution call changes.

- **`course_card.dart` / `lesson_tile.dart`** — resolve through `titleFor`.
  Badge when `resolvedLanguageOf(...) != selected`: the member asked for
  Amharic and got English, and should be told why.
- **`content_language.dart`** — the reading-language switcher shows
  `availableLanguages`; hide it when there is only one.
- **`course_filter_modal_sheet.dart`** — the Language dropdown is unchanged.
  The age-group control that shipped already is unaffected by any of this.

---

## 5. Checklist

- [ ] A course with `title: {en, am}` renders Amharic when the member's
      language is Amharic.
- [ ] The same course renders **English** in Afan Oromo, and the card says so.
- [ ] A lesson whose course has `am` but whose own `title` has no `am` falls
      back per lesson, and the notice appears once at the top rather than per
      block.
- [ ] Tapping a verse quote opens the right chapter **in every language** —
      `ref` is shared, so this is the regression that proves you did not
      translate the coordinates.
- [ ] A `banner` block shows the same image in every language.
- [ ] A `video` block keeps its file and duration across languages, and only
      the title/caption change.
- [ ] Search in Amharic finds an Amharic-titled course
      (`lowerCaseTitle.am` index).
- [ ] Filtering to Afan Oromo hides courses that do not list `om`.
- [ ] Upgrading an install with a populated Hive box does **not** crash — the
      burned field ids are the thing being tested.
- [ ] Reading language and UI language are independent: an English interface
      can read an Amharic course.

## 6. Gotchas

1. **Empty means absent.** Never write `{"am": ""}` and never treat one as a
   translation. The admin refuses to produce it; if you ever see one, it came
   from a hand edit.
2. **`availableLanguages` is authoritative for filtering, `title` for
   rendering.** They are kept equal on write, but resolve through the field —
   never assume a language is there because the array says so.
3. **The block array is shared.** Do not write per-language block lists back
   into the cache; there is one array and only its text varies.
4. **Structure never varies by language.** If block counts differ between two
   languages you are looking at a bug, not a shape.
5. **Quiz text is not translated yet.** A member reading an Amharic lesson
   still answers English questions. Same shape applies when we get to it —
   it is a separate slice.
