type VerseMap = Map<string, string>;

let cachePromise: Promise<VerseMap> | null = null;

const key = (book: number, chapter: number, verse: number) =>
  `${book}|${chapter}|${verse}`;

type AmharicBibleJson = {
  books: Array<{
    chapters: Array<{
      chapter: string | number;
      verses: string[];
    }>;
  }>;
};

function normalize(raw: AmharicBibleJson): VerseMap {
  const map: VerseMap = new Map();
  raw.books.forEach((b, bi) => {
    const bookNum = bi + 1;
    b.chapters.forEach((ch) => {
      const chapterNum = Number(ch.chapter);
      if (Number.isNaN(chapterNum) || !Array.isArray(ch.verses)) return;
      ch.verses.forEach((text, vi) => {
        map.set(key(bookNum, chapterNum, vi + 1), text);
      });
    });
  });
  return map;
}

async function loadVerseMap(): Promise<VerseMap> {
  if (!cachePromise) {
    cachePromise = (async () => {
      const resp = await fetch('/bibles/am.json');
      if (!resp.ok) throw new Error(`Failed to load /bibles/am.json: ${resp.status}`);
      const raw = (await resp.json()) as AmharicBibleJson;
      return normalize(raw);
    })().catch((err) => {
      cachePromise = null;
      throw err;
    });
  }
  return cachePromise;
}

export async function getVerseText(
  book: number,
  chapter: number,
  verse: number,
): Promise<string> {
  const map = await loadVerseMap();
  return map.get(key(book, chapter, verse)) ?? '';
}
