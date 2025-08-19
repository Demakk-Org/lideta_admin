import { NextResponse } from "next/server";

// Returns a mapping of 1-based book index -> array of verse counts per chapter
export async function GET() {
  try {
    const source =
      "https://raw.githubusercontent.com/bkuhl/bible-verse-counts-per-chapter/master/bible.json";
    const resp = await fetch(source, { next: { revalidate: 86400 } }); // revalidate daily
    if (!resp.ok) {
      return NextResponse.json(
        { error: "Failed to fetch verse counts" },
        { status: 502 }
      );
    }
    const data: Array<{
      book: string;
      chapters: Array<{ chapter: string; verses: string }>;
    }> = await resp.json();

    const mapping: Record<number, number[]> = {};
    data.forEach((b, i) => {
      mapping[i + 1] = b.chapters.map((c) => parseInt(c.verses, 10));
    });

    return NextResponse.json(mapping);
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
