/**
 * Seeds the course "Walking with God" — a six-lesson sequel to "Knowing God".
 *
 * The dependency is the point: `prerequisiteCourseIds: ['knowing-god']`.
 * Knowing God is about who God is; this is about living with him once you do.
 *
 * Conventions here are taken from the courses already in Firestore, not from
 * the generic example in COURSES_BACKEND_SPEC.md §10:
 *   - slug document ids (`walking-with-god`, `walking-with-god-l01`, `q01`);
 *   - lessons are a subcollection and carry no `courseId` field;
 *   - lessons hold only order/title/shortDescription/estimatedMinutes/content/
 *     hasQuiz/status/createdAt — no author_id, imageUrl, category or tags;
 *   - no per-lesson quizzes (`lessonQuizCount: 0`), one final quiz of twelve
 *     questions at `course-{courseId}`, exactly as Knowing God does it;
 *   - scripture is quoted in modern English, and a scripture quote carries
 *     `isBibleVerse: true` with `ref` as a stringified VerseReference so the
 *     block opens the in-app reader.
 *
 * No `order` field is written — the catalog is ordered by `createdAt` now.
 *
 * Usage (same env as the dashboard):
 *   node --env-file=.env scripts/seed-walking-with-god.mjs           # plan only
 *   node --env-file=.env scripts/seed-walking-with-god.mjs --apply
 *
 * Ids are deterministic, so --apply is idempotent: a second run overwrites the
 * same documents rather than creating a duplicate course.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COURSE_ID = 'walking-with-god';
const PREREQUISITE_ID = 'knowing-god';

/** Scripture quote block; `ref` is a stringified VerseReference. */
const verse = (text, book, chapter, verseNo, toVerse) => ({
  type: 'quote',
  value: {
    text,
    ref: JSON.stringify(
      toVerse
        ? { book, chapter, verse: verseNo, toVerse }
        : { book, chapter, verse: verseNo },
    ),
    isBibleVerse: true,
  },
});

const COURSE = {
  title: 'Walking with God',
  lowerCaseTitle: 'walking with god',
  description:
    'What happens after you know who God is. Six lessons on prayer, ' +
    'Scripture, obedience, the company of other believers, and the stretches ' +
    'where God seems silent.',
  // Daily practice rather than doctrine, so this sits with Faith at Work.
  // Change to 'foundations-of-faith' to shelve it beside its prerequisite.
  categoryId: 'christian-living',
  ageGroup: 'all',
  level: 'intermediate',
  sequential: true,
  hasFinalQuiz: true,
  lessonQuizCount: 0,
  prerequisiteCourseIds: [PREREQUISITE_ID],
};

