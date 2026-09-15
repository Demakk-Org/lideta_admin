/**
 * Applies a translated course from a JSON file (see `translations/*.json`).
 *
 * The file carries only *text*. Structure, media and the bible-verse
 * coordinates on quote blocks belong to the block itself, which is shared
 * across languages — so a translation can never reorder a lesson, drop a
 * block, or point a verse tap at the wrong chapter. A field the file leaves
 * blank is simply not written for that language, and the app falls back.
 *
 * File format:
 *
 *   {
 *     "courseId": "walking-with-god",
 *     "locale": "am",
 *     "course":  { "title": "…", "description": "…" },
 *     "quotes":  { "gen5_24": "…" },              // optional, for @references
 *     "lessons": {
 *       "walking-with-god-l01": {
 *         "title": "…",
 *         "shortDescription": "…",
 *         "blocks": [ "…", ["item", "item"], "@gen5_24", {"title": "…", "caption": "…"} ]
 *       }
 *     }
 *   }
 *
 * One entry per block of the primary-language body, in order:
 *   title / paragraph            a string
 *   quote                        a string — the verse text; `ref` is shared
 *   list                         an array of strings
 *   video / audio                {title?, caption?} — the file is shared
 *   banner                       nothing to translate; the entry is ignored
 *   "@name"                      looked up in `quotes`
 *   "" or null                   leave this block untranslated
 *
 * Usage:
 *
 *   node --env-file=.env scripts/apply-course-translation.mjs --file=translations/walking-with-god.am.json
 *   node --env-file=.env scripts/apply-course-translation.mjs --file=… --apply
 *
 * Without `--apply` it validates, prints the plan, and writes nothing.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const LOCALES = ['en', 'am', 'om'];

function connect() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY',
    );
    process.exit(1);
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return getFirestore();
}

/** `@name` resolves against the file's `quotes` map; anything else is literal. */
export function resolveEntry(entry, quotes) {
  if (typeof entry !== 'string' || !entry.startsWith('@')) return entry;
  const key = entry.slice(1);
  if (!(key in quotes)) throw new Error(`Unknown quote reference "@${key}"`);
  return quotes[key];
}

