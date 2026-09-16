"use client";

export type VerseView = "calendar" | "list";

type Props = {
  view: VerseView;
  onViewChange: (view: VerseView) => void;
};

export default function TodayVerseHeader({ view, onViewChange }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-primary-800">Daily Bible Verse</h1>
        <p className="text-sm text-primary-700">Add, edit, or remove daily verses.</p>
      </div>

      <div className="inline-flex overflow-hidden rounded-md border border-primary-200">
        {(["calendar", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={`px-4 py-1.5 text-sm font-medium capitalize ${
              view === v
                ? "bg-gray-900 text-white"
                : "bg-white/60 text-primary-800 hover:bg-primary-50"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
