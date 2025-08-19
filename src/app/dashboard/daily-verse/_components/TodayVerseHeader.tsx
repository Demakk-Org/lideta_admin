"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";

type Props = {
  onAdd: () => void;
};

export default function TodayVerseHeader({ onAdd }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-primary-800">Daily Bible Verse</h1>
        <p className="text-sm text-primary-700">Add, edit, or remove daily verses.</p>
      </div>
      <AppButton variant={AppButtonVariant.Add} onClick={onAdd}>
        Add Verse
      </AppButton>
    </div>
  );
}
