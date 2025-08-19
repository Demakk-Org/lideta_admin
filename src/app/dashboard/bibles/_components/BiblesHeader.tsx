"use client";

import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";

type Props = {
  onAdd: () => void;
};

export default function BiblesHeader({ onAdd }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-primary-800">Bibles</h1>
        <p className="text-sm text-primary-700">Manage Bible sources.</p>
      </div>
      <AppButton
        variant={AppButtonVariant.Add}
        onClick={() => {
          onAdd();
        }}
      >
        Add Bible
      </AppButton>
    </div>
  );
}
