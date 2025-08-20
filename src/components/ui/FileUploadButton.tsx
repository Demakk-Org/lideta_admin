"use client";

import { useRef } from "react";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";

type Props = {
  label: string;
  accept?: string;
  onSelect: (file: File) => void;
  disabled?: boolean;
  variant?: AppButtonVariant;
  className?: string;
};

export default function FileUploadButton({ label, accept, onSelect, disabled, variant = AppButtonVariant.Add, className }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          // reset so selecting the same file twice still triggers change
          e.currentTarget.value = "";
        }}
      />
      <AppButton type="button" onClick={handleClick} variant={variant}>
        <span className="inline-flex items-center gap-2">
          <UploadIcon className="h-4 w-4" />
          <span>{label}</span>
        </span>
      </AppButton>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 5 17 10" />
      <line x1="12" y1="5" x2="12" y2="21" />
    </svg>
  );
}
