/**
 * One-off migration for the `courses` schema change:
 *
 *   1. backfill `createdAt` on every course missing it, derived from the old
 *      `order` values so the existing curation survives (lowest order = newest,
 *      because the catalog is now newest-first);
 *   2. delete the `order` field from every course document.
 *
 * Phase 1 must run before phase 2 — once `order` is gone there is nothing left
 * to derive dates from. `--phase=all` (the default) does them in that order.
 *
 * Existing `createdAt` values are never touched: members page the catalog with
 * a keyset cursor over (createdAt, __name__), so re-stamping a live course can
 * make a card be skipped or repeated mid-scroll.
 *
 * Usage (reads the same env vars as the dashboard):
 *
 *   node --env-file=.env scripts/migrate-course-order-to-createdat.mjs
 *   node --env-file=.env scripts/migrate-course-order-to-createdat.mjs --apply
 *   node --env-file=.env scripts/migrate-course-order-to-createdat.mjs --apply --phase=backfill
 *
 * Without `--apply` it only prints the plan.
 */
import { pathToFileURL } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

/** Spacing between derived timestamps. Wide enough that no two collide. */
export const STEP_MS = 60_000;

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

function readCreatedAt(data) {
  const val = data.createdAt;
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate().getTime();
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((val.nanoseconds ?? 0) / 1e6);
  }
  if (typeof val === 'string') {
    const t = Date.parse(val);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

async function loadCourses(db) {
  const snap = await db.collection('courses').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === 'string' ? data.title : d.id,
      order: typeof data.order === 'number' ? data.order : null,
      hasOrder: 'order' in data,
      createdAt: readCreatedAt(data),
    };
  });
}

/**
 * Returns the derived timestamp per course id that needs one.
 *
 * The intended sequence is the old `order` ascending — lowest order is newest.
 * Courses that already carry a `createdAt` are anchors; a run of missing
 * courses between two anchors is spaced evenly inside that window so the
 * backfilled courses land exactly where the curation put them.
 */
export function planBackfill(courses, nowMs) {
  // Newest first: order ascending, id as a stable tiebreak.
  const sequence = [...courses].sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    return ao === bo ? a.id.localeCompare(b.id) : ao - bo;
  });

  const derived = new Map();
  const warnings = [];
  let i = 0;

  while (i < sequence.length) {
    if (sequence[i].createdAt != null) {
      i += 1;
      continue;
    }

    // A run of consecutive courses with no createdAt: [i, j).
    let j = i;
    while (j < sequence.length && sequence[j].createdAt == null) j += 1;

    const newerAnchor = i > 0 ? sequence[i - 1].createdAt : null;
    const olderAnchor = j < sequence.length ? sequence[j].createdAt : null;
    const run = sequence.slice(i, j);

    if (newerAnchor != null && olderAnchor != null) {
      if (olderAnchor >= newerAnchor) {
        // The surviving dates already contradict the `order` sequence; keep the
        // run below the newer anchor and flag it for a human.
        warnings.push(
          `Existing createdAt values around "${run[0].title}" already disagree with the old order ` +
            `(${new Date(newerAnchor).toISOString()} then ${new Date(olderAnchor).toISOString()}); ` +
            `derived dates step down from the newer one instead of interpolating.`,
        );
        run.forEach((c, k) => derived.set(c.id, newerAnchor - (k + 1) * STEP_MS));
      } else {
        const gap = (newerAnchor - olderAnchor) / (run.length + 1);
        run.forEach((c, k) => derived.set(c.id, Math.round(newerAnchor - (k + 1) * gap)));
      }
    } else if (olderAnchor != null) {
      // Leading run: newer than everything anchored, stepping up from the first anchor.
      run.forEach((c, k) => derived.set(c.id, olderAnchor + (run.length - k) * STEP_MS));
    } else if (newerAnchor != null) {
      // Trailing run: older than everything anchored.
      run.forEach((c, k) => derived.set(c.id, newerAnchor - (k + 1) * STEP_MS));
    } else {
      // No anchors at all: lay the whole catalog out backwards from now.
      run.forEach((c, k) => derived.set(c.id, nowMs - k * STEP_MS));
    }

    i = j;
  }

  return { derived, warnings, sequence };
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

  if (!['all', 'backfill', 'drop'].includes(PHASE)) {
    console.error(`Unknown --phase=${PHASE} (expected all, backfill or drop)`);
    process.exit(1);
  }

  const db = connect();
  const courses = await loadCourses(db);
  console.log(`Loaded ${courses.length} courses.`);

  const missing = courses.filter((c) => c.createdAt == null);
  const withOrder = courses.filter((c) => c.hasOrder);
  console.log(`  ${missing.length} missing createdAt · ${withOrder.length} still carrying order`);

  if (PHASE === 'all' || PHASE === 'backfill') {
    const { derived, warnings } = planBackfill(courses, Date.now());
    for (const w of warnings) console.warn(`  ! ${w}`);

    if (derived.size === 0) {
      console.log('Backfill: nothing to do — every course already has createdAt.');
    } else {
      console.log(`Backfill: ${derived.size} course(s) —`);
      for (const c of courses) {
        const ms = derived.get(c.id);
        if (ms != null) {
          console.log(
            `  ${c.id}  order=${c.order ?? '-'}  ->  createdAt=${new Date(ms).toISOString()}  (${c.title})`,
          );
        }
      }
      if (APPLY) {
        await commitInChunks(
          db,
          [...derived].map(([id, ms]) => (batch) =>
            batch.update(db.collection('courses').doc(id), {
              createdAt: Timestamp.fromMillis(ms),
            }),
          ),
        );
        console.log('Backfill applied.');
      }
    }
  }

  if (PHASE === 'all' || PHASE === 'drop') {
    if (withOrder.length === 0) {
      console.log('Drop order: nothing to do — no course carries the field.');
    } else {
      console.log(`Drop order: ${withOrder.length} course(s).`);
      if (APPLY) {
        // Re-read so we never drop `order` off a course the backfill skipped.
        const stillMissing = (await loadCourses(db)).filter((c) => c.createdAt == null);
        if (stillMissing.length) {
          console.error(
            `Refusing to drop order: ${stillMissing.length} course(s) still have no createdAt ` +
              `(${stillMissing.map((c) => c.id).join(', ')}). Run the backfill phase first.`,
          );
          process.exit(1);
        }
        await commitInChunks(
          db,
          withOrder.map((c) => (batch) =>
            batch.update(db.collection('courses').doc(c.id), {
              order: FieldValue.delete(),
            }),
          ),
        );
        console.log('Order field deleted.');
      }
    }
  }

  if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');
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