const LESSONS = [
  {
    id: `${COURSE_ID}-l01`,
    order: 1,
    title: 'From Knowing to Walking',
    shortDescription: 'What changes on the Monday after you know who God is.',
    estimatedMinutes: 10,
    content: [
      {
        type: 'paragraph',
        value:
          'You have spent a course learning who God is — His holiness, His ' +
          'mercy, His patience, His refusal to be anything other than Himself. ' +
          'That knowledge was never meant to sit still.',
      },
      { type: 'title', value: 'A walk, not a position' },
      {
        type: 'paragraph',
        value:
          'Scripture almost never describes life with God as a position held. ' +
          'It describes it as a walk: something done in steps, in a direction, ' +
          'over ordinary time.',
      },
      verse(
        'Enoch walked faithfully with God; then he was no more, because God ' +
          'took him away.',
        1,
        5,
        24,
      ),
      {
        type: 'paragraph',
        value:
          'Enoch gets four words of biography and one of them is "walked". ' +
          'Not "understood". Not "believed about". Walked — the plainest verb ' +
          'there is, the one that covers ordinary distance in ordinary days.',
      },
      { type: 'title', value: 'The same Lord you received' },
      verse(
        'So then, just as you received Christ Jesus as Lord, continue to live ' +
          'your lives in him.',
        51,
        2,
        6,
      ),
      {
        type: 'paragraph',
        value:
          'Paul is heading off a very common mistake: that you come to God one ' +
          'way — by grace, empty-handed — and then continue with Him another ' +
          'way, by effort and performance. You do not. The walk runs on the ' +
          'same fuel the first step did.',
      },
      { type: 'title', value: 'What the walk is made of' },
      verse(
        'He has shown you, O mortal, what is good. And what does the LORD ' +
          'require of you? To act justly and to love mercy and to walk humbly ' +
          'with your God.',
        33,
        6,
        8,
      ),
      {
        type: 'list',
        value: [
          'Prayer — speaking to the God you have come to know.',
          'Scripture — letting Him keep the first word.',
          'Obedience — trust that has become visible.',
          'The church — the ordinary company God gives you.',
          'Endurance — walking when you cannot see Him.',
        ],
      },
      {
        type: 'paragraph',
        value:
          'None of these are new information about God. They are what happens ' +
          'to a life when the information is true.',
      },
    ],
  },
  {
    id: `${COURSE_ID}-l02`,
    order: 2,
    title: 'Prayer: Talking with the God You Know',
    shortDescription: 'Why prayer gets easier once God stops being a stranger.',
    estimatedMinutes: 11,
    content: [
      { type: 'title', value: 'A request, not a technique' },
      verse(
        'Lord, teach us to pray, just as John taught his disciples.',
        42,
        11,
        1,
      ),
      {
        type: 'paragraph',
        value:
          'They had watched Him pray and wanted what He had. Notice they did ' +
          'not ask for a method. They asked a person to teach them — which is ' +
          'itself the first lesson about prayer.',
      },
      { type: 'title', value: 'Prayer follows knowledge' },
      {
        type: 'paragraph',
        value:
          'This is why Knowing God had to come first. It is hard to speak ' +
          'honestly to someone you have only heard rumours about. Once you know ' +
          'God is holy, you stop being casual. Once you know He is merciful, ' +
          'you stop being terrified. Both change what comes out of your mouth.',
      },
      verse(
        'As the deer pants for streams of water, so my soul pants for you, my ' +
          'God.',
        19,
        42,
        1,
      ),
      { type: 'title', value: 'The room with the door shut' },
      verse(
        'But when you pray, go into your room, close the door and pray to your ' +
          'Father, who is unseen. Then your Father, who sees what is done in ' +
          'secret, will reward you.',
        40,
        6,
        6,
      ),
      {
        type: 'paragraph',
        value:
          'Jesus is not banning public prayer — He prayed publicly Himself. He ' +
          'is removing the audience, because an audience quietly changes who ' +
          'you are really talking to.',
      },
      {
        type: 'list',
        value: [
          'Start where you actually are, not where you think you should be.',
          'Say the true thing before the tidy thing.',
          'Shorter and daily beats longer and rare.',
          'Silence is not failure — it is most of what listening looks like.',
        ],
      },
      {
        type: 'paragraph',
        value:
          'This is one lesson on a subject that deserves many. The course ' +
          'Learning to Pray takes it further; this one only asks you to begin.',
      },
    ],
  },
  {
    id: `${COURSE_ID}-l03`,
    order: 3,
    title: 'The Word: Letting God Set the Terms',
    shortDescription:
      'Reading Scripture so it can correct you, not only comfort you.',
    estimatedMinutes: 12,
    content: [
      { type: 'title', value: 'Given, not merely collected' },
      verse(
        'All Scripture is God-breathed and is useful for teaching, rebuking, ' +
          'correcting and training in righteousness.',
        55,
        3,
        16,
      ),
      {
        type: 'paragraph',
        value:
          'Read that list of four again. Only one of them is comfortable. ' +
          'Rebuking and correcting are in there by design — a word that can ' +
          'only agree with you cannot lead you anywhere you were not already ' +
          'going.',
      },
      { type: 'title', value: 'Light for the next step' },
      verse('Your word is a lamp for my feet, a light on my path.', 19, 119, 105),
      {
        type: 'paragraph',
        value:
          'A lamp at your feet shows the next step, not the whole road. That is ' +
          'a promise about sufficiency, not about certainty — and it is one of ' +
          'the most practical things Scripture says about itself.',
      },
      { type: 'title', value: 'What it is for' },
      verse(
        'Do not conform to the pattern of this world, but be transformed by the ' +
          'renewing of your mind. Then you will be able to test and approve what ' +
          "God's will is.",
        45,
        12,
        2,
      ),
      {
        type: 'list',
        value: [
          'Read in course, rather than hunting for verses that suit the mood.',
          'Ask what it meant before asking what it means to you.',
          'Let the hard passages stay hard rather than filing them down.',
          'Read slowly enough to be argued with.',
        ],
      },
    ],
  },
  {
    id: `${COURSE_ID}-l04`,
    order: 4,
    title: 'Obedience: Trust Made Visible',
    shortDescription:
      'Why obedience is evidence of the relationship, not payment for it.',
    estimatedMinutes: 12,
    content: [
      { type: 'title', value: 'Hearing is not arriving' },
      verse(
        'Do not merely listen to the word, and so deceive yourselves. Do what ' +
          'it says.',
        59,
        1,
        22,
      ),
      {
        type: 'paragraph',
        value:
          'James names the specific danger: not rebellion, but self-deception. ' +
          'Someone who hears a great deal and does none of it will still feel ' +
          'like a person who is getting on well.',
      },
      { type: 'title', value: 'Attached, then fruitful' },
      verse(
        'I am the vine; you are the branches. If you remain in me and I in you, ' +
          'you will bear much fruit; apart from me you can do nothing.',
        43,
        15,
        5,
      ),
      {
        type: 'paragraph',
        value:
          'The order matters, and it is the opposite of what religion usually ' +
          'assumes. Branches do not produce fruit in order to get attached to ' +
          'the vine. They produce fruit because they are attached. Obedience is ' +
          'downstream of the relationship — which is exactly why it cannot be ' +
          'skipped, and exactly why it is not the price of entry.',
      },
      { type: 'title', value: 'In the ordinary hours' },
      verse(
        'These commandments that I give you today are to be on your hearts. ' +
          'Impress them on your children. Talk about them when you sit at home ' +
          'and when you walk along the road, when you lie down and when you get ' +
          'up.',
        5,
        6,
        6,
        7,
      ),
      {
        type: 'paragraph',
        value:
          'Sitting, walking, lying down, getting up. Obedience is aimed at the ' +
          'unremarkable parts of the day, because that is where most of a life ' +
          'is actually spent.',
      },
    ],
  },
  {
    id: `${COURSE_ID}-l05`,
    order: 5,
    title: 'Walking Together',
    shortDescription: 'The church as the ordinary place the walk happens.',
    estimatedMinutes: 10,
    content: [
      { type: 'title', value: 'Light and company arrive together' },
      verse(
        'But if we walk in the light, as he is in the light, we have fellowship ' +
          'with one another, and the blood of Jesus, his Son, purifies us from ' +
          'all sin.',
        62,
        1,
        7,
      ),
      {
        type: 'paragraph',
        value:
          'John does not say that walking in the light produces private ' +
          'tidiness. He says it produces fellowship. Honesty before God and ' +
          'honesty before people turn out to be nearly the same muscle.',
      },
      { type: 'title', value: 'A deliberate habit' },
      verse(
        'And let us consider how we may spur one another on toward love and ' +
          'good deeds, not giving up meeting together, as some are in the habit ' +
          'of doing, but encouraging one another.',
        58,
        10,
        24,
        25,
      ),
      {
        type: 'paragraph',
        value:
          '"As some are in the habit of doing" — drifting away was already ' +
          'normal when Hebrews was written. The remedy offered is not ' +
          'enthusiasm but a habit: keep showing up, and pay attention to the ' +
          'people you find there.',
      },
      {
        type: 'list',
        value: [
          'Be known by a few people, not only present among many.',
          'Give someone permission to ask you a hard question.',
          'Turn up on the weeks you least feel like it.',
          'Serve somewhere small enough that your absence is noticed.',
        ],
      },
    ],
  },
  {
    id: `${COURSE_ID}-l06`,
    order: 6,
    title: 'Walking Through the Dark',
    shortDescription: 'What to do with the stretch where God seems silent.',
    estimatedMinutes: 13,
    content: [
      { type: 'title', value: 'The complaint is allowed' },
      verse(
        'How long, Lord? Will you forget me forever? How long will you hide ' +
          'your face from me?',
        19,
        13,
        1,
      ),
      {
        type: 'paragraph',
        value:
          'This is in the songbook. Not an appendix of things people should not ' +
          "have said — the actual worship material of God's people. Whatever " +
          'else silence means, it does not mean you have to pretend.',
      },
      { type: 'title', value: 'Silence is not absence' },
      verse(
        'For my thoughts are not your thoughts, neither are your ways my ways, ' +
          'declares the LORD.',
        23,
        55,
        8,
      ),
      {
        type: 'paragraph',
        value:
          'Everything you learned about God in the first course is doing its ' +
          'work right here. A God you had not troubled to know would be ' +
          'indistinguishable from a God who had left. A God you know can be ' +
          'trusted through a silence you do not understand.',
      },
      verse(
        'But he knows the way that I take; when he has tested me, I will come ' +
          'forth as gold.',
        18,
        23,
        10,
      ),
      { type: 'title', value: 'Faith with nothing left to hold' },
      verse(
        'Though the fig tree does not bud and there are no grapes on the vines, ' +
          'though the olive crop fails and the fields produce no food, though ' +
          'there are no sheep in the pen and no cattle in the stalls, yet I will ' +
          'rejoice in the LORD, I will be joyful in God my Savior.',
        35,
        3,
        17,
        18,
      ),
      {
        type: 'paragraph',
        value:
          'Habakkuk lists every reason for despair, in full, without softening ' +
          'one of them — and then says "yet". That word is the whole of this ' +
          'lesson, and very nearly the whole of the walk.',
      },
    ],
  },
];

