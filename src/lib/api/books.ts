export type BibleBook = { index: number; name: string };

// English names (kept for compatibility; UI can swap to Amharic later)
export const bibleBooks: BibleBook[] = [
  { index: 1, name: 'Genesis' },
  { index: 2, name: 'Exodus' },
  { index: 3, name: 'Leviticus' },
  { index: 4, name: 'Numbers' },
  { index: 5, name: 'Deuteronomy' },
  { index: 6, name: 'Joshua' },
  { index: 7, name: 'Judges' },
  { index: 8, name: 'Ruth' },
  { index: 9, name: '1 Samuel' },
  { index: 10, name: '2 Samuel' },
  { index: 11, name: '1 Kings' },
  { index: 12, name: '2 Kings' },
  { index: 13, name: '1 Chronicles' },
  { index: 14, name: '2 Chronicles' },
  { index: 15, name: 'Ezra' },
  { index: 16, name: 'Nehemiah' },
  { index: 17, name: 'Esther' },
  { index: 18, name: 'Job' },
  { index: 19, name: 'Psalms' },
  { index: 20, name: 'Proverbs' },
  { index: 21, name: 'Ecclesiastes' },
  { index: 22, name: 'Song of Solomon' },
  { index: 23, name: 'Isaiah' },
  { index: 24, name: 'Jeremiah' },
  { index: 25, name: 'Lamentations' },
  { index: 26, name: 'Ezekiel' },
  { index: 27, name: 'Daniel' },
  { index: 28, name: 'Hosea' },
  { index: 29, name: 'Joel' },
  { index: 30, name: 'Amos' },
  { index: 31, name: 'Obadiah' },
  { index: 32, name: 'Jonah' },
  { index: 33, name: 'Micah' },
  { index: 34, name: 'Nahum' },
  { index: 35, name: 'Habakkuk' },
  { index: 36, name: 'Zephaniah' },
  { index: 37, name: 'Haggai' },
  { index: 38, name: 'Zechariah' },
  { index: 39, name: 'Malachi' },
  { index: 40, name: 'Matthew' },
  { index: 41, name: 'Mark' },
  { index: 42, name: 'Luke' },
  { index: 43, name: 'John' },
  { index: 44, name: 'Acts' },
  { index: 45, name: 'Romans' },
  { index: 46, name: '1 Corinthians' },
  { index: 47, name: '2 Corinthians' },
  { index: 48, name: 'Galatians' },
  { index: 49, name: 'Ephesians' },
  { index: 50, name: 'Philippians' },
  { index: 51, name: 'Colossians' },
  { index: 52, name: '1 Thessalonians' },
  { index: 53, name: '2 Thessalonians' },
  { index: 54, name: '1 Timothy' },
  { index: 55, name: '2 Timothy' },
  { index: 56, name: 'Titus' },
  { index: 57, name: 'Philemon' },
  { index: 58, name: 'Hebrews' },
  { index: 59, name: 'James' },
  { index: 60, name: '1 Peter' },
  { index: 61, name: '2 Peter' },
  { index: 62, name: '1 John' },
  { index: 63, name: '2 John' },
  { index: 64, name: '3 John' },
  { index: 65, name: 'Jude' },
  { index: 66, name: 'Revelation' },
];

export function listBibleBooks(): BibleBook[] {
  return bibleBooks;
}

// Backwards-compatible export expected by existing slices
export function listBooks(): BibleBook[] {
  return bibleBooks;
}

