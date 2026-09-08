/**
 * Seeds the lesson quiz for "Praying the Psalms" —
 * courses/learning-to-pray/lessons/learning-to-pray-l03.
 *
 * Conventions taken from the lesson quiz that already exists on lesson 1
 * (`lesson-learning-to-pray-learning-to-pray-l01`), not from the generic
 * example in COURSES_BACKEND_SPEC.md:
 *   - derived quiz id `lesson-{courseId}-{lessonId}`, `kind: 'lesson'`,
 *     `categoryId: 'lesson'`;
 *   - quiz title/description are plain strings (the localized-map migration
 *     covers courses and lessons, not quizzes);
 *   - questions are `q01`…`qNN` with an `order`, each carrying `quizId`;
 *   - `multiple_choice` or `true_false` only — never `short_answer`;
 *   - `true_false` stores no `options`; the app renders True at index 0 and
 *     False at index 1, so `correctOptionId: 0` means True;
 *   - `referenceVerse` is a real object (not a stringified ref) on questions
 *     that hang on a specific verse;
 *   - the `meta/stat` doc is written too — without it the quiz card shows
 *     NaN / "0 questions".
 *
 * Also flips `hasQuiz` on the lesson and bumps the course's denormalized
 * `lessonQuizCount` (1 -> 2), which is what the catalog card reports.
 *
 * Usage (same env as the dashboard):
 *   node --env-file=.env scripts/seed-praying-the-psalms-quiz.mjs           # plan only
 *   node --env-file=.env scripts/seed-praying-the-psalms-quiz.mjs --apply
 *
 * Ids are deterministic, so --apply is idempotent.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COURSE_ID = 'learning-to-pray';
const LESSON_ID = 'learning-to-pray-l03';
const QUIZ_ID = `lesson-${COURSE_ID}-${LESSON_ID}`;

const PSALMS = 19; // book index used by the in-app reader

const QUIZ = {
  title: 'Praying the Psalms — Lesson Quiz',
  lowerCaseTitle: 'praying the psalms — lesson quiz',
  description:
    'Check what stayed with you: why the psalms were written down, what ' +
    'they give you permission to say, and how to actually pray one.',
  categoryId: 'lesson',
  kind: 'lesson',
  ageGroup: 'all',
  dificultyLevel: 'easy',
  isPublished: true,
};

const QUESTIONS = [
  {
    text: 'According to the lesson, what are the psalms?',
    questionType: 'multiple_choice',
    options: [
      'Poems written about God for others to admire',
      'Prayers addressed to God, written down so others could pray them too',
      'A history of Israel set to music',
      'Rules for how worship services should be run',
    ],
    correctOptionId: 1,
    explanation:
      'They are not poems about God — they are prayers to Him, handed on so ' +
      'that other people could join in rather than compose their own.',
  },
  {
    text:
      'For most of the Church’s history, the ordinary way to pray was to ' +
      'compose your own words rather than join in words already written.',
    questionType: 'true_false',
    correctOptionId: 1,
    explanation:
      'False. The lesson says the opposite: "you did not compose, you joined ' +
      'in." Composing your own prayer is the newer habit.',
  },
  {
    text:
      'Psalm 62:8 says to pour out your heart to God. What does the lesson ' +
      'say that permission rules out?',
    questionType: 'multiple_choice',
    options: [
      'Praying out loud',
      'Praying with other people',
      'Tidying your heart up into something respectable first',
      'Asking God for anything specific',
    ],
    correctOptionId: 2,
    explanation:
      'Pour it out — not tidy it, not edit it into something respectable ' +
      'before God is allowed to hear it.',
    referenceVerse: { book: PSALMS, chapter: 62, verse: 8 },
  },
  {
    text:
      'A psalm can accuse God of forgetting and demand to know how long — ' +
      'and still be prayer.',
    questionType: 'true_false',
    correctOptionId: 0,
    explanation:
      'True. A psalm will refuse to be comforted and then declare God is ' +
      'good, often in the same breath. Both halves are prayer.',
  },
  {
    text: 'Which psalm does the lesson suggest when you have something to confess?',
    questionType: 'multiple_choice',
    options: ['Psalm 23', 'Psalm 51', 'Psalm 103', 'Psalm 139'],
    correctOptionId: 1,
    explanation:
      'Psalm 51 is the confession psalm. Psalm 23 is for being led, 103 for ' +
      'remembering what He has done, 139 for feeling unknown.',
    referenceVerse: { book: PSALMS, chapter: 51, verse: 1 },
  },
  {
    text:
      'The lesson names one psalm for the days when nothing has resolved and ' +
      'you will not fake it. Which is it?',
    questionType: 'multiple_choice',
    options: ['Psalm 23', 'Psalm 88', 'Psalm 103', 'Psalm 139'],
    correctOptionId: 1,
    explanation:
      'Psalm 88 ends without resolution — which is exactly why it is there ' +
      'for the days that do the same.',
    referenceVerse: { book: PSALMS, chapter: 88, verse: 1 },
  },
  {
    text: 'When you are praying a psalm and a line lands, what does the lesson say to do?',
    questionType: 'multiple_choice',
    options: [
      'Note it down and keep reading to the end',
      'Stop there and stay — finishing the psalm is not the goal',
      'Start the psalm again from the beginning',
      'Move on to a second psalm on the same theme',
    ],
    correctOptionId: 1,
    explanation:
      'The goal is not to finish the psalm. When a line lands, stay there.',
  },
  {
    text:
      'The lesson suggests changing the pronouns — "the Lord is my shepherd" ' +
      'becoming "You are my shepherd, and today I need You to be."',
    questionType: 'true_false',
    correctOptionId: 0,
    explanation:
      'True. Read it slowly, out loud if you can, and change the pronouns ' +
      'where it helps turn the psalm into address.',
    referenceVerse: { book: PSALMS, chapter: 23, verse: 1 },
  },
  {
    text: 'How does the lesson answer the worry that borrowed words are insincere?',
    questionType: 'multiple_choice',
    options: [
      'Borrowed words are a last resort, only for beginners',
      'It is like singing a hymn you did not write — the words become yours in the praying',
      'Sincerity does not matter as long as the words are Scripture',
      'You should always follow a psalm with a prayer of your own',
    ],
    correctOptionId: 1,
    explanation:
      'Same as a hymn you did not write: the words become yours in the ' +
      'praying of them, and on the days you have none of your own, they carry you.',
  },
  {
    text: 'Which is NOT one of the three things the lesson asks you to do this week?',
    questionType: 'multiple_choice',
    options: [
      'Pray one psalm a day, out loud',
      'Stop at the first line that lands and stay there for a minute',
      'Write down the one line you want to remember on a hard day',
      'Memorize a whole psalm by the end of the week',
    ],
    correctOptionId: 3,
    explanation:
      'Memorizing is not asked for. The week is one psalm a day out loud, ' +
      'stopping where a line lands, and writing down the line worth keeping.',
  },
];

const pad = (n) => String(n).padStart(2, '0');

async function main() {
  const apply = process.argv.includes('--apply');

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / ' +
        'FIREBASE_ADMIN_PRIVATE_KEY',
    );
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();

  const lessonRef = db.doc(`courses/${COURSE_ID}/lessons/${LESSON_ID}`);
  const lesson = await lessonRef.get();
  if (!lesson.exists) throw new Error(`Lesson ${LESSON_ID} not found`);

  const courseRef = db.doc(`courses/${COURSE_ID}`);
  const course = await courseRef.get();
  const alreadyHadQuiz = lesson.get('hasQuiz') === true;
  const quizExists = (await db.doc(`quizzes/${QUIZ_ID}`).get()).exists;

  console.log(`quizzes/${QUIZ_ID}`);
  console.log(`  lesson       : ${JSON.stringify(lesson.get('title'))}`);
  console.log(`  questions    : ${QUESTIONS.length}`);
  console.log(`  exists       : ${quizExists}`);
  console.log(`  lesson.hasQuiz -> true (was ${lesson.get('hasQuiz')})`);
  const nextCount =
    (course.get('lessonQuizCount') ?? 0) + (alreadyHadQuiz || quizExists ? 0 : 1);
  console.log(
    `  course.lessonQuizCount ${course.get('lessonQuizCount')} -> ${nextCount}`,
  );
  QUESTIONS.forEach((q, i) =>
    console.log(`  q${pad(i + 1)} [${q.questionType}] ${q.text}`),
  );

  if (!apply) {
    console.log('\nPlan only. Re-run with --apply to write.');
    return;
  }

  const batch = db.batch();
  const quizRef = db.doc(`quizzes/${QUIZ_ID}`);
  batch.set(quizRef, { ...QUIZ, createdAt: FieldValue.serverTimestamp() });
  batch.set(quizRef.collection('meta').doc('stat'), {
    quizId: QUIZ_ID,
    numberOfQuestions: QUESTIONS.length,
    totalNumberOfTrials: 0,
    averageScore: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  QUESTIONS.forEach((q, i) => {
    const id = `q${pad(i + 1)}`;
    batch.set(quizRef.collection('questions').doc(id), {
      ...q,
      id,
      quizId: QUIZ_ID,
      order: i + 1,
    });
  });
  batch.update(lessonRef, { hasQuiz: true });
  batch.update(courseRef, { lessonQuizCount: nextCount });
  await batch.commit();

  console.log('\nApplied.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});