function str(val) {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Adds one language to a block, in place.
 *
 * Only text is ever taken from the translation — verse coordinates, media
 * URLs, durations and thumbnails belong to the block and are shared, so no
 * amount of bad input can point a tapped verse at the wrong chapter or break
 * a player. A blank entry writes nothing, and the app falls back.
 */
export function translateBlock(base, entry, quotes, locale) {
  const value = resolveEntry(entry, quotes);
  const blank = value == null || value === '';
  const put = (map, text) => {
    const next = { ...map };
    if (str(text)) next[locale] = str(text);
    else delete next[locale];
    return next;
  };

  switch (base.type) {
    case 'banner':
      // One image serves every language.
      return base;
    case 'list': {
      if (!blank && !Array.isArray(value)) {
        throw new Error('list block needs an array of strings');
      }
      const items = blank ? [] : value.map(str).filter(Boolean);
      const next = { ...base.value };
      if (items.length) next[locale] = items;
      else delete next[locale];
      return { type: base.type, value: next };
    }
    case 'quote': {
      if (!blank && typeof value !== 'string') {
        throw new Error('quote block needs the verse text as a string');
      }
      return {
        type: base.type,
        value: { ...base.value, text: put(base.value.text, blank ? '' : value) },
      };
    }
    case 'video':
    case 'audio': {
      if (!blank && typeof value !== 'object') {
        throw new Error(`${base.type} block needs {title?, caption?}`);
      }
      const t = blank ? {} : value;
      const title = put(base.value.title ?? {}, t.title);
      const caption = put(base.value.caption ?? {}, t.caption);
      const next = { ...base.value };
      if (Object.keys(title).length) next.title = title;
      else delete next.title;
      if (Object.keys(caption).length) next.caption = caption;
      else delete next.caption;
      return { type: base.type, value: next };
    }
    default: {
      if (!blank && typeof value !== 'string') {
        throw new Error(`${base.type} block needs a string`);
      }
      return { type: base.type, value: put(base.value, blank ? '' : value) };
    }
  }
}

/**
 * The whole plan, from already-loaded documents. Pure, so every rule above is
 * testable without Firestore.
 */
export function planTranslation({ file, course, lessons }) {
  const locale = file.locale;
  if (!LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale "${locale}" (expected ${LOCALES.join(', ')})`);
  }
  if (locale === 'en') {
    throw new Error('This applies a translation, not the primary language');
  }

  const quotes = file.quotes ?? {};
  const problems = [];

  const title = str(file.course?.title);
  if (!title) problems.push('course: no title — a language with no title is never written');

  const lessonPlans = [];
  for (const [id, tr] of Object.entries(file.lessons ?? {})) {
    const base = lessons.find((l) => l.id === id);
    if (!base) {
      problems.push(`lesson ${id}: not in this course`);
      continue;
    }
    if (!str(tr.title)) {
      problems.push(`lesson ${id}: no title`);
      continue;
    }

    const entries = tr.blocks ?? [];
    if (entries.length !== base.blocks.length) {
      // Structure is owned by the primary language; a length mismatch means
      // the base changed under the translator and the file is stale.
      problems.push(
        `lesson ${id}: ${entries.length} block(s) for a ${base.blocks.length}-block lesson`,
      );
      continue;
    }

    const blocks = [];
    let failed = false;
    for (let i = 0; i < base.blocks.length; i += 1) {
      try {
        blocks.push(translateBlock(base.blocks[i], entries[i], quotes, locale));
      } catch (err) {
        problems.push(`lesson ${id} block ${i + 1}: ${err.message}`);
        failed = true;
        break;
      }
    }
    if (failed) continue;

    lessonPlans.push({
      id,
      title: { ...base.title, [locale]: str(tr.title) },
      shortDescription: str(tr.shortDescription)
        ? { ...base.shortDescription, [locale]: str(tr.shortDescription) }
        : base.shortDescription,
      content: blocks,
      availableLanguages: union(base.availableLanguages, locale),
    });
  }

  const missing = lessons
    .filter((l) => !file.lessons?.[l.id])
    .map((l) => l.id);

  const courseTitle = { ...course.title, [locale]: title };
  const languages = union(course.availableLanguages, locale);

  return {
    locale,
    courseId: file.courseId,
    course: {
      title: courseTitle,
      lowerCaseTitle: Object.fromEntries(
        Object.entries(courseTitle).map(([l, t]) => [l, t.toLowerCase()]),
      ),
      description: str(file.course?.description)
        ? { ...course.description, [locale]: str(file.course.description) }
        : course.description,
      availableLanguages: languages,
    },
    lessons: lessonPlans,
    missing,
    problems,
  };
}

function union(existing, locale) {
  const set = new Set([...(existing ?? []), locale]);
  return LOCALES.filter((l) => set.has(l));
}

async function load(db, courseId) {
  const courseSnap = await db.collection('courses').doc(courseId).get();
  if (!courseSnap.exists) throw new Error(`Course "${courseId}" not found`);
  const course = courseSnap.data();

  const snap = await db.collection('courses').doc(courseId).collection('lessons').get();
  const lessons = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      order: data.order ?? 0,
      title: data.title ?? {},
      shortDescription: data.shortDescription ?? {},
      availableLanguages: data.availableLanguages ?? [],
      blocks: data.content ?? [],
    };
  });
  lessons.sort((a, b) => a.order - b.order);
  return { course, lessons };
}

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const fileArg = args.find((a) => a.startsWith('--file='));
  if (!fileArg) {
    console.error('Missing --file=<path to a translation json>');
    process.exit(1);
  }

  const file = JSON.parse(readFileSync(fileArg.split('=').slice(1).join('='), 'utf8'));
  const db = connect();
  const { course, lessons } = await load(db, file.courseId);
  const plan = planTranslation({ file, course, lessons });

  console.log(
    `Course ${plan.courseId} (${course.defaultLanguage ?? 'en'} primary) -> ${plan.locale}\n`,
  );
  console.log(`  course   "${plan.course.title[plan.locale]}"`);
  console.log(`           availableLanguages: ${plan.course.availableLanguages.join(', ')}`);
  for (const l of plan.lessons) {
    console.log(
      `  lesson   ${l.id}  "${l.title[plan.locale]}"  (${l.content.length} blocks)`,
    );
  }

  for (const id of plan.missing) {
    // Legal (§4.5) but an authoring bug: the course offers a language one of
    // its lessons has no body for, so that lesson falls back mid-course.
    console.warn(`  ! lesson ${id} has no ${plan.locale} translation — it will fall back`);
  }
  for (const p of plan.problems) console.error(`  ✗ ${p}`);

  if (plan.problems.length) {
    console.error('\nRefusing to write while the file disagrees with the course.');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply.');
    return;
  }

  const courseRef = db.collection('courses').doc(plan.courseId);
  const batch = db.batch();

  batch.update(courseRef, {
    title: plan.course.title,
    lowerCaseTitle: plan.course.lowerCaseTitle,
    description: plan.course.description,
    availableLanguages: plan.course.availableLanguages,
  });

  for (const l of plan.lessons) {
    batch.update(courseRef.collection('lessons').doc(l.id), {
      title: l.title,
      shortDescription: l.shortDescription,
      availableLanguages: l.availableLanguages,
      content: l.content,
    });
  }

  await batch.commit();
  console.log(`\nApplied ${plan.lessons.length} lesson(s) + the course in ${plan.locale}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err.message ?? err);
      process.exit(1);
    },
  );
}