// Amharic names from WordProject (ordered 1..66)
export const bibleBooksAmharic: BibleBook[] = [
  { index: 1, name: 'ኦሪት ዘፍጥረት' },
  { index: 2, name: 'ኦሪት ዘጸአት' },
  { index: 3, name: 'ኦሪት ዘሌዋውያን' },
  { index: 4, name: 'ኦሪት ዘኍልቍ' },
  { index: 5, name: 'ኦሪት ዘዳግም' },
  { index: 6, name: 'መጽሐፈ ኢያሱ ወልደ ነዌ' },
  { index: 7, name: 'መጽሐፈ መሣፍንት' },
  { index: 8, name: 'መጽሐፈ ሩት' },
  { index: 9, name: 'መጽሐፈ ሳሙኤል ቀዳማዊ' },
  { index: 10, name: 'መጽሐፈ ሳሙኤል ካል' },
  { index: 11, name: 'መጽሐፈ ነገሥት ቀዳማዊ' },
  { index: 12, name: 'መጽሐፈ ነገሥት ካልዕ' },
  { index: 13, name: 'መጽሐፈ ዜና መዋዕል ቀዳማዊ' },
  { index: 14, name: 'መጽሐፈ ዜና መዋዕል ካልዕ' },
  { index: 15, name: 'መጽሐፈ ዕዝራ' },
  { index: 16, name: 'መጽሐፈ ነህምያ' },
  { index: 17, name: 'መጽሐፈ አስቴር' },
  { index: 18, name: 'መጽሐፈ ኢዮብ' },
  { index: 19, name: 'መዝሙረ ዳዊት' },
  { index: 20, name: 'መጽሐፈ ምሳሌ' },
  { index: 21, name: 'መጽሐፈ መክብብ' },
  { index: 22, name: 'መኃልየ መኃልይ ዘሰሎሞን' },
  { index: 23, name: 'ትንቢተ ኢሳይያስ' },
  { index: 24, name: 'ትንቢተ ኤርምያስ' },
  { index: 25, name: 'ሰቆቃው ኤርምያስ' },
  { index: 26, name: 'ትንቢተ ሕዝቅኤል' },
  { index: 27, name: 'ትንቢተ ዳንኤል' },
  { index: 28, name: 'ትንቢተ ሆሴዕ' },
  { index: 29, name: 'ትንቢተ ኢዮኤል' },
  { index: 30, name: 'ትንቢተ አሞጽ' },
  { index: 31, name: 'ትንቢተ አብድዩ' },
  { index: 32, name: 'ትንቢተ ዮናስ' },
  { index: 33, name: 'ትንቢተ ሚክያስ' },
  { index: 34, name: 'ትንቢተ ናሆም' },
  { index: 35, name: 'ትንቢተ ዕንባቆም' },
  { index: 36, name: 'ትንቢተ ሶፎንያስ' },
  { index: 37, name: 'ትንቢተ ሐጌ' },
  { index: 38, name: 'ትንቢተ ዘካርያስ' },
  { index: 39, name: 'ትንቢተ ሚልክያ' },
  { index: 40, name: 'የማቴዎስ ወንጌል' },
  { index: 41, name: 'የማርቆስ ወንጌል' },
  { index: 42, name: 'የሉቃስ ወንጌል' },
  { index: 43, name: 'የዮሐንስ ወንጌል' },
  { index: 44, name: 'የሐዋርያት ሥራ' },
  { index: 45, name: 'ወደ ሮሜ ሰዎች' },
  { index: 46, name: '1ኛ ወደ ቆሮንቶስ ሰዎች' },
  { index: 47, name: '2ኛ ወደ ቆሮንቶስ ሰዎች' },
  { index: 48, name: 'ወደ ገላትያ ሰዎች' },
  { index: 49, name: 'ወደ ኤፌሶን ሰዎች' },
  { index: 50, name: 'ወደ ፊልጵስዩስ ሰዎች' },
  { index: 51, name: 'ወደ ቆላስይስ ሰዎች' },
  { index: 52, name: '1ኛ ወደ ተሰሎንቄ ሰዎች' },
  { index: 53, name: '2ኛ ወደ ተሰሎንቄ ሰዎች' },
  { index: 54, name: '1ኛ ወደ ጢሞቴዎስ' },
  { index: 55, name: '2ኛ ወደ ጢሞቴዎስ' },
  { index: 56, name: 'ወደ ቲቶ' },
  { index: 57, name: 'ወደ ፊልሞና' },
  { index: 58, name: 'ወደ ዕብራውያን' },
  { index: 59, name: 'የያዕቆብ መልእክት' },
  { index: 60, name: '1ኛ የጴጥሮስ መልእክት' },
  { index: 61, name: '2ኛ የጴጥሮስ መልእክት' },
  { index: 62, name: '1ኛ የዮሐንስ መልእክት' },
  { index: 63, name: '2ኛ የዮሐንስ መልእክት' },
  { index: 64, name: '3ኛ የዮሐንስ መልእክት' },
  { index: 65, name: 'የይሁዳ መልእክት' },
  { index: 66, name: 'የዮሐንስ ራእይ' },
];

export function listBibleBooksAmharic(): BibleBook[] {
  return bibleBooksAmharic;
}

// Chapter counts per book (KJV/Protestant versification)
// Index is 1-based book index as used above
export const bookChapterCounts: Record<number, number> = {
  1: 50, 2: 40, 3: 27, 4: 36, 5: 34,
  6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
  11: 22, 12: 25, 13: 29, 14: 36, 15: 10,
  16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
  21: 12, 22: 8, 23: 66, 24: 52, 25: 5,
  26: 48, 27: 12, 28: 14, 29: 3, 30: 9,
  31: 1, 32: 4, 33: 7, 34: 3, 35: 3,
  36: 3, 37: 2, 38: 14, 39: 4, 40: 28,
  41: 16, 42: 24, 43: 21, 44: 28, 45: 16,
  46: 16, 47: 13, 48: 6, 49: 6, 50: 4,
  51: 4, 52: 5, 53: 3, 54: 6, 55: 4,
  56: 3, 57: 1, 58: 13, 59: 5, 60: 5,
  61: 3, 62: 5, 63: 1, 64: 1, 65: 1,
  66: 22,
};

export function getChapterCount(bookIndex: number): number {
  return bookChapterCounts[bookIndex] ?? 0;
}

// Amharic month names for Ethiopian calendar UI
export const AMHARIC_MONTHS = [
  'መስከረም',
  'ጥቅምት',
  'ህዳር',
  'ታኅሳስ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጐሜ',
] as const;

export function isEthiopianLeapYear(ethiopianYear: number): boolean {
  // In the Ethiopian calendar, leap year occurs when year % 4 == 3
  return ethiopianYear % 4 === 3;
}
