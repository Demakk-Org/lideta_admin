/**
 * The feature switches the mobile app reads from `app_settings/published`.
 *
 * Admins edit numbered versions in `app_settings/published/versions/{n}` and
 * publish one; publishing copies its `features` into the published document.
 * The app never reads the versions.
 *
 * This is the single source of truth for both the admin page and
 * `scripts/seed-app-settings.mjs`, so the two can't drift apart. The seed
 * imports this file directly through Node's type stripping, which is why it
 * must stay import-free and use only erasable TypeScript (no enums).
 *
 * The app treats a missing key, or a non-boolean value, as DISABLED. Adding a
 * key here does nothing for users until the seed has written it as `true`.
 *
 * Keys must match `FeatureKey` in the mobile app, and `dependsOn` its
 * `requires`: the app treats a feature as off while anything it depends on is
 * off. Core parts (Bible reader and search, worship, account) have no key.
 */

export type FeatureGroup =
  | 'scripture'
  | 'community'
  | 'media'
  | 'engagement'
  | 'app';

export type FeatureDefinition = {
  key: string;
  label: string;
  labelAm: string;
  description: string;
  group: FeatureGroup;
  /** Features that must be on for this one to work. */
  dependsOn: readonly string[];
};

export const FEATURE_GROUPS: ReadonlyArray<{
  key: FeatureGroup;
  label: string;
  labelAm: string;
}> = [
  { key: 'scripture', label: 'Scripture', labelAm: 'መጽሐፍ ቅዱስ' },
  { key: 'community', label: 'Community', labelAm: 'ኅብረት' },
  { key: 'media', label: 'Media & content', labelAm: 'ሚዲያ እና ይዘት' },
  { key: 'engagement', label: 'Engagement', labelAm: 'ተሳትፎ' },
  { key: 'app', label: 'App', labelAm: 'መተግበሪያ' },
];

export const FEATURES = [
  // Scripture. The Bible reader and its search are core and can't be turned off.
  {
    key: 'bookmarks',
    label: 'Bookmarks',
    labelAm: 'የተቀመጡ ጥቅሶች',
    description: 'Bookmarking verses and the saved bookmarks screen.',
    group: 'scripture',
    dependsOn: [],
  },
  {
    key: 'dailyVerse',
    label: 'Daily verse',
    labelAm: 'የዕለቱ ጥቅስ',
    description: 'Daily verse card on the home screen.',
    group: 'scripture',
    dependsOn: [],
  },

  // Community
  {
    key: 'bibleStudy',
    label: 'Bible study',
    labelAm: 'የመጽሐፍ ቅዱስ ጥናት',
    description: 'Bible study groups: Group tab, group list and detail.',
    group: 'community',
    dependsOn: [],
  },
  {
    key: 'chat',
    label: 'Study group chat',
    labelAm: 'የጥናት ቡድን ውይይት',
    description: 'Chat inside a bible study group.',
    group: 'community',
    dependsOn: ['bibleStudy'],
  },
  {
    key: 'voiceChat',
    label: 'Voice messages',
    labelAm: 'የድምፅ መልዕክቶች',
    description: 'Voice messages in study group chat.',
    group: 'community',
    dependsOn: ['bibleStudy', 'chat'],
  },
  {
    key: 'studyQuiz',
    label: 'Study quizzes',
    labelAm: 'የጥናት ጥያቄዎች',
    description: 'Quizzes inside a bible study.',
    group: 'community',
    dependsOn: ['bibleStudy'],
  },
  {
    key: 'meetingSummary',
    label: 'Meeting summaries',
    labelAm: 'የስብሰባ ማጠቃለያዎች',
    description: 'Meeting summaries inside a bible study.',
    group: 'community',
    dependsOn: ['bibleStudy'],
  },

  // Media & content
  {
    key: 'news',
    label: 'News',
    labelAm: 'ዜና',
    description: 'News carousel and news reader.',
    group: 'media',
    dependsOn: [],
  },
  {
    key: 'events',
    label: 'Events',
    labelAm: 'ዝግጅቶች',
    description: 'Events list and event detail.',
    group: 'media',
    dependsOn: [],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    labelAm: 'የቀን መቁጠሪያ',
    description: 'Events calendar screen.',
    group: 'media',
    dependsOn: ['events'],
  },
  {
    key: 'audios',
    label: 'Audios',
    labelAm: 'ድምፆች',
    description: 'Audio list and player.',
    group: 'media',
    dependsOn: [],
  },
  {
    key: 'videos',
    label: 'Videos',
    labelAm: 'ቪዲዮዎች',
    description: 'Videos list and player.',
    group: 'media',
    dependsOn: [],
  },
  {
    key: 'books',
    label: 'Books',
    labelAm: 'መጻሕፍት',
    description: 'Books list and detail.',
    group: 'media',
    dependsOn: [],
  },

  // Engagement
  {
    key: 'quiz',
    label: 'Quiz',
    labelAm: 'ጥያቄዎች',
    description: 'Quiz tab and quiz catalog.',
    group: 'engagement',
    dependsOn: [],
  },
  {
    key: 'dailyQuiz',
    label: 'Daily quiz',
    labelAm: 'የዕለቱ ጥያቄ',
    description: 'Daily quiz section and its reminders.',
    group: 'engagement',
    dependsOn: ['dailyVerse'],
  },
  {
    key: 'streak',
    label: 'Streak',
    labelAm: 'ተከታታይ ቀናት',
    description: 'Streak badge, streak details, freezes and restore.',
    group: 'engagement',
    dependsOn: ['dailyVerse'],
  },

  // App
  {
    key: 'notifications',
    label: 'Notifications',
    labelAm: 'ማሳወቂያዎች',
    description: 'In-app notifications screen and bell.',
    group: 'app',
    dependsOn: [],
  },
  {
    key: 'tutorial',
    label: 'Tutorial',
    labelAm: 'መማሪያ',
    description: 'First-run tutorial tour.',
    group: 'app',
    dependsOn: [],
  },
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURES)[number]['key'];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((f) => f.key);

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

export function getFeature(key: FeatureKey): FeatureDefinition {
  return FEATURES.find((f) => f.key === key) as FeatureDefinition;
}

export const APP_SETTINGS_COLLECTION = 'app_settings';
/** The only document the app reads. */
export const APP_SETTINGS_PUBLISHED_DOC_ID = 'published';
/** Drafts and past versions, under the published document. Doc id = version number. */
export const APP_SETTINGS_VERSIONS_COLLECTION = 'versions';
/** Append-only publish log, under the published document. */
export const APP_SETTINGS_HISTORY_COLLECTION = 'history';
/** Pre-versioning single document; the seed imports it as version 1. */
export const APP_SETTINGS_LEGACY_DOC_ID = 'default';
