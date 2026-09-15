/**
 * Migrates courses, lessons and course categories from the v1 translation
 * shape to v2 — see `docs/COURSE_TRANSLATIONS_V2_PLAN.md`.
 *
 *   v1  title: "Walking with God"          v2  title: { en: "Walking with God",
 *       translations: { am: { title: … } }                 am: "…" }
 *       content/{lang}.blocks: [...]           content: [ { type, value: {en, am} } ]
 *
 * Three phases, in order:
 *
 *   convert  read v1 (sidecar map, flat fields, `content/{lang}` bodies) and
 *            write the v2 per-field maps. Idempotent — a document whose
 *            `title` is already a map is skipped.
 *   verify   re-read and assert the result is coherent. Fails loudly.
 *   drop     delete the v1 leftovers: `translations` and every
 *            `courses/*\/lessons/*\/content/{lang}` document.
 *
 * `--phase=all` (the default) runs all three, stopping if `verify` fails.
 *
 * Usage:
 *
 *   node --env-file=.env scripts/migrate-course-translations-v2.mjs
 *   node --env-file=.env scripts/migrate-course-translations-v2.mjs --apply
 *   node --env-file=.env scripts/migrate-course-translations-v2.mjs --apply --phase=convert
 *
 * Without `--apply` it prints the plan and writes nothing.
 */
import { pathToFileURL } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const LOCALES = ['en', 'am', 'om'];
export const BASE_LOCALE = 'en';

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

