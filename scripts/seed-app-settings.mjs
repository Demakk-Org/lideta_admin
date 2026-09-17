/**
 * Seeds `app_settings/published`, the document the mobile app reads at the
 * splash screen to decide which features are on.
 *
 * The app treats a missing doc, a missing key or a non-boolean value as
 * DISABLED, so every key in `src/lib/featureKeys.ts` is written explicitly.
 * Every write goes through a version, like a publish from the dashboard:
 *
 *   - nothing published: publish a new version with every key `true`. If the
 *     pre-versioning `app_settings/default` exists, its values are imported
 *     first, so switches an admin already turned off stay off;
 *   - something published but missing keys: publish a new version copied
 *     from it with only the missing keys added as `true`, and archive the old
 *     one. Existing values are never changed, and unknown keys are kept;
 *   - nothing missing: write nothing.
 *
 * Drafts are left alone. The write runs in a transaction and adds a
 * `history` entry, so the publish log stays complete.
 *
 * Usage (reads the same env vars as the dashboard; needs Node >= 22.18 to
 * import the TypeScript feature list):
 *
 *   npm run seed:app-settings -- --dry-run
 *   npm run seed:app-settings
 */
import { pathToFileURL } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
  APP_SETTINGS_COLLECTION,
  APP_SETTINGS_HISTORY_COLLECTION,
  APP_SETTINGS_LEGACY_DOC_ID,
  APP_SETTINGS_PUBLISHED_DOC_ID,
  APP_SETTINGS_VERSIONS_COLLECTION,
  FEATURE_KEYS,
} from '../src/lib/featureKeys.ts';

export const SEED_ACTOR = 'script:seed-app-settings';

/** Connects only when the script is run, so the planner stays importable. */
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function featuresOf(data) {
  return data && isPlainObject(data.features) ? data.features : null;
}

/**
 * Works out what to write.
 *
 * @param published  data of `app_settings/published`, or null when missing
 * @param legacy     data of `app_settings/default`, or null when missing
 * @param latestVersion  highest version number in `versions` (0 when none);
 *                   the new version is numbered one past it, so it never
 *                   collides with a draft
 */
export function planSeed({ published, legacy, latestVersion }, keys = FEATURE_KEYS) {
  const publishedFeatures = featuresOf(published);
  const legacyFeatures = featuresOf(legacy);
  const base = publishedFeatures ?? legacyFeatures ?? {};

  const added = keys.filter((k) => !Object.hasOwn(base, k));
  const invalid = keys.filter((k) => Object.hasOwn(base, k) && typeof base[k] !== 'boolean');
  const unknown = Object.keys(base).filter((k) => !keys.includes(k)).sort();
  const publishedVersion =
    published && Number.isInteger(published.version) ? published.version : null;
  const source = published ? 'published' : legacyFeatures ? 'legacy' : 'none';

  const common = { added, invalid, unknown, source, publishedVersion };

  // Something usable is live and complete: leave it.
  if (publishedFeatures && added.length === 0) {
    return { ...common, action: 'none', version: publishedVersion, features: base, note: '' };
  }

  const version = (Number.isInteger(latestVersion) ? latestVersion : 0) + 1;
  const features = { ...base, ...Object.fromEntries(added.map((k) => [k, true])) };
  const note =
    source === 'published'
      ? `Seed: added ${added.join(', ')}`
      : source === 'legacy'
        ? `Seed: imported from ${APP_SETTINGS_COLLECTION}/${APP_SETTINGS_LEGACY_DOC_ID}`
        : 'Seed: initial version, all features on';

  return { ...common, action: 'publish', version, features, note };
}

function report(plan) {
  if (plan.action === 'none') {
    console.log(
      `Published version ${plan.publishedVersion} has every key. Nothing to write.`,
    );
  } else {
    const from =
      plan.source === 'published'
        ? `a copy of published version ${plan.publishedVersion}`
        : plan.source === 'legacy'
          ? `values imported from ${APP_SETTINGS_COLLECTION}/${APP_SETTINGS_LEGACY_DOC_ID}`
          : 'every feature on';
    console.log(`Will publish version ${plan.version}: ${from}.`);
    if (plan.added.length) {
      console.log(`Keys added as true (${plan.added.length}):`);
      for (const k of plan.added) console.log(`  + ${k}`);
    }
  }

  if (plan.invalid.length) {
    console.warn(
      `\nWarning: these keys hold a non-boolean, which the app treats as OFF. Left unchanged:\n  ${plan.invalid.join(', ')}`,
    );
  }
  if (plan.unknown.length) {
    console.warn(`\nNote: keys not in featureKeys.ts, kept as they are:\n  ${plan.unknown.join(', ')}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = connect();
  const settings = db.collection(APP_SETTINGS_COLLECTION);
  const publishedRef = settings.doc(APP_SETTINGS_PUBLISHED_DOC_ID);
  const legacyRef = settings.doc(APP_SETTINGS_LEGACY_DOC_ID);
  const versionsRef = publishedRef.collection(APP_SETTINGS_VERSIONS_COLLECTION);

  const plan = await db.runTransaction(async (tx) => {
    const [publishedSnap, legacySnap, newestSnap] = await Promise.all([
      tx.get(publishedRef),
      tx.get(legacyRef),
      tx.get(versionsRef.orderBy('version', 'desc').limit(1)),
    ]);
    const published = publishedSnap.exists ? publishedSnap.data() : null;
    const newest = newestSnap.docs[0]?.data();

    const plan = planSeed({
      published,
      legacy: legacySnap.exists ? legacySnap.data() : null,
      latestVersion: newest?.version ?? 0,
    });
    if (dryRun || plan.action === 'none') return plan;

    // All reads before the first write.
    const previousRef =
      plan.publishedVersion !== null ? versionsRef.doc(String(plan.publishedVersion)) : null;
    const previousExists = previousRef ? (await tx.get(previousRef)).exists : false;

    const now = FieldValue.serverTimestamp();
    tx.create(versionsRef.doc(String(plan.version)), {
      version: plan.version,
      status: 'published',
      features: plan.features,
      note: plan.note,
      basedOn: plan.publishedVersion,
      revision: 1,
      createdBy: SEED_ACTOR,
      createdAt: now,
      updatedBy: SEED_ACTOR,
      updatedAt: now,
      publishedBy: SEED_ACTOR,
      publishedAt: now,
    });
    if (previousRef && previousExists) {
      tx.update(previousRef, { status: 'archived' });
    }
    tx.set(publishedRef, {
      features: plan.features,
      version: plan.version,
      updatedAt: now,
      publishedBy: SEED_ACTOR,
    });

    const before = featuresOf(published) ?? {};
    tx.set(publishedRef.collection(APP_SETTINGS_HISTORY_COLLECTION).doc(), {
      version: plan.version,
      fromVersion: plan.publishedVersion,
      changed: Object.fromEntries(
        Object.keys(plan.features)
          .filter((k) => before[k] !== plan.features[k])
          .sort()
          .map((k) => [
            k,
            {
              from: typeof before[k] === 'boolean' ? before[k] : null,
              to: typeof plan.features[k] === 'boolean' ? plan.features[k] : null,
            },
          ]),
      ),
      publishedBy: SEED_ACTOR,
      publishedAt: now,
    });
    return plan;
  });

  report(plan);
  if (dryRun) console.log('\nDry run — nothing was written.');
  else if (plan.action !== 'none') console.log('\nDone.');
}

// Skipped when the module is imported (by its test), run when invoked directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