const FINAL_QUIZ = {
  title: 'Walking with God — Final Quiz',
  description:
    'A review of all six lessons: the walk itself, prayer, Scripture, ' +
    'obedience, the church, and endurance when God seems silent.',
  dificultyLevel: 'medium', // the schema's spelling
  questions: [
    {
      text: 'Lesson 1 said Scripture describes life with God mainly as what?',
      questionType: 'multiple_choice',
      options: ['A walk', 'A position', 'A contract', 'A ceremony'],
      correctOptionId: 0,
      explanation:
        'Steps, in a direction, over ordinary time — Enoch "walked faithfully ' +
        'with God".',
    },
    {
      text: 'Which man is summed up in Genesis as one who walked with God?',
      questionType: 'multiple_choice',
      options: ['Enoch', 'Esau', 'Eli', 'Elihu'],
      correctOptionId: 0,
    },
    {
      text:
        'According to Colossians 2:6, the Christian life continues by different ' +
        'means than it began.',
      questionType: 'true_false',
      correctOptionId: 1,
      explanation:
        'False. "Just as you received Christ Jesus as Lord, continue to live ' +
        'your lives in him" — the same grace, the whole way.',
    },
    {
      text: 'Micah 6:8 says the LORD requires us to walk with Him how?',
      questionType: 'multiple_choice',
      options: ['Humbly', 'Quickly', 'Alone', 'Silently'],
      correctOptionId: 0,
    },
    {
      text: 'In Luke 11:1, what prompted the disciples to ask about prayer?',
      questionType: 'multiple_choice',
      options: [
        'They had watched Jesus praying',
        'They had failed to heal someone',
        'A crowd asked them to',
        'They were arguing about the law',
      ],
      correctOptionId: 0,
    },
    {
      text:
        'In Matthew 6:6, Jesus tells his hearers to shut the door because ' +
        'praying in public is forbidden.',
      questionType: 'true_false',
      correctOptionId: 1,
      explanation:
        'False. He removes the audience, not the practice — Jesus prayed in ' +
        'public Himself.',
    },
    {
      text: 'Which of these does 2 Timothy 3:16 NOT list as a use of Scripture?',
      questionType: 'multiple_choice',
      options: ['Entertainment', 'Teaching', 'Correcting', 'Rebuking'],
      correctOptionId: 0,
    },
    {
      text:
        'Psalm 119:105 promises that God’s word lights up the entire road ' +
        'ahead at once.',
      questionType: 'true_false',
      correctOptionId: 1,
      explanation:
        'False. "A lamp for my feet" — it shows the next step. Enough light to ' +
        'walk by, not enough to remove trust.',
    },
    {
      text: 'What danger does James 1:22 warn about for listeners only?',
      questionType: 'multiple_choice',
      options: [
        'Deceiving themselves',
        'Losing their salvation',
        'Being disliked',
        'Forgetting the words',
      ],
      correctOptionId: 0,
    },
    {
      text:
        'In John 15:5, bearing fruit is what attaches the branch to the vine in ' +
        'the first place.',
      questionType: 'true_false',
      correctOptionId: 1,
      explanation:
        'False. The branch bears fruit because it remains in the vine. The ' +
        'relationship comes first; the fruit is evidence of it.',
    },
    {
      text: 'According to 1 John 1:7, walking in the light leads to what?',
      questionType: 'multiple_choice',
      options: [
        'Fellowship with one another',
        'A life without difficulty',
        'Solitary devotion',
        'Freedom from correction',
      ],
      correctOptionId: 0,
    },
    {
      text:
        'Habakkuk 3:17-18 models what response to a season when everything has ' +
        'failed?',
      questionType: 'multiple_choice',
      options: [
        'Naming the loss honestly, then rejoicing in God anyway',
        'Denying that anything is wrong',
        'Waiting silently for restoration',
        'Withdrawing from worship until it passes',
      ],
      correctOptionId: 0,
      explanation:
        '"Yet I will rejoice in the LORD." The facts are not denied; they are ' +
        'simply not the last word.',
    },
  ],
};

