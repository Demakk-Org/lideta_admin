export type VerseForm = {
  book: string;
  chapter: string;
  verse: string;
  reference: string;
  text: string;
  tag: string;
  status: string; // e.g., active/inactive
  day: string;
  month: string; // EC month 1-13
  year: string;

  // Optional verse range (DailyVerseSection). All blank when disabled.
  sectionEnabled: boolean;
  sectionFromBook: string;
  sectionFromChapter: string;
  sectionFromVerse: string;
  sectionToBook: string;
  sectionToChapter: string;
  sectionToVerse: string;
};
