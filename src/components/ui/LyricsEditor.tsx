"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";

export type LyricLine = { text: string; time: string };

type Props = {
  value: LyricLine[];
  onChange: (next: LyricLine[]) => void;
  title?: string;
  disabled?: boolean;
};

/** Simple {text, time} line editor shared by the Audios and Videos forms. */
export default function LyricsEditor({ value, onChange, title = "Lyrics", disabled }: Props) {
  const addLine = () => onChange([...value, { text: "", time: "" }]);
  const updateLine = (idx: number, patch: Partial<LyricLine>) =>
    onChange(value.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeLine = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-primary-800">{title}</h4>
        <AppButton type="button" variant={AppButtonVariant.Edit} onClick={addLine} disabled={disabled}>
          Add line
        </AppButton>
      </div>
      <div className="mt-3 space-y-3">
        {value.map((l, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:col-span-7"
              placeholder="Text"
              value={l.text}
              onChange={(e) => updateLine(idx, { text: e.target.value })}
              disabled={disabled}
            />
            <input
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:col-span-3"
              placeholder="mm:ss"
              value={l.time}
              onChange={(e) => updateLine(idx, { time: e.target.value })}
              disabled={disabled}
            />
            <div className="sm:col-span-2 flex sm:justify-end">
              <AppButton
                type="button"
                variant={AppButtonVariant.Delete}
                onClick={() => removeLine(idx)}
                disabled={disabled}
                className="min-w-[110px] whitespace-nowrap"
              >
                Remove
              </AppButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