/** True once a field has been converted — v2's shape is a map, v1's a string. */
export function isLocalized(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function localesOf(map) {
  return LOCALES.filter((l) => map?.[l] !== undefined);
}

/**
 * Builds one v2 field from v1's flat value plus its sidecar entries.
 *
 * The flat field is the default language's text, which is exactly what v1's
 * "legacy mirror" rule guaranteed — so it seeds that language, and the sidecar
 * fills in the rest.
 */
export function toLocalized(flat, translations, field, defaultLanguage = BASE_LOCALE) {
  const out = {};
  if (text(flat)) out[defaultLanguage] = text(flat);
  for (const locale of LOCALES) {
    const value = translations?.[locale]?.[field];
    if (text(value)) out[locale] = text(value);
  }
  return out;
}

export function toLocalizedList(flat, perLocale) {
  const out = {};
  const clean = (list) =>
    Array.isArray(list) ? list.map(text).filter(Boolean) : [];
  if (clean(flat).length) out[BASE_LOCALE] = clean(flat);
  for (const locale of LOCALES) {
    const list = clean(perLocale?.[locale]);
    if (list.length) out[locale] = list;
  }
  return out;
}

/**
 * Merges the per-language `content/{lang}` bodies into one array of blocks
 * whose text fields are maps.
 *
 * Structure comes from the default language: v1 guaranteed every body had the
 * same length and the same type at each index, and a language that drifted is
 * reported rather than silently reshaping the lesson.
 */
export function mergeBodies(bodies, defaultLanguage = BASE_LOCALE) {
  const base = bodies[defaultLanguage] ?? bodies[BASE_LOCALE] ?? [];
  const problems = [];
  const others = localesOf(bodies).filter((l) => l !== defaultLanguage);

  for (const locale of others) {
    if (bodies[locale].length !== base.length) {
      problems.push(
        `${locale} body has ${bodies[locale].length} block(s) against ${base.length} in ${defaultLanguage}`,
      );
    }
  }

  const put = (target, locale, value) => {
    if (text(value)) target[locale] = text(value);
    return target;
  };

  const content = base.map((block, i) => {
    const at = (locale) => {
      const b = bodies[locale]?.[i];
      return b && b.type === block.type ? b : null;
    };

    switch (block.type) {
      case 'list': {
        const value = {};
        const clean = (l) => (Array.isArray(l) ? l.map(text).filter(Boolean) : []);
        if (clean(block.value).length) value[defaultLanguage] = clean(block.value);
        for (const locale of others) {
          const items = clean(at(locale)?.value);
          if (items.length) value[locale] = items;
        }
        return { type: 'list', value };
      }
      case 'quote': {
        const quoteText = put({}, defaultLanguage, block.value?.text);
        for (const locale of others) put(quoteText, locale, at(locale)?.value?.text);
        // `ref` and the verse coordinates stay flat — they are coordinates,
        // and a per-language copy could drift onto the wrong chapter.
        const { text: _drop, ...rest } = block.value ?? {};
        return { type: 'quote', value: { ...rest, text: quoteText } };
      }
      case 'banner':
        return { type: 'banner', value: text(block.value) };
      case 'video':
      case 'audio': {
        const title = put({}, defaultLanguage, block.value?.title);
        const caption = put({}, defaultLanguage, block.value?.caption);
        for (const locale of others) {
          put(title, locale, at(locale)?.value?.title);
          put(caption, locale, at(locale)?.value?.caption);
        }
        const { title: _t, caption: _c, ...rest } = block.value ?? {};
        return {
          type: block.type,
          value: {
            ...rest,
            ...(localesOf(title).length ? { title } : {}),
            ...(localesOf(caption).length ? { caption } : {}),
          },
        };
      }
      default: {
        const value = put({}, defaultLanguage, block.value);
        for (const locale of others) put(value, locale, at(locale)?.value);
        return { type: block.type, value };
      }
    }
  });

  return { content, problems };
}

/** @returns the v2 fields for a course, or null when it is already converted. */
export function convertCourse(data) {
  if (isLocalized(data.title)) return null;

  const defaultLanguage = LOCALES.includes(data.defaultLanguage)
    ? data.defaultLanguage
    : BASE_LOCALE;
  const title = toLocalized(data.title, data.translations, 'title', defaultLanguage);
  const languages = localesOf(title);
  if (!languages.length) return { problem: 'no title in any language' };

  const description = toLocalized(
    data.description,
    data.translations,
    'description',
    defaultLanguage,
  );
  const lowerCaseTitle = {};
  for (const l of languages) lowerCaseTitle[l] = title[l].toLowerCase();

  return {
    update: {
      title,
      lowerCaseTitle,
      description: Object.fromEntries(
        languages.filter((l) => description[l]).map((l) => [l, description[l]]),
      ),
      availableLanguages: languages,
      defaultLanguage: languages.includes(defaultLanguage)
        ? defaultLanguage
        : languages[0],
    },
  };
}

export function convertLesson(data, bodies, defaultLanguage) {
  if (isLocalized(data.title)) return null;

  const title = toLocalized(data.title, data.translations, 'title', defaultLanguage);
  const languages = localesOf(title);
  if (!languages.length) return { problem: 'no title in any language' };

  const shortDescription = toLocalized(
    data.shortDescription,
    data.translations,
    'shortDescription',
    defaultLanguage,
  );
  // The lesson's own `content` array is the default language's body when no
  // `content/{lang}` document exists — the pre-v1 shape.
  const merged = mergeBodies(
    localesOf(bodies).length ? bodies : { [defaultLanguage]: data.content ?? [] },
    defaultLanguage,
  );

  return {
    update: {
      title,
      shortDescription: Object.fromEntries(
        languages.filter((l) => shortDescription[l]).map((l) => [l, shortDescription[l]]),
      ),
      category: toLocalized(data.category, null, 'category', defaultLanguage),
      tags: toLocalizedList(data.tags, null),
      availableLanguages: languages,
      content: merged.content,
    },
    problems: merged.problems,
  };
}

export function convertCategory(data) {
  if (isLocalized(data.name)) return null;

  const name = toLocalized(data.name, data.translations, 'name');
  const languages = localesOf(name);
  if (!languages.length) return { problem: 'no name in any language' };

  const description = toLocalized(data.description, data.translations, 'description');
  return {
    update: {
      name,
      description: Object.fromEntries(
        languages.filter((l) => description[l]).map((l) => [l, description[l]]),
      ),
      availableLanguages: languages,
    },
  };
}

/** Post-conditions the migration must leave true. */
export function verifyCourse(data, lessons) {
  const issues = [];
  if (!isLocalized(data.title)) {
    issues.push('title is not a map');
    return issues;
  }
  const languages = localesOf(data.title);
  if (!languages.length) issues.push('title has no language');

  const declared = Array.isArray(data.availableLanguages) ? data.availableLanguages : [];
  if (declared.join() !== languages.join()) {
    issues.push(
      `availableLanguages [${declared}] does not equal the title's languages [${languages}]`,
    );
  }
  if (!languages.includes(data.defaultLanguage)) {
    issues.push(`defaultLanguage "${data.defaultLanguage}" has no title`);
  }
  if (data.translations !== undefined) issues.push('still carries `translations`');
  if (!isLocalized(data.lowerCaseTitle)) issues.push('lowerCaseTitle is not a map');
  else {
    for (const l of languages) {
      if (data.lowerCaseTitle[l] !== data.title[l].toLowerCase()) {
        issues.push(`lowerCaseTitle.${l} does not match title.${l}`);
      }
    }
  }

  for (const lesson of lessons) {
    if (!isLocalized(lesson.data.title)) {
      issues.push(`lesson ${lesson.id}: title is not a map`);
      continue;
    }
    if (lesson.data.translations !== undefined) {
      issues.push(`lesson ${lesson.id}: still carries \`translations\``);
    }
    if (lesson.bodyDocs.length) {
      issues.push(
        `lesson ${lesson.id}: still has ${lesson.bodyDocs.length} content/{lang} document(s)`,
      );
    }
    const content = Array.isArray(lesson.data.content) ? lesson.data.content : [];
    for (const [i, block] of content.entries()) {
      if (block.type === 'banner') continue;
      const value =
        block.type === 'quote'
          ? block.value?.text
          : block.type === 'video' || block.type === 'audio'
            ? (block.value?.title ?? {})
            : block.value;
      if (!isLocalized(value)) {
        issues.push(`lesson ${lesson.id} block ${i + 1} (${block.type}): text is not a map`);
      }
    }
  }
  return issues;
}

async function loadAll(db) {
  const courses = [];
  const snap = await db.collection('courses').get();
  for (const c of snap.docs) {
    const lessonSnap = await c.ref.collection('lessons').get();
    const lessons = [];
    for (const l of lessonSnap.docs) {
      const bodySnap = await l.ref.collection('content').get();
      const bodies = {};
      for (const b of bodySnap.docs) {
        if (LOCALES.includes(b.id)) bodies[b.id] = b.data().blocks ?? [];
      }
      lessons.push({
        id: l.id,
        ref: l.ref,
        data: l.data(),
        bodies,
        bodyDocs: bodySnap.docs,
      });
    }
    courses.push({ id: c.id, ref: c.ref, data: c.data(), lessons });
  }
  const categories = (await db.collection('course_categories').get()).docs.map((d) => ({
    id: d.id,
    ref: d.ref,
    data: d.data(),
  }));
  return { courses, categories };
}

async function commitInChunks(db, writes) {
  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) w(batch);
    await batch.commit();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const PHASE = (args.find((a) => a.startsWith('--phase=')) ?? '--phase=all').split('=')[1];
  if (!['all', 'convert', 'verify', 'drop'].includes(PHASE)) {
    console.error(`Unknown --phase=${PHASE} (expected all, convert, verify or drop)`);
    process.exit(1);
  }

  const db = connect();
  let { courses, categories } = await loadAll(db);
  const lessonCount = courses.reduce((n, c) => n + c.lessons.length, 0);
  console.log(
    `Loaded ${courses.length} course(s), ${lessonCount} lesson(s), ${categories.length} category(ies).\n`,
  );

  if (PHASE === 'all' || PHASE === 'convert') {
    const writes = [];
    const problems = [];

    for (const course of courses) {
      const plan = convertCourse(course.data);
      if (plan?.problem) problems.push(`course ${course.id}: ${plan.problem}`);
      if (plan?.update) {
        console.log(
          `  course    ${course.id} -> [${plan.update.availableLanguages}] "${plan.update.title[plan.update.defaultLanguage]}"`,
        );
        writes.push((b) => b.update(course.ref, plan.update));
      }
      const defaultLanguage =
        plan?.update?.defaultLanguage ?? course.data.defaultLanguage ?? BASE_LOCALE;

      for (const lesson of course.lessons) {
        const lp = convertLesson(lesson.data, lesson.bodies, defaultLanguage);
        if (lp?.problem) problems.push(`lesson ${course.id}/${lesson.id}: ${lp.problem}`);
        for (const p of lp?.problems ?? []) {
          problems.push(`lesson ${course.id}/${lesson.id}: ${p}`);
        }
        if (lp?.update) {
          console.log(
            `  lesson    ${course.id}/${lesson.id} -> [${lp.update.availableLanguages}] ${lp.update.content.length} block(s)`,
          );
          writes.push((b) => b.update(lesson.ref, lp.update));
        }
      }
    }

    for (const category of categories) {
      const plan = convertCategory(category.data);
      if (plan?.problem) problems.push(`category ${category.id}: ${plan.problem}`);
      if (plan?.update) {
        console.log(
          `  category  ${category.id} -> [${plan.update.availableLanguages}] "${plan.update.name.en ?? ''}"`,
        );
        writes.push((b) => b.update(category.ref, plan.update));
      }
    }

    for (const p of problems) console.error(`  ✗ ${p}`);
    if (problems.length) {
      console.error('\nRefusing to convert while documents disagree with themselves.');
      process.exit(1);
    }

    console.log(
      writes.length
        ? `\nConvert: ${writes.length} document(s).`
        : '\nConvert: nothing to do — everything is already on v2.',
    );
    if (APPLY && writes.length) {
      await commitInChunks(db, writes);
      console.log('Converted.');
      ({ courses, categories } = await loadAll(db));
    }
  }

  if ((PHASE === 'all' || PHASE === 'drop') && APPLY) {
    // Verify before dropping, always: the v1 fields are the only copy of
    // anything the conversion got wrong.
    const issues = courses.flatMap((c) => verifyCourse(c.data, c.lessons).map((i) => `${c.id}: ${i}`));
    const stillV1 = issues.filter((i) => i.includes('is not a map'));
    if (stillV1.length) {
      console.error('\nRefusing to drop — conversion is incomplete:');
      for (const i of stillV1) console.error(`  ✗ ${i}`);
      process.exit(1);
    }

    const writes = [];
    for (const course of courses) {
      if (course.data.translations !== undefined) {
        writes.push((b) => b.update(course.ref, { translations: FieldValue.delete() }));
      }
      for (const lesson of course.lessons) {
        if (lesson.data.translations !== undefined) {
          writes.push((b) => b.update(lesson.ref, { translations: FieldValue.delete() }));
        }
        for (const body of lesson.bodyDocs) writes.push((b) => b.delete(body.ref));
      }
    }
    for (const category of categories) {
      if (category.data.translations !== undefined) {
        writes.push((b) => b.update(category.ref, { translations: FieldValue.delete() }));
      }
    }

    console.log(
      writes.length
        ? `\nDrop: ${writes.length} v1 leftover(s).`
        : '\nDrop: nothing to do.',
    );
    if (writes.length) {
      await commitInChunks(db, writes);
      console.log('Dropped.');
      ({ courses, categories } = await loadAll(db));
    }
  }

  if (PHASE === 'all' || PHASE === 'verify' || (PHASE === 'drop' && APPLY)) {
    const issues = courses.flatMap((c) =>
      verifyCourse(c.data, c.lessons).map((i) => `${c.id}: ${i}`),
    );
    for (const category of categories) {
      if (!isLocalized(category.data.name)) {
        issues.push(`category ${category.id}: name is not a map`);
      }
      if (category.data.translations !== undefined) {
        issues.push(`category ${category.id}: still carries \`translations\``);
      }
    }

    if (issues.length) {
      console.error(`\nVerify: ${issues.length} problem(s) —`);
      for (const i of issues) console.error(`  ✗ ${i}`);
      if (APPLY) process.exit(1);
    } else {
      console.log('\nVerify: every document is coherent v2.');
    }
  }

  if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