function connect() {
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
  return getFirestore();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = connect();

  // The prerequisite must exist and be published, or the course advertises a
  // requirement nobody can meet.
  const prereq = await db.collection('courses').doc(PREREQUISITE_ID).get();
  if (!prereq.exists) {
    throw new Error(`Prerequisite course "${PREREQUISITE_ID}" does not exist.`);
  }
  if (prereq.data().status !== 'published') {
    throw new Error(
      `Prerequisite "${PREREQUISITE_ID}" is ${prereq.data().status}, not published.`,
    );
  }

  const existing = await db.collection('courses').doc(COURSE_ID).get();

  console.log(`course:        ${COURSE_ID} (${existing.exists ? 'OVERWRITE' : 'new'})`);
  console.log(`prerequisite:  ${PREREQUISITE_ID} — "${prereq.data().title}"`);
  console.log(`category:      ${COURSE.categoryId}`);
  console.log(`lessons:       ${LESSONS.length}`);
  console.log(`final quiz:    course-${COURSE_ID} (${FINAL_QUIZ.questions.length} questions)`);

  if (!apply) {
    console.log('\nDry run. Pass --apply to write.');
    return;
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  const courseRef = db.collection('courses').doc(COURSE_ID);

  // Draft first; published at the end, once the lessons and quiz exist.
  batch.set(courseRef, {
    ...COURSE,
    lessonCount: LESSONS.length,
    status: 'draft',
    createdAt: now,
  });

  for (const lesson of LESSONS) {
    const { id, ...fields } = lesson;
    batch.set(courseRef.collection('lessons').doc(id), {
      ...fields,
      hasQuiz: false,
      status: 'draft',
      createdAt: now,
    });
  }

  const quizId = `course-${COURSE_ID}`;
  const quizRef = db.collection('quizzes').doc(quizId);
  batch.set(quizRef, {
    title: FINAL_QUIZ.title,
    lowerCaseTitle: FINAL_QUIZ.title.toLowerCase(),
    description: FINAL_QUIZ.description,
    categoryId: 'course',
    ageGroup: 'all',
    dificultyLevel: FINAL_QUIZ.dificultyLevel,
    kind: 'course',
    isPublished: true,
    createdAt: now,
  });

  FINAL_QUIZ.questions.forEach((q, i) => {
    const qid = `q${String(i + 1).padStart(2, '0')}`;
    batch.set(quizRef.collection('questions').doc(qid), {
      id: qid,
      quizId,
      order: i + 1,
      ...q,
    });
  });

  // Without this the quiz card renders NaN / 0 questions.
  batch.set(quizRef.collection('meta').doc('stat'), {
    quizId,
    numberOfQuestions: FINAL_QUIZ.questions.length,
    totalNumberOfTrials: 0,
    averageScore: 0,
    updatedAt: now,
  });

  await batch.commit();

  const publish = db.batch();
  LESSONS.forEach((l) =>
    publish.update(courseRef.collection('lessons').doc(l.id), {
      status: 'published',
    }),
  );
  publish.update(courseRef, { status: 'published' });
  await publish.commit();

  console.log(`\nSeeded and published "${COURSE.title}" as ${COURSE_ID}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